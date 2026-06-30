import { BaseAgent } from '../base-agent.js';
import { toPolynomial, polySub, polyDegree } from '../../math/polynomial.js';
import { complex, formatComplex } from '../../math/complex.js';
import { UnsupportedProblemError } from '../../errors.js';

/**
 * Vieta solves single-variable polynomial equations up to degree 2 by
 * lowering both sides to polynomials and analyzing their difference.
 */
export class AlgebraSolver extends BaseAgent {
  constructor({ wallet } = {}) {
    super({
      id: 'agent.solver.algebra',
      name: 'Vieta',
      capabilities: ['solve:algebra'],
      wallet,
    });
  }

  async perform({ parsed }) {
    const lhs = toPolynomial(parsed.lhs, parsed.variable);
    const rhs = toPolynomial(parsed.rhs, parsed.variable);
    const poly = polySub(lhs, rhs);
    const degree = polyDegree(poly);
    const v = parsed.variable;

    if (degree < 0) {
      return { kind: 'solve', form: 'identity', coefficients: poly, roots: [], display: `true for every ${v}` };
    }
    if (degree === 0) {
      return { kind: 'solve', form: 'none', coefficients: poly, roots: [], display: 'no solution' };
    }
    if (degree === 1) {
      const root = complex(-poly[0] / poly[1]);
      return {
        kind: 'solve',
        form: 'roots',
        degree,
        coefficients: poly,
        roots: [root],
        display: `${v} = ${formatComplex(root)}`,
      };
    }
    if (degree === 2) {
      const [c, b, a] = poly;
      const discriminant = b * b - 4 * a * c;
      let roots;
      if (discriminant === 0) {
        roots = [complex(-b / (2 * a))];
      } else if (discriminant > 0) {
        const sq = Math.sqrt(discriminant);
        roots = [complex((-b - sq) / (2 * a)), complex((-b + sq) / (2 * a))]
          .sort((p, q) => p.re - q.re);
      } else {
        const sq = Math.sqrt(-discriminant);
        roots = [complex(-b / (2 * a), -sq / (2 * a)), complex(-b / (2 * a), sq / (2 * a))];
      }
      return {
        kind: 'solve',
        form: 'roots',
        degree,
        discriminant,
        coefficients: poly,
        roots,
        display: roots.map((root) => `${v} = ${formatComplex(root)}`).join(', '),
      };
    }
    throw new UnsupportedProblemError(`cannot solve degree-${degree} equations (max supported: 2)`);
  }
}
