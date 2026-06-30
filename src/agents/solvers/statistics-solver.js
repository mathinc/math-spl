import { BaseAgent } from '../base-agent.js';
import { describe } from '../../math/statistics.js';
import { formatNumber } from '../../math/evaluator.js';

/** Gauss summarizes numeric samples with population statistics. */
export class StatisticsSolver extends BaseAgent {
  constructor({ wallet } = {}) {
    super({
      id: 'agent.solver.statistics',
      name: 'Gauss',
      capabilities: ['solve:statistics'],
      wallet,
    });
  }

  async perform({ parsed }) {
    const summary = describe(parsed.values);
    const display = [
      `n=${summary.count}`,
      `mean=${formatNumber(summary.mean)}`,
      `median=${formatNumber(summary.median)}`,
      `stddev=${formatNumber(summary.stddev)}`,
      `range=[${formatNumber(summary.min)}, ${formatNumber(summary.max)}]`,
    ].join(', ');
    return { kind: 'stats', summary, display };
  }
}
