import { Ledger } from './crypto/ledger.js';
import { Keypair } from './crypto/keypair.js';
import { solToLamports, formatSol } from './crypto/units.js';
import { verifyCertificate } from './crypto/certificate.js';
import { buildMathBountySystem } from './system.js';

const PROBLEMS = [
  { id: 'PAM-001', text: 'evaluate: (3 + 4) * 2^3 - sqrt(144)', bountySol: 0.5 },
  { id: 'PAM-002', text: 'evaluate: sin(pi / 6) + cos(pi / 3)', bountySol: 0.75 },
  { id: 'PAM-003', text: 'solve: 2x + 3 = 11', bountySol: 1 },
  { id: 'PAM-004', text: 'solve: x^2 - 5x + 6 = 0', bountySol: 1.5 },
  { id: 'PAM-005', text: 'solve: x^2 + 2x + 5 = 0', bountySol: 2 },
  { id: 'PAM-006', text: 'gcd: 252, 105', bountySol: 0.25 },
  { id: 'PAM-007', text: 'prime-factors: 5040', bountySol: 0.6 },
  { id: 'PAM-008', text: 'fibonacci: 90', bountySol: 0.8 },
  { id: 'PAM-009', text: 'stats: 4, 8, 15, 16, 23, 42', bountySol: 0.4 },
  { id: 'PAM-010', text: 'solve: x^3 - 6x^2 + 11x - 6 = 0', bountySol: 3 },
];

const RULE = '═'.repeat(76);
const LINE = '─'.repeat(76);
const short = (text, n = 8) => (text ? `${text.slice(0, n)}…` : '—');

function subscribe(orchestrator) {
  orchestrator.on('stage:complete', ({ problem, stage, agent, durationMs }) => {
    console.log(`  [${problem.id}] ${stage.padEnd(7)} ok   ${agent} (${durationMs.toFixed(1)}ms)`);
  });
  orchestrator.on('stage:retry', ({ problem, stage, agent, attempt, error }) => {
    console.log(`  [${problem.id}] ${stage.padEnd(7)} retry ${agent} attempt ${attempt}: ${error.message}`);
  });
  orchestrator.on('stage:failed', ({ problem, stage, agent, error }) => {
    console.log(`  [${problem.id}] ${stage.padEnd(7)} FAIL ${agent} — ${error.message}`);
  });
}

function report(results, board) {
  console.log(`\n${RULE}\n  RESULTS\n${RULE}`);
  for (const ctx of results) {
    const { problem } = ctx;
    console.log(`\n${LINE}\n  ${problem.id}  ${problem.text}`);
    if (ctx.status === 'completed') {
      const { solution, verification, certificate, payout } = ctx.artifacts;
      const elapsed = ctx.finishedAt - ctx.startedAt;
      console.log(`    status       completed in ${elapsed}ms`);
      console.log(`    solution     ${solution.display}`);
      console.log(`    verified     ${verification.method} — ${verification.details}`);
      console.log(`    certificate  ${short(certificate.signature)} (authority ${short(certificate.certificate.authority)}, valid: ${verifyCertificate(certificate)})`);
      console.log(`    payout       ${formatSol(payout.lamports)} -> ${ctx.agents.solve.name} (${short(payout.solverAddress)})  tx ${short(payout.txSignature)}`);
    } else {
      const bounty = board.get(problem.id);
      console.log(`    status       FAILED at stage '${ctx.error.stage ?? '?'}'`);
      console.log(`    reason       ${ctx.error.cause?.message ?? ctx.error.message}`);
      if (ctx.artifacts.refund) {
        console.log(`    refund       ${formatSol(ctx.artifacts.refund.lamports)} returned to poster  tx ${short(ctx.artifacts.refund.txSignature)}`);
      }
      console.log(`    bounty       ${bounty?.status ?? 'none'}`);
    }
  }
}

function reportAgents(registry) {
  console.log(`\n${RULE}\n  AGENT WORKLOAD\n${RULE}`);
  for (const agent of registry.all()) {
    const { handled, failed, totalMs } = agent.stats;
    const attempts = handled + failed;
    if (attempts === 0) continue;
    const avg = (totalMs / attempts).toFixed(2);
    console.log(
      `  ${agent.name.padEnd(14)} ${agent.capabilities.join(', ').padEnd(22)}`
      + ` handled ${String(handled).padStart(3)}  failed ${String(failed).padStart(2)}  avg ${avg}ms`,
    );
  }
}

function reportLedger(ledger, board, poster, agents) {
  console.log(`\n${RULE}\n  LEDGER\n${RULE}`);
  const rows = [
    ['Client (poster)', poster.address],
    [agents.arithmetic.name, agents.arithmetic.address],
    [agents.algebra.name, agents.algebra.address],
    [agents.numberTheory.name, agents.numberTheory.address],
    [agents.statistics.name, agents.statistics.address],
    ['Escrow', board.escrowAddress],
  ];
  for (const [label, address] of rows) {
    console.log(`  ${label.padEnd(16)} ${short(address, 12).padEnd(15)} ${formatSol(ledger.balance(address))}`);
  }
  console.log(`\n  slots        ${ledger.slot}`);
  console.log(`  blockhash    ${short(ledger.blockhash, 16)}`);
  const conserved = ledger.sumOfBalances() === ledger.totalSupply();
  console.log(`  supply       ${formatSol(ledger.totalSupply())} minted, conservation ${conserved ? 'OK' : 'VIOLATED'}`);
  console.log(`  history      ${ledger.verifyHistory() ? 'all signatures and blockhashes verify' : 'INTEGRITY FAILURE'}`);
}

async function main() {
  console.log(`${RULE}\n  PAM — Problem-solving Agent Mesh\n  math bounties, settled on a simulated Solana-style ledger\n${RULE}\n`);

  const ledger = new Ledger();
  const poster = Keypair.generate();
  ledger.airdrop(poster.address, solToLamports(100));
  console.log(`  client wallet ${short(poster.address, 12)} funded with ${formatSol(ledger.balance(poster.address))}\n`);

  const system = buildMathBountySystem({ ledger });
  subscribe(system.orchestrator);

  for (const problem of PROBLEMS) {
    system.board.post({ problemId: problem.id, poster, lamports: solToLamports(problem.bountySol) });
  }
  console.log(`  posted ${PROBLEMS.length} bounties (${formatSol(ledger.balance(system.board.escrowAddress))} in escrow)\n${LINE}`);

  const results = await system.orchestrator.runAll(PROBLEMS, { concurrency: 3 });

  report(results, system.board);
  reportAgents(system.registry);
  reportLedger(ledger, system.board, poster, system.agents);

  const completed = results.filter((ctx) => ctx.status === 'completed').length;
  console.log(`\n${RULE}\n  ${completed}/${results.length} problems solved, verified, certified, and paid.\n${RULE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
