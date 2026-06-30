import { BaseAgent } from './base-agent.js';
import { evaluate } from '../math/evaluator.js';
import { compileToRpn, runRpn } from '../math/rpn.js';
import { polyEvalComplex, cAbs } from '../math/complex.js';
import { VerificationError, UnsupportedProblemError } from '../errors.js';

const TOLERANCE = 1e-9;
const SAMPLE_POINTS = [-3, 0.5, 7];

const approxEqual = (a, b) =>
  Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Skeptic re-derives every answer through a structurally different path
 * before it is allowed anywhere near a payout.
 *
 * TODO: number-theory and stats kinds still route through here unverified.
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
        return { valid: true, method: 'rpn-recompute', details: 'independent stack-machine evaluation agrees' };
      }
      case 'solve':
        return this.#verifyEquation(parsed, solution);
      default:
        throw new UnsupportedProblemError(`verifier cannot handle kind '${parsed.kind}' yet`);
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
        for (const root of solution.roots) {
          if (Math.abs(root.im) <= TOLERANCE) {
            const lhs = evaluate(parsed.lhs, env(root.re));
            const rhs = evaluate(parsed.rhs, env(root.re));
            this.#assert(approxEqual(lhs, rhs), `substituting ${parsed.variable}=${root.re} gives ${lhs} vs ${rhs}`);
          } else {
            const residual = cAbs(polyEvalComplex(solution.coefficients, root));
            this.#assert(residual <= TOLERANCE * coefficientScale, `complex root leaves residual ${residual}`);
          }
        }
        return { valid: true, method: 'root-substitution', details: `all ${solution.roots.length} root(s) satisfy the equation` };
      }
      default:
        throw new UnsupportedProblemError(`unknown solution form '${solution.form}'`);
    }
  }

  #assert(condition, message) {
    if (!condition) throw new VerificationError(message);
  }
}
