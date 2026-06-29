import { verifyCertificate } from './certificate.js';
import { BountyError } from '../errors.js';

/**
 * Escrowed SOL bounties for math problems.
 *
 * Lifecycle: post (poster -> escrow) then exactly one of
 *   claim  (escrow -> solver, requires a certificate signed by the trusted authority)
 *   refund (escrow -> poster, when the pipeline fails)
 */
export class BountyBoard {
  #bounties = new Map();
  #ledger;
  #escrow;
  #trustedAuthority;

  constructor({ ledger, escrow, trustedAuthority }) {
    this.#ledger = ledger;
    this.#escrow = escrow;
    this.#trustedAuthority = trustedAuthority;
  }

  get escrowAddress() {
    return this.#escrow.address;
  }

  get trustedAuthority() {
    return this.#trustedAuthority;
  }

  post({ problemId, poster, lamports }) {
    if (this.#bounties.has(problemId)) {
      throw new BountyError(`a bounty for '${problemId}' already exists`);
    }
    const receipt = this.#ledger.transfer({
      from: poster,
      to: this.#escrow.address,
      lamports,
      memo: `bounty:${problemId}`,
    });
    const bounty = {
      problemId,
      poster: poster.address,
      lamports,
      status: 'open',
      postedTx: receipt.signature,
      settledTx: null,
      solver: null,
    };
    this.#bounties.set(problemId, bounty);
    return { ...bounty };
  }

  get(problemId) {
    const bounty = this.#bounties.get(problemId);
    return bounty ? { ...bounty } : null;
  }

  claim({ problemId, solverAddress, certificate, signature }) {
    const bounty = this.#requireOpen(problemId);
    if (!verifyCertificate({ certificate, signature })) {
      throw new BountyError('certificate signature is invalid');
    }
    if (certificate.authority !== this.#trustedAuthority) {
      throw new BountyError('certificate was not signed by the trusted verification authority');
    }
    if (certificate.problemId !== problemId) {
      throw new BountyError('certificate does not match this bounty');
    }
    if (certificate.solverAddress !== solverAddress) {
      throw new BountyError('certificate names a different solver');
    }
    const receipt = this.#ledger.transfer({
      from: this.#escrow,
      to: solverAddress,
      lamports: bounty.lamports,
      memo: `payout:${problemId}`,
    });
    bounty.status = 'paid';
    bounty.solver = solverAddress;
    bounty.settledTx = receipt.signature;
    return { ...receipt, lamports: bounty.lamports };
  }

  refund(problemId) {
    const bounty = this.#requireOpen(problemId);
    const receipt = this.#ledger.transfer({
      from: this.#escrow,
      to: bounty.poster,
      lamports: bounty.lamports,
      memo: `refund:${problemId}`,
    });
    bounty.status = 'refunded';
    bounty.settledTx = receipt.signature;
    return { ...receipt, lamports: bounty.lamports };
  }

  #requireOpen(problemId) {
    const bounty = this.#bounties.get(problemId);
    if (!bounty) throw new BountyError(`no bounty posted for '${problemId}'`);
    if (bounty.status !== 'open') {
      throw new BountyError(`bounty '${problemId}' is ${bounty.status}, not open`);
    }
    return bounty;
  }
}
