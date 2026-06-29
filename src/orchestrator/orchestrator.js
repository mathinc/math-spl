import { EventEmitter } from 'node:events';
import { StageFailedError, StageTimeoutError } from '../errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, timeoutMs, stageName) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new StageTimeoutError(stageName, timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Drives jobs through a workflow: resolves an agent per stage, executes with
 * timeout and retry-with-backoff, records a trace, and runs compensation
 * handlers when a job fails. Emits events for observability:
 *
 *   job:start, job:complete, job:failed,
 *   stage:start, stage:complete, stage:retry, stage:failed,
 *   failure-handler:error
 *
 * Deterministic errors (error.fatal === true) are never retried.
 */
export class Orchestrator extends EventEmitter {
  constructor({ registry, workflow, retries = 2, backoffMs = 25, timeoutMs = 5000 }) {
    super();
    this.registry = registry;
    this.workflow = workflow;
    this.retries = retries;
    this.backoffMs = backoffMs;
    this.timeoutMs = timeoutMs;
  }

  async run(problem) {
    const ctx = {
      problem,
      artifacts: {},
      agents: {},
      trace: [],
      status: 'running',
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    };
    this.emit('job:start', { problem });
    for (const stage of this.workflow.stages) {
      try {
        await this.#executeStage(stage, ctx);
      } catch (error) {
        ctx.status = 'failed';
        ctx.error = error;
        ctx.finishedAt = Date.now();
        for (const handler of this.workflow.failureHandlers) {
          try {
            await handler(ctx, error);
          } catch (handlerError) {
            this.emit('failure-handler:error', { problem, error: handlerError });
          }
        }
        this.emit('job:failed', { problem, stage: stage.name, error });
        return ctx;
      }
    }
    ctx.status = 'completed';
    ctx.finishedAt = Date.now();
    this.emit('job:complete', { problem, ctx });
    return ctx;
  }

  /** Run many jobs through a bounded worker pool; results keep input order. */
  async runAll(problems, { concurrency = 4 } = {}) {
    const results = new Array(problems.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(concurrency, problems.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < problems.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await this.run(problems[index]);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async #executeStage(stage, ctx) {
    const capability =
      typeof stage.capability === 'function' ? stage.capability(ctx) : stage.capability;
    const agent = this.registry.resolve(capability);
    const maxAttempts = (stage.retries ?? this.retries) + 1;
    const timeoutMs = stage.timeoutMs ?? this.timeoutMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.emit('stage:start', { problem: ctx.problem, stage: stage.name, agent: agent.name, attempt });
      const startedAt = performance.now();
      try {
        const task = stage.task ? stage.task(ctx) : ctx;
        const result = await withTimeout(
          Promise.resolve(agent.handle(task, ctx)),
          timeoutMs,
          stage.name,
        );
        const durationMs = performance.now() - startedAt;
        ctx.trace.push({ stage: stage.name, agent: agent.name, attempt, status: 'ok', durationMs });
        ctx.agents[stage.name] = { id: agent.id, name: agent.name, address: agent.address };
        if (stage.save) ctx.artifacts[stage.save] = result;
        this.emit('stage:complete', {
          problem: ctx.problem, stage: stage.name, agent: agent.name, attempt, durationMs, result,
        });
        return result;
      } catch (error) {
        const durationMs = performance.now() - startedAt;
        ctx.trace.push({
          stage: stage.name, agent: agent.name, attempt, status: 'error', durationMs, error: error.message,
        });
        if (error.fatal !== true && attempt < maxAttempts) {
          this.emit('stage:retry', { problem: ctx.problem, stage: stage.name, agent: agent.name, attempt, error });
          await sleep(this.backoffMs * attempt);
          continue;
        }
        this.emit('stage:failed', { problem: ctx.problem, stage: stage.name, agent: agent.name, attempt, error });
        throw error instanceof StageFailedError ? error : new StageFailedError(stage.name, error);
      }
    }
  }
}
