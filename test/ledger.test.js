import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Ledger } from '../src/crypto/ledger.js';
import { Keypair } from '../src/crypto/keypair.js';
import { BountyBoard } from '../src/crypto/bounty-board.js';
import { issueCertificate, verifyCertificate } from '../src/crypto/certificate.js';
import { LAMPORTS_PER_SOL, solToLamports, formatSol } from '../src/crypto/units.js';
import { LedgerError, BountyError } from '../src/errors.js';

const SOL = LAMPORTS_PER_SOL;

describe('units', () => {
  it('converts SOL to lamports and back', () => {
    assert.equal(solToLamports(1.5), 1_500_000_000n);
    assert.equal(solToLamports(0.000000001), 1n);
    assert.equal(formatSol(1_500_000_000n), '1.5 SOL');
    assert.equal(formatSol(2_000_000_000n), '2 SOL');
    assert.equal(formatSol(1n), '0.000000001 SOL');
  });

  it('rejects invalid amounts', () => {
    assert.throws(() => solToLamports(-1), LedgerError);
    assert.throws(() => solToLamports(NaN), LedgerError);
  });
});

describe('ledger', () => {
  it('airdrops mint supply and transfers move it', () => {
    const ledger = new Ledger();
    const alice = Keypair.generate();
    const bob = Keypair.generate();

    ledger.airdrop(alice.address, 5n * SOL);
    assert.equal(ledger.balance(alice.address), 5n * SOL);
    assert.equal(ledger.totalSupply(), 5n * SOL);

    const receipt = ledger.transfer({ from: alice, to: bob.address, lamports: 2n * SOL });
    assert.ok(receipt.signature);
    assert.equal(ledger.balance(alice.address), 3n * SOL);
    assert.equal(ledger.balance(bob.address), 2n * SOL);
    assert.equal(ledger.sumOfBalances(), ledger.totalSupply());
    assert.equal(ledger.slot, 2);
  });

  it('rejects overdrafts and non-positive amounts', () => {
    const ledger = new Ledger();
    const alice = Keypair.generate();
    const bob = Keypair.generate();
    ledger.airdrop(alice.address, 1n * SOL);

    assert.throws(
      () => ledger.transfer({ from: alice, to: bob.address, lamports: 2n * SOL }),
      LedgerError,
    );
    assert.throws(
      () => ledger.transfer({ from: alice, to: bob.address, lamports: 0n }),
      LedgerError,
    );
    assert.throws(() => ledger.airdrop(alice.address, -1n), LedgerError);
    assert.equal(ledger.balance(alice.address), 1n * SOL);
  });

  it('verifies its full history and detects tampering', () => {
    const ledger = new Ledger();
    const alice = Keypair.generate();
    const bob = Keypair.generate();
    ledger.airdrop(alice.address, 5n * SOL);
    ledger.transfer({ from: alice, to: bob.address, lamports: 1n * SOL });
    ledger.transfer({ from: bob, to: alice.address, lamports: 500_000_000n });

    assert.equal(ledger.verifyHistory(), true);

    // history entries are live references — forge an amount and integrity breaks
    ledger.history[1].tx.lamports = (3n * SOL).toString();
    assert.equal(ledger.verifyHistory(), false);
  });

  it('chains blockhashes forward', () => {
    const ledger = new Ledger();
    const genesis = ledger.blockhash;
    const alice = Keypair.generate();
    ledger.airdrop(alice.address, 1n * SOL);
    const afterAirdrop = ledger.blockhash;
    assert.notEqual(afterAirdrop, genesis);
    assert.equal(ledger.history.at(-1).blockhash, afterAirdrop);
  });
});

describe('certificate', () => {
  const authority = Keypair.generate();
  const problem = { id: 'CERT-1', text: 'evaluate: 1 + 1' };
  const base = {
    authority,
    problem,
    kind: 'evaluate',
    solutionDisplay: '1 + 1 = 2',
    solverId: 'agent.solver.arithmetic',
    solverAddress: Keypair.generate().address,
    verificationMethod: 'rpn-recompute',
  };

  it('issues certificates that verify', () => {
    const issued = issueCertificate(base);
    assert.equal(verifyCertificate(issued), true);
    assert.equal(issued.certificate.problemId, 'CERT-1');
    assert.equal(issued.certificate.authority, authority.address);
  });

  it('rejects any tampering with the payload or signature', () => {
    const issued = issueCertificate(base);
    assert.equal(
      verifyCertificate({
        certificate: { ...issued.certificate, solutionDisplay: '1 + 1 = 3' },
        signature: issued.signature,
      }),
      false,
    );
    assert.equal(
      verifyCertificate({ certificate: issued.certificate, signature: 'garbage!!' }),
      false,
    );
  });
});

describe('bounty board', () => {
  function setup() {
    const ledger = new Ledger();
    const poster = Keypair.generate();
    const solver = Keypair.generate();
    const authority = Keypair.generate();
    const escrow = Keypair.generate();
    const board = new BountyBoard({ ledger, escrow, trustedAuthority: authority.address });
    ledger.airdrop(poster.address, 10n * SOL);
    const problem = { id: 'B-1', text: 'evaluate: 6 * 7' };
    const certify = (overrides = {}) => issueCertificate({
      authority,
      problem,
      kind: 'evaluate',
      solutionDisplay: '6 * 7 = 42',
      solverId: 'agent.solver.arithmetic',
      solverAddress: solver.address,
      verificationMethod: 'rpn-recompute',
      ...overrides,
    });
    return { ledger, poster, solver, authority, board, problem, certify };
  }

  it('escrows on post and pays the solver on a valid claim', () => {
    const { ledger, poster, solver, board, problem, certify } = setup();
    board.post({ problemId: problem.id, poster, lamports: 2n * SOL });
    assert.equal(ledger.balance(board.escrowAddress), 2n * SOL);
    assert.equal(ledger.balance(poster.address), 8n * SOL);

    const issued = certify();
    const receipt = board.claim({
      problemId: problem.id,
      solverAddress: solver.address,
      certificate: issued.certificate,
      signature: issued.signature,
    });
    assert.ok(receipt.signature);
    assert.equal(ledger.balance(solver.address), 2n * SOL);
    assert.equal(ledger.balance(board.escrowAddress), 0n);
    assert.equal(board.get(problem.id).status, 'paid');
  });

  it('refunds an open bounty to the poster', () => {
    const { ledger, poster, board, problem } = setup();
    board.post({ problemId: problem.id, poster, lamports: 3n * SOL });
    board.refund(problem.id);
    assert.equal(ledger.balance(poster.address), 10n * SOL);
    assert.equal(board.get(problem.id).status, 'refunded');
  });

  it('enforces the bounty lifecycle', () => {
    const { poster, solver, board, problem, certify } = setup();
    board.post({ problemId: problem.id, poster, lamports: 1n * SOL });
    assert.throws(
      () => board.post({ problemId: problem.id, poster, lamports: 1n * SOL }),
      BountyError,
    );
    const issued = certify();
    board.claim({
      problemId: problem.id,
      solverAddress: solver.address,
      certificate: issued.certificate,
      signature: issued.signature,
    });
    assert.throws(() => board.refund(problem.id), BountyError);
    assert.throws(
      () => board.claim({
        problemId: problem.id,
        solverAddress: solver.address,
        certificate: issued.certificate,
        signature: issued.signature,
      }),
      BountyError,
    );
    assert.throws(() => board.refund('missing'), BountyError);
  });

  it('rejects certificates from an untrusted authority or wrong solver', () => {
    const { poster, solver, board, problem, certify } = setup();
    board.post({ problemId: problem.id, poster, lamports: 1n * SOL });

    const rogue = Keypair.generate();
    const forged = certify({ authority: rogue });
    assert.throws(
      () => board.claim({
        problemId: problem.id,
        solverAddress: solver.address,
        certificate: forged.certificate,
        signature: forged.signature,
      }),
      /trusted verification authority/,
    );

    const issued = certify();
    assert.throws(
      () => board.claim({
        problemId: problem.id,
        solverAddress: Keypair.generate().address,
        certificate: issued.certificate,
        signature: issued.signature,
      }),
      /different solver/,
    );

    assert.throws(
      () => board.claim({
        problemId: problem.id,
        solverAddress: solver.address,
        certificate: { ...issued.certificate, solutionDisplay: 'forged' },
        signature: issued.signature,
      }),
      /signature is invalid/,
    );
  });
});
