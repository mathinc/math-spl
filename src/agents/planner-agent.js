import { BaseAgent } from './base-agent.js';
import { UnsupportedProblemError } from '../errors.js';

const ROUTES = new Map([
  ['evaluate', { solverCapability: 'solve:arithmetic', verifyMethod: 'rpn-recompute' }],
  ['solve', { solverCapability: 'solve:algebra', verifyMethod: 'root-substitution' }],
  ['gcd', { solverCapability: 'solve:number-theory', verifyMethod: 'independent-recompute' }],
  ['lcm', { solverCapability: 'solve:number-theory', verifyMethod: 'independent-recompute' }],
  ['prime-factors', { solverCapability: 'solve:number-theory', verifyMethod: 'independent-recompute' }],
  ['is-prime', { solverCapability: 'solve:number-theory', verifyMethod: 'independent-recompute' }],
  ['fibonacci', { solverCapability: 'solve:number-theory', verifyMethod: 'independent-recompute' }],
  ['stats', { solverCapability: 'solve:statistics', verifyMethod: 'independent-recompute' }],
]);

/** Strategos routes each parsed problem to the solver capability that owns it. */
export class PlannerAgent extends BaseAgent {
  constructor() {
    super({ id: 'agent.planner', name: 'Strategos', capabilities: ['plan'] });
  }

  async perform({ parsed }) {
    const route = ROUTES.get(parsed.kind);
    if (!route) {
      throw new UnsupportedProblemError(`no route for problem kind '${parsed.kind}'`);
    }
    return { kind: parsed.kind, ...route };
  }
}
