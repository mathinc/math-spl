import { BaseAgent } from './base-agent.js';
import { evaluate, formatNumber } from '../math/evaluator.js';
import { compileToRpn, runRpn } from '../math/rpn.js';
import { polyEvalComplex, cAbs } from '../math/complex.js';
import {
  binaryGcd, isPrimeSlow, fibonacciIterative,
} from '../math/number-theory.js';
import { describeIndependently } from '../math/statistics.js';
import { VerificationError, UnsupportedProblemError } from '../errors.js';

const TOLERANCE = 1e-9;
const SAMPLE_POINTS = [-3, 0.5, 7];

const approxEqual = (a, b) =>
  Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Skeptic re-derives every answer through a structurally different path
 * before it is allowed anywhere near a payout:
 *
 *   evaluate       -> RPN stack machine instead of the tree-walking evaluator
 *   solve          -> substitute real roots into the original equation;
 *                     complex roots go through a complex Horner evaluation
 *   gcd            -> Stein's binary GCD instead of Euclid
 *   lcm            -> a/gcd*b with the binary GCD
 *   is-prime       -> naive odd trial division instead of 6k±1
 *   prime-factors  -> multiply the factors back and re-check each for primality
 *   fibonacci      -> plain iteration instead of fast doubling
 *   stats          -> alternative formulations of every statistic
 */
export class VerifierAgent extends BaseAgent {
  constructor() {
    super({ id: 'agent.verifier', name: 'Skeptic', capabilities: ['verify'] });
  }

  async perform({ parsed, solution }) {
    switch (parsed.kind) {
      case 'evaluate': {
        const recomputed = runRpn(compileToRpn(parsed.ast));
        this.#assert(
          approxEqual(recomputed, solution.value),
          `rpn recomputation got ${recomputed}, solver claimed ${solution.value}`,
        );
        return {
          valid: true,
          method: 'rpn-recompute',
          details: `independent stack-machine evaluation agrees (${formatNumber(recomputed)})`,
        };
      }
      case 'solve':
        return this.#verifyEquation(parsed, solution);
      case 'gcd': {
        const expected = binaryGcd(parsed.a, parsed.b);
        this.#assert(expected === solution.value, `binary gcd got ${expected}, solver claimed ${solution.value}`);
        return { valid: true, method: 'binary-gcd', details: `Stein's algorithm agrees (${expected})` };
      }
      case 'lcm': {
        const g = binaryGcd(parsed.a, parsed.b);
        const abs = (n) => (n < 0n ? -n : n);
        const expected = parsed.a === 0n || parsed.b === 0n ? 0n : abs(parsed.a / g * parsed.b);
        this.#assert(expected === solution.value, `recomputed lcm ${expected}, solver claimed ${solution.value}`);
        return { valid: true, method: 'gcd-identity', details: `|a·b|/gcd(a,b) agrees (${expected})` };
      }
      case 'is-prime': {
        const expected = isPrimeSlow(parsed.n);
        this.#assert(expected === solution.value, `naive trial division says ${expected}, solver claimed ${solution.value}`);
        return { valid: true, method: 'trial-division', details: 'naive trial division agrees' };
      }
      case 'prime-factors': {
        let product = 1n;
        let previousPrime = 1n;
        for (const { prime, exponent } of solution.factors) {
          this.#assert(prime > previousPrime, `factors are not strictly ascending at ${prime}`);
          this.#assert(exponent >= 1n, `factor ${prime} has non-positive exponent`);
          this.#assert(isPrimeSlow(prime), `claimed factor ${prime} is not prime`);
          product *= prime ** exponent;
          previousPrime = prime;
        }
        this.#assert(product === parsed.n, `factors multiply back to ${product}, not ${parsed.n}`);
        return {
          valid: true,
          method: 'multiply-back',
          details: 'factors are prime, ascending, and multiply back to n',
        };
      }
      case 'fibonacci': {
        const expected = fibonacciIterative(parsed.n);
        this.#assert(expected === solution.value, `iterative fibonacci got ${expected}, solver claimed ${solution.value}`);
        return { valid: true, method: 'iterative-recompute', details: 'plain iteration agrees' };
      }
      case 'stats': {
        const expected = describeIndependently(parsed.values);
        const claimed = solution.summary;
        for (const key of ['count', 'sum', 'mean', 'median', 'min', 'max', 'variance', 'stddev']) {
          this.#assert(
            approxEqual(expected[key], claimed[key]),
            `${key}: independent recomputation got ${expected[key]}, solver claimed ${claimed[key]}`,
          );
        }
        this.#assert(
          JSON.stringify(expected.mode) === JSON.stringify(claimed.mode),
          `mode: independent recomputation got [${expected.mode}], solver claimed [${claimed.mode}]`,
        );
        return { valid: true, method: 'alternative-formulas', details: 'all statistics agree' };
      }
      default:
        throw new UnsupportedProblemError(`verifier cannot handle kind '${parsed.kind}'`);
    }
  }

  #verifyEquation(parsed, solution) {
    const env = (x) => ({ [parsed.variable]: x });
    switch (solution.form) {
      case 'identity': {
        for (const x of SAMPLE_POINTS) {
          const lhs = evaluate(parsed.lhs, env(x));
          const rhs = evaluate(parsed.rhs, env(x));
          this.#assert(approxEqual(lhs, rhs), `claimed identity but sides differ at ${parsed.variable}=${x}`);
        }
        return { valid: true, method: 'sampling', details: 'both sides agree at every sample point' };
      }
      case 'none': {
        for (const x of SAMPLE_POINTS) {
          const lhs = evaluate(parsed.lhs, env(x));
          const rhs = evaluate(parsed.rhs, env(x));
          this.#assert(!approxEqual(lhs, rhs), `claimed no solution but sides agree at ${parsed.variable}=${x}`);
        }
        return { valid: true, method: 'sampling', details: 'no sample point satisfies the equation' };
      }
      case 'roots': {
        this.#assert(solution.roots.length > 0, 'roots form with an empty root list');
        const coefficientScale = Math.max(1, ...solution.coefficients.map(Math.abs));
        let sawComplex = false;
        for (const root of solution.roots) {
          if (Math.abs(root.im) <= TOLERANCE) {
            const lhs = evaluate(parsed.lhs, env(root.re));
            const rhs = evaluate(parsed.rhs, env(root.re));
            this.#assert(
              approxEqual(lhs, rhs),
              `substituting ${parsed.variable}=${root.re} gives ${lhs} vs ${rhs}`,
            );
          } else {
            sawComplex = true;
            const residual = cAbs(polyEvalComplex(solution.coefficients, root));
            this.#assert(
              residual <= TOLERANCE * coefficientScale,
              `complex root leaves residual ${residual}`,
            );
          }
        }
        return {
          valid: true,
          method: sawComplex ? 'complex-horner' : 'root-substitution',
          details: `all ${solution.roots.length} root(s) satisfy the equation`,
        };
      }
      default:
        throw new UnsupportedProblemError(`unknown solution form '${solution.form}'`);
    }
  }

  #assert(condition, message) {
    if (!condition) throw new VerificationError(message);
  }
}
