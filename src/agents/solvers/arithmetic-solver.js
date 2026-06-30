import { BaseAgent } from '../base-agent.js';
import { evaluate, formatNumber } from '../../math/evaluator.js';

/** Abacus evaluates closed-form arithmetic expressions. */
export class ArithmeticSolver extends BaseAgent {
  constructor({ wallet } = {}) {
    super({
      id: 'agent.solver.arithmetic',
      name: 'Abacus',
      capabilities: ['solve:arithmetic'],
      wallet,
    });
  }

  async perform({ parsed }) {
    const value = evaluate(parsed.ast);
    return {
      kind: 'evaluate',
      value,
      display: `${parsed.text} = ${formatNumber(value)}`,
    };
  }
}
