import { AgentRegistry } from './orchestrator/registry.js';
import { Workflow } from './orchestrator/workflow.js';
import { Orchestrator } from './orchestrator/orchestrator.js';
import { ParserAgent } from './agents/parser-agent.js';
import { PlannerAgent } from './agents/planner-agent.js';
import { ArithmeticSolver } from './agents/solvers/arithmetic-solver.js';
import { AlgebraSolver } from './agents/solvers/algebra-solver.js';
import { NumberTheorySolver } from './agents/solvers/number-theory-solver.js';
import { StatisticsSolver } from './agents/solvers/statistics-solver.js';
import { VerifierAgent } from './agents/verifier-agent.js';
import { CertifierAgent } from './agents/certifier-agent.js';
import { TreasurerAgent } from './agents/treasurer-agent.js';
import { Keypair } from './crypto/keypair.js';
import { BountyBoard } from './crypto/bounty-board.js';

/**
 * Wire the full math-bounty system against a ledger:
 *
 *   parse -> plan -> solve -> verify -> certify -> settle
 *
 * The solve stage is routed at runtime from the planner's decision. If any
 * stage fails, the compensation handler refunds the still-open bounty.
 */
export function buildMathBountySystem({ ledger, orchestratorOptions = {} }) {
  const escrow = Keypair.generate();
  const certifier = new CertifierAgent({ wallet: Keypair.generate() });
  const board = new BountyBoard({ ledger, escrow, trustedAuthority: certifier.address });

  const agents = {
    parser: new ParserAgent(),
    planner: new PlannerAgent(),
    arithmetic: new ArithmeticSolver({ wallet: Keypair.generate() }),
    algebra: new AlgebraSolver({ wallet: Keypair.generate() }),
    numberTheory: new NumberTheorySolver({ wallet: Keypair.generate() }),
    statistics: new StatisticsSolver({ wallet: Keypair.generate() }),
    verifier: new VerifierAgent(),
    certifier,
    treasurer: new TreasurerAgent({ board }),
  };

  const registry = new AgentRegistry();
  for (const agent of Object.values(agents)) registry.register(agent);

  const workflow = new Workflow('math-bounty-pipeline')
    .stage('parse', {
      capability: 'parse',
      task: (ctx) => ({ text: ctx.problem.text }),
      save: 'parsed',
    })
    .stage('plan', {
      capability: 'plan',
      task: (ctx) => ({ parsed: ctx.artifacts.parsed }),
      save: 'plan',
    })
    .stage('solve', {
      capability: (ctx) => ctx.artifacts.plan.solverCapability,
      task: (ctx) => ({ parsed: ctx.artifacts.parsed }),
      save: 'solution',
    })
    .stage('verify', {
      capability: 'verify',
      task: (ctx) => ({ parsed: ctx.artifacts.parsed, solution: ctx.artifacts.solution }),
      save: 'verification',
    })
    .stage('certify', {
      capability: 'certify',
      task: (ctx) => ({
        problem: ctx.problem,
        parsed: ctx.artifacts.parsed,
        solution: ctx.artifacts.solution,
        verification: ctx.artifacts.verification,
        solver: ctx.agents.solve,
      }),
      save: 'certificate',
    })
    .stage('settle', {
      capability: 'settle',
      task: (ctx) => ({
        problemId: ctx.problem.id,
        solverAddress: ctx.agents.solve.address,
        certificate: ctx.artifacts.certificate.certificate,
        signature: ctx.artifacts.certificate.signature,
      }),
      save: 'payout',
    })
    .onFailure(async (ctx) => {
      const bounty = board.get(ctx.problem.id);
      if (bounty?.status === 'open') {
        const receipt = board.refund(ctx.problem.id);
        ctx.artifacts.refund = { txSignature: receipt.signature, lamports: receipt.lamports };
      }
    });

  const orchestrator = new Orchestrator({ registry, workflow, ...orchestratorOptions });
  return { orchestrator, registry, workflow, board, agents };
}
