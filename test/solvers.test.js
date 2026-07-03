import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ParserAgent } from '../src/agents/parser-agent.js';
import { PlannerAgent } from '../src/agents/planner-agent.js';
import { ArithmeticSolver } from '../src/agents/solvers/arithmetic-solver.js';
import { AlgebraSolver } from '../src/agents/solvers/algebra-solver.js';
import { NumberTheorySolver } from '../src/agents/solvers/number-theory-solver.js';
import { StatisticsSolver } from '../src/agents/solvers/statistics-solver.js';
import { VerifierAgent } from '../src/agents/verifier-agent.js';
import {
  MathParseError, UnsupportedProblemError, VerificationError,
} from '../src/errors.js';

const parser = new ParserAgent();
const planner = new PlannerAgent();
const arithmetic = new ArithmeticSolver();
const algebra = new AlgebraSolver();
const numberTheory = new NumberTheorySolver();
const statistics = new StatisticsSolver();
const verifier = new VerifierAgent();

async function solve(text) {
  const parsed = await parser.perform({ text });
  const plan = await planner.perform({ parsed });
  const solver = {
    'solve:arithmetic': arithmetic,
    'solve:algebra': algebra,
    'solve:number-theory': numberTheory,
    'solve:statistics': statistics,
  }[plan.solverCapability];
  const solution = await solver.perform({ parsed });
  return { parsed, plan, solution };
}

describe('parser agent (Lexis)', () => {
  it('parses every directive kind', async () => {
    assert.equal((await parser.perform({ text: 'evaluate: 1 + 1' })).kind, 'evaluate');
    assert.equal((await parser.perform({ text: 'solve: x = 1' })).kind, 'solve');
    assert.deepEqual(
      await parser.perform({ text: 'gcd: 12, 18' }),
      { kind: 'gcd', a: 12n, b: 18n },
    );
    assert.equal((await parser.perform({ text: 'fibonacci: 10' })).n, 10n);
    assert.deepEqual((await parser.perform({ text: 'stats: 1, 2.5, -3' })).values, [1, 2.5, -3]);
  });

  it('detects the equation variable', async () => {
    const parsed = await parser.perform({ text: 'solve: 3t + 1 = 7' });
    assert.equal(parsed.variable, 't');
  });

  it('rejects malformed problems', async () => {
    await assert.rejects(parser.perform({ text: 'no directive here' }), MathParseError);
    await assert.rejects(parser.perform({ text: 'conjecture: everything' }), UnsupportedProblemError);
    await assert.rejects(parser.perform({ text: 'solve: x = 1 = 2' }), MathParseError);
    await assert.rejects(parser.perform({ text: 'solve: x + y = 3' }), UnsupportedProblemError);
    await assert.rejects(parser.perform({ text: 'gcd: 12' }), MathParseError);
    await assert.rejects(parser.perform({ text: 'gcd: 12, 1.5' }), MathParseError);
    await assert.rejects(parser.perform({ text: 'stats: 1, banana' }), MathParseError);
  });
});

describe('planner agent (Strategos)', () => {
  it('routes each kind to the owning solver', async () => {
    assert.equal(
      (await planner.perform({ parsed: { kind: 'evaluate' } })).solverCapability,
      'solve:arithmetic',
    );
    assert.equal(
      (await planner.perform({ parsed: { kind: 'fibonacci' } })).solverCapability,
      'solve:number-theory',
    );
    await assert.rejects(planner.perform({ parsed: { kind: 'unknown' } }), UnsupportedProblemError);
  });
});

describe('algebra solver (Vieta)', () => {
  it('solves linear equations', async () => {
    const { solution } = await solve('solve: 2x + 3 = 11');
    assert.equal(solution.form, 'roots');
    assert.deepEqual(solution.roots, [{ re: 4, im: 0 }]);
    assert.equal(solution.display, 'x = 4');
  });

  it('solves quadratics with real roots', async () => {
    const { solution } = await solve('solve: x^2 - 5x + 6 = 0');
    assert.deepEqual(solution.roots, [{ re: 2, im: 0 }, { re: 3, im: 0 }]);
  });

  it('collapses a double root', async () => {
    const { solution } = await solve('solve: x^2 - 4x + 4 = 0');
    assert.deepEqual(solution.roots, [{ re: 2, im: 0 }]);
  });

  it('finds complex conjugate roots', async () => {
    const { solution } = await solve('solve: x^2 + 2x + 5 = 0');
    assert.deepEqual(solution.roots, [{ re: -1, im: -2 }, { re: -1, im: 2 }]);
    assert.equal(solution.display, 'x = -1 - 2i, x = -1 + 2i');
  });

  it('recognizes identities and contradictions', async () => {
    assert.equal((await solve('solve: x + x = 2x')).solution.form, 'identity');
    assert.equal((await solve('solve: x = x + 1')).solution.form, 'none');
    assert.equal((await solve('solve: 1 + 1 = 2')).solution.form, 'identity');
  });

  it('refuses degree three and above', async () => {
    await assert.rejects(solve('solve: x^3 - 1 = 0'), UnsupportedProblemError);
  });
});

describe('number-theory solver (Eratosthenes)', () => {
  it('computes gcd and lcm', async () => {
    assert.equal((await solve('gcd: 252, 105')).solution.value, 21n);
    assert.equal((await solve('gcd: 0, 5')).solution.value, 5n);
    assert.equal((await solve('gcd: -12, 18')).solution.value, 6n);
    assert.equal((await solve('lcm: 4, 6')).solution.value, 12n);
    assert.equal((await solve('lcm: 0, 7')).solution.value, 0n);
  });

  it('tests primality', async () => {
    assert.equal((await solve('is-prime: 104729')).solution.value, true);
    assert.equal((await solve('is-prime: 104730')).solution.value, false);
    assert.equal((await solve('is-prime: 1')).solution.value, false);
    assert.equal((await solve('is-prime: 2')).solution.value, true);
  });

  it('factorizes integers', async () => {
    const { solution } = await solve('prime-factors: 5040');
    assert.deepEqual(solution.factors, [
      { prime: 2n, exponent: 4n },
      { prime: 3n, exponent: 2n },
      { prime: 5n, exponent: 1n },
      { prime: 7n, exponent: 1n },
    ]);
    assert.equal(solution.display, '5040 = 2^4 * 3^2 * 5 * 7');
  });

  it('computes large Fibonacci numbers exactly', async () => {
    assert.equal((await solve('fibonacci: 0')).solution.value, 0n);
    assert.equal((await solve('fibonacci: 10')).solution.value, 55n);
    assert.equal((await solve('fibonacci: 90')).solution.value, 2880067194370816120n);
  });
});

describe('arithmetic and statistics solvers', () => {
  it('evaluates expressions (Abacus)', async () => {
    const { solution } = await solve('evaluate: (3 + 4) * 2^3 - sqrt(144)');
    assert.equal(solution.value, 44);
    assert.equal(solution.display, '(3 + 4) * 2^3 - sqrt(144) = 44');
  });

  it('summarizes samples (Gauss)', async () => {
    const { solution } = await solve('stats: 4, 8, 15, 16, 23, 42');
    assert.equal(solution.summary.count, 6);
    assert.equal(solution.summary.sum, 108);
    assert.equal(solution.summary.mean, 18);
    assert.equal(solution.summary.median, 15.5);
    assert.deepEqual(solution.summary.mode, []);
    assert.equal(solution.summary.min, 4);
    assert.equal(solution.summary.max, 42);
  });

  it('finds modes when they exist', async () => {
    const { solution } = await solve('stats: 1, 2, 2, 3, 3, 4');
    assert.deepEqual(solution.summary.mode, [2, 3]);
  });
});

describe('verifier agent (Skeptic)', () => {
  const KINDS = [
    'evaluate: 2^10 - 24',
    'solve: 2x + 3 = 11',
    'solve: x^2 + 2x + 5 = 0',
    'solve: x + x = 2x',
    'solve: x = x + 1',
    'gcd: 252, 105',
    'lcm: 4, 6',
    'is-prime: 104729',
    'prime-factors: 5040',
    'fibonacci: 90',
    'stats: 4, 8, 15, 16, 23, 42',
  ];

  it('confirms every honest solution', async () => {
    for (const text of KINDS) {
      const { parsed, solution } = await solve(text);
      const verdict = await verifier.perform({ parsed, solution });
      assert.equal(verdict.valid, true, `verifier rejected honest solution for "${text}"`);
    }
  });

  it('rejects a tampered evaluation', async () => {
    const { parsed, solution } = await solve('evaluate: 2 + 2');
    await assert.rejects(
      verifier.perform({ parsed, solution: { ...solution, value: 5 } }),
      VerificationError,
    );
  });

  it('rejects tampered roots', async () => {
    const { parsed, solution } = await solve('solve: 2x + 3 = 11');
    await assert.rejects(
      verifier.perform({ parsed, solution: { ...solution, roots: [{ re: 5, im: 0 }] } }),
      VerificationError,
    );
  });

  it('rejects a tampered factorization', async () => {
    const { parsed, solution } = await solve('prime-factors: 5040');
    const forged = solution.factors.map((f) => ({ ...f }));
    forged[0].exponent = 5n;
    await assert.rejects(
      verifier.perform({ parsed, solution: { ...solution, factors: forged } }),
      VerificationError,
    );
  });

  it('rejects a tampered bigint result', async () => {
    const { parsed, solution } = await solve('fibonacci: 90');
    await assert.rejects(
      verifier.perform({ parsed, solution: { ...solution, value: solution.value + 1n } }),
      VerificationError,
    );
  });
});
