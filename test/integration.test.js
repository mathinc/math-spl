import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Ledger } from '../src/crypto/ledger.js';
import { Keypair } from '../src/crypto/keypair.js';
import { solToLamports, LAMPORTS_PER_SOL } from '../src/crypto/units.js';
import { verifyCertificate } from '../src/crypto/certificate.js';
import { buildMathBountySystem } from '../src/system.js';

const SOL = LAMPORTS_PER_SOL;

describe('end-to-end math bounty pipeline', () => {
  it('solves, verifies, certifies, and pays; failures refund', async () => {
    const ledger = new Ledger();
    const poster = Keypair.generate();
    ledger.airdrop(poster.address, solToLamports(10));

    const system = buildMathBountySystem({ ledger, orchestratorOptions: { backoffMs: 1 } });
    const problems = [
      { id: 'IT-1', text: 'evaluate: (3 + 4) * 2^3 - sqrt(144)', bounty: 1n * SOL },
      { id: 'IT-2', text: 'solve: x^2 - 5x + 6 = 0', bounty: 2n * SOL },
      { id: 'IT-3', text: 'gcd: 252, 105', bounty: 1n * SOL },
      { id: 'IT-4', text: 'stats: 4, 8, 15, 16, 23, 42', bounty: 1n * SOL },
      { id: 'IT-5', text: 'solve: x^3 - 1 = 0', bounty: 3n * SOL }, // degree 3 -> must fail
    ];
    for (const problem of problems) {
      system.board.post({ problemId: problem.id, poster, lamports: problem.bounty });
    }
    assert.equal(ledger.balance(system.board.escrowAddress), 8n * SOL);

    const results = await system.orchestrator.runAll(problems, { concurrency: 3 });

    // outcomes
    const byId = new Map(results.map((ctx) => [ctx.problem.id, ctx]));
    for (const id of ['IT-1', 'IT-2', 'IT-3', 'IT-4']) {
      assert.equal(byId.get(id).status, 'completed', `${id} should complete`);
    }
    assert.equal(byId.get('IT-5').status, 'failed');
    assert.match(byId.get('IT-5').error.message, /degree-3/);

    // answers
    assert.equal(byId.get('IT-1').artifacts.solution.value, 44);
    assert.equal(byId.get('IT-2').artifacts.solution.display, 'x = 2, x = 3');
    assert.equal(byId.get('IT-3').artifacts.solution.value, 21n);

    // every completed job carries a certificate that independently verifies
    for (const id of ['IT-1', 'IT-2', 'IT-3', 'IT-4']) {
      const { certificate } = byId.get(id).artifacts;
      assert.equal(verifyCertificate(certificate), true);
      assert.equal(certificate.certificate.solverAddress, byId.get(id).agents.solve.address);
    }

    // money: solvers got paid, the failure was refunded, escrow is empty
    assert.equal(ledger.balance(system.agents.arithmetic.address), 1n * SOL);
    assert.equal(ledger.balance(system.agents.algebra.address), 2n * SOL);
    assert.equal(ledger.balance(system.agents.numberTheory.address), 1n * SOL);
    assert.equal(ledger.balance(system.agents.statistics.address), 1n * SOL);
    assert.equal(ledger.balance(system.board.escrowAddress), 0n);
    assert.equal(ledger.balance(poster.address), 5n * SOL); // 10 - 8 posted + 3 refunded
    assert.equal(system.board.get('IT-5').status, 'refunded');
    assert.ok(byId.get('IT-5').artifacts.refund.txSignature);

    // conservation and cryptographic integrity of the whole ledger
    assert.equal(ledger.sumOfBalances(), ledger.totalSupply());
    assert.equal(ledger.verifyHistory(), true);
  });

  it('a bounty cannot be double-claimed even if a job is replayed', async () => {
    const ledger = new Ledger();
    const poster = Keypair.generate();
    ledger.airdrop(poster.address, solToLamports(2));

    const system = buildMathBountySystem({ ledger, orchestratorOptions: { backoffMs: 1 } });
    const problem = { id: 'RE-1', text: 'evaluate: 6 * 7' };
    system.board.post({ problemId: problem.id, poster, lamports: 1n * SOL });

    const first = await system.orchestrator.run(problem);
    assert.equal(first.status, 'completed');

    // replaying the same problem: pipeline re-solves, but settlement must fail
    // (bounty already paid) and the paid status must not change
    const replay = await system.orchestrator.run(problem);
    assert.equal(replay.status, 'failed');
    assert.equal(replay.error.stage, 'settle');
    assert.equal(system.board.get(problem.id).status, 'paid');
    assert.equal(ledger.balance(system.agents.arithmetic.address), 1n * SOL);
    assert.equal(ledger.sumOfBalances(), ledger.totalSupply());
  });

  it('rejects unparseable and unsupported problems without touching money', async () => {
    const ledger = new Ledger();
    const poster = Keypair.generate();
    ledger.airdrop(poster.address, solToLamports(5));

    const system = buildMathBountySystem({ ledger, orchestratorOptions: { backoffMs: 1 } });
    const problems = [
      { id: 'BAD-1', text: 'divine: the meaning of life' },
      { id: 'BAD-2', text: 'solve: x + y = 3' },
      { id: 'BAD-3', text: 'evaluate: 1 / 0' },
    ];
    for (const problem of problems) {
      system.board.post({ problemId: problem.id, poster, lamports: 1n * SOL });
    }

    const results = await system.orchestrator.runAll(problems);
    for (const ctx of results) {
      assert.equal(ctx.status, 'failed');
      assert.equal(system.board.get(ctx.problem.id).status, 'refunded');
    }
    assert.equal(ledger.balance(poster.address), 5n * SOL);
    assert.equal(ledger.balance(system.board.escrowAddress), 0n);
    assert.equal(ledger.verifyHistory(), true);
  });
});
