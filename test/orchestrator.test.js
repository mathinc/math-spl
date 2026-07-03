import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { Workflow } from '../src/orchestrator/workflow.js';
import { AgentRegistry } from '../src/orchestrator/registry.js';
import { BaseAgent } from '../src/agents/base-agent.js';
import {
  StageFailedError, StageTimeoutError, UnsupportedProblemError,
} from '../src/errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class StubAgent extends BaseAgent {
  #fn;

  constructor(capability, fn) {
    super({ id: `stub.${capability}`, name: `Stub(${capability})`, capabilities: [capability] });
    this.#fn = fn;
  }

  async perform(task, ctx) {
    return this.#fn(task, ctx);
  }
}

const PROBLEM = { id: 'T-1', text: 'test' };

function build({ agents, stages, failureHandlers = [], options = {} }) {
  const registry = new AgentRegistry();
  for (const agent of agents) registry.register(agent);
  const workflow = new Workflow('test');
  for (const [name, def] of stages) workflow.stage(name, def);
  for (const handler of failureHandlers) workflow.onFailure(handler);
  return new Orchestrator({ registry, workflow, backoffMs: 1, ...options });
}

describe('orchestrator', () => {
  it('runs stages in order, saving artifacts and recording agents', async () => {
    const orchestrator = build({
      agents: [
        new StubAgent('double', ({ value }) => value * 2),
        new StubAgent('stringify', ({ value }) => `=${value}`),
      ],
      stages: [
        ['first', { capability: 'double', task: () => ({ value: 21 }), save: 'doubled' }],
        ['second', {
          capability: 'stringify',
          task: (ctx) => ({ value: ctx.artifacts.doubled }),
          save: 'text',
        }],
      ],
    });
    const ctx = await orchestrator.run(PROBLEM);
    assert.equal(ctx.status, 'completed');
    assert.equal(ctx.artifacts.doubled, 42);
    assert.equal(ctx.artifacts.text, '=42');
    assert.equal(ctx.agents.first.name, 'Stub(double)');
    assert.deepEqual(ctx.trace.map((entry) => entry.status), ['ok', 'ok']);
  });

  it('retries transient failures with backoff until success', async () => {
    let attempts = 0;
    const orchestrator = build({
      agents: [new StubAgent('flaky', () => {
        attempts += 1;
        if (attempts < 3) throw new Error('transient glitch');
        return 'finally';
      })],
      stages: [['only', { capability: 'flaky', save: 'result' }]],
      options: { retries: 2 },
    });
    const ctx = await orchestrator.run(PROBLEM);
    assert.equal(ctx.status, 'completed');
    assert.equal(ctx.artifacts.result, 'finally');
    assert.equal(attempts, 3);
    assert.deepEqual(ctx.trace.map((entry) => entry.status), ['error', 'error', 'ok']);
  });

  it('fails after exhausting retries, wrapping the cause', async () => {
    const orchestrator = build({
      agents: [new StubAgent('broken', () => {
        throw new Error('always down');
      })],
      stages: [['only', { capability: 'broken' }]],
      options: { retries: 1 },
    });
    const ctx = await orchestrator.run(PROBLEM);
    assert.equal(ctx.status, 'failed');
    assert.ok(ctx.error instanceof StageFailedError);
    assert.equal(ctx.error.stage, 'only');
    assert.equal(ctx.error.cause.message, 'always down');
    assert.equal(ctx.trace.length, 2);
  });

  it('times out slow stages', async () => {
    const orchestrator = build({
      agents: [new StubAgent('slow', () => sleep(200))],
      stages: [['only', { capability: 'slow', timeoutMs: 20 }]],
      options: { retries: 0 },
    });
    const ctx = await orchestrator.run(PROBLEM);
    assert.equal(ctx.status, 'failed');
    assert.ok(ctx.error.cause instanceof StageTimeoutError);
  });

  it('never retries fatal errors', async () => {
    let attempts = 0;
    const orchestrator = build({
      agents: [new StubAgent('fatal', () => {
        attempts += 1;
        throw new UnsupportedProblemError('cannot ever work');
      })],
      stages: [['only', { capability: 'fatal' }]],
      options: { retries: 5 },
    });
    const ctx = await orchestrator.run(PROBLEM);
    assert.equal(ctx.status, 'failed');
    assert.equal(attempts, 1);
  });

  it('runs failure handlers exactly once, with the context', async () => {
    const seen = [];
    const orchestrator = build({
      agents: [new StubAgent('fatal', () => {
        throw new UnsupportedProblemError('nope');
      })],
      stages: [['only', { capability: 'fatal' }]],
      failureHandlers: [async (ctx, error) => seen.push([ctx.problem.id, error.cause.message])],
    });
    await orchestrator.run(PROBLEM);
    assert.deepEqual(seen, [['T-1', 'nope']]);
  });

  it('fails cleanly when no agent provides a capability', async () => {
    const orchestrator = build({
      agents: [],
      stages: [['only', { capability: 'ghost' }]],
    });
    const ctx = await orchestrator.run(PROBLEM);
    assert.equal(ctx.status, 'failed');
    assert.match(ctx.error.message, /no registered agent/);
  });

  it('routes capabilities dynamically from context', async () => {
    const orchestrator = build({
      agents: [
        new StubAgent('route', () => 'solve:b'),
        new StubAgent('solve:a', () => 'wrong solver'),
        new StubAgent('solve:b', () => 'right solver'),
      ],
      stages: [
        ['plan', { capability: 'route', save: 'route' }],
        ['solve', { capability: (ctx) => ctx.artifacts.route, save: 'result' }],
      ],
    });
    const ctx = await orchestrator.run(PROBLEM);
    assert.equal(ctx.artifacts.result, 'right solver');
  });

  it('runAll respects concurrency limits and preserves order', async () => {
    let active = 0;
    let peak = 0;
    const orchestrator = build({
      agents: [new StubAgent('work', async ({ id }) => {
        active += 1;
        peak = Math.max(peak, active);
        await sleep(15);
        active -= 1;
        return id;
      })],
      stages: [['only', { capability: 'work', task: (ctx) => ({ id: ctx.problem.id }), save: 'id' }]],
    });
    const problems = Array.from({ length: 6 }, (_, i) => ({ id: `J-${i}` }));
    const results = await orchestrator.runAll(problems, { concurrency: 2 });
    assert.deepEqual(results.map((ctx) => ctx.artifacts.id), problems.map((p) => p.id));
    assert.ok(peak <= 2, `peak concurrency was ${peak}`);
    assert.ok(peak >= 2, 'expected the pool to actually run in parallel');
  });

  it('emits lifecycle events', async () => {
    const events = [];
    const orchestrator = build({
      agents: [new StubAgent('ok', () => 1)],
      stages: [['only', { capability: 'ok' }]],
    });
    for (const name of ['job:start', 'stage:start', 'stage:complete', 'job:complete']) {
      orchestrator.on(name, () => events.push(name));
    }
    await orchestrator.run(PROBLEM);
    assert.deepEqual(events, ['job:start', 'stage:start', 'stage:complete', 'job:complete']);
  });
});
