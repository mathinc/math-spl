import { Ledger } from './crypto/ledger.js';
import { Keypair } from './crypto/keypair.js';
import { solToLamports, formatSol } from './crypto/units.js';
import { buildMathBountySystem } from './system.js';

const PROBLEMS = [
  { id: 'PAM-001', text: 'evaluate: (3 + 4) * 2^3 - sqrt(144)', bountySol: 0.5 },
  { id: 'PAM-002', text: 'solve: 2x + 3 = 11', bountySol: 1 },
  { id: 'PAM-003', text: 'solve: x^2 - 5x + 6 = 0', bountySol: 1.5 },
  { id: 'PAM-004', text: 'gcd: 252, 105', bountySol: 0.25 },
  { id: 'PAM-005', text: 'prime-factors: 5040', bountySol: 0.6 },
  { id: 'PAM-006', text: 'stats: 4, 8, 15, 16, 23, 42', bountySol: 0.4 },
];

async function main() {
  const ledger = new Ledger();
  const poster = Keypair.generate();
  ledger.airdrop(poster.address, solToLamports(100));

  const system = buildMathBountySystem({ ledger });
  for (const problem of PROBLEMS) {
    system.board.post({ problemId: problem.id, poster, lamports: solToLamports(problem.bountySol) });
  }

  const results = await system.orchestrator.runAll(PROBLEMS, { concurrency: 3 });

  for (const ctx of results) {
    if (ctx.status === 'completed') {
      console.log(`${ctx.problem.id}  OK   ${ctx.artifacts.solution.display}`);
      console.log(`         paid ${formatSol(ctx.artifacts.payout.lamports)} to ${ctx.agents.solve.name}`);
    } else {
      console.log(`${ctx.problem.id}  FAIL ${ctx.error.message}`);
    }
  }

  const completed = results.filter((ctx) => ctx.status === 'completed').length;
  console.log(`\n${completed}/${results.length} solved and paid`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
