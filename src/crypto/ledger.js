import { canonicalBytes } from './canonical.js';
import { sha256 } from './hashing.js';
import { base58Encode, base58Decode } from './base58.js';
import { verifySignature } from './keypair.js';
import { LedgerError } from '../errors.js';

const GENESIS_SEED = 'pam-genesis-block';

/**
 * In-memory Solana-style ledger. Balances are lamports (BigInt). Every
 * transfer is an ed25519-signed transaction, and every committed entry
 * advances a blockhash chain. Educational simulation — no network.
 */
export class Ledger {
  #accounts = new Map();
  #history = [];
  #slot = 0;
  #blockhash = base58Encode(sha256(Buffer.from(GENESIS_SEED)));
  #minted = 0n;

  get slot() {
    return this.#slot;
  }

  get blockhash() {
    return this.#blockhash;
  }

  get history() {
    return [...this.#history];
  }

  balance(address) {
    return this.#accounts.get(address) ?? 0n;
  }

  totalSupply() {
    return this.#minted;
  }

  sumOfBalances() {
    let sum = 0n;
    for (const balance of this.#accounts.values()) sum += balance;
    return sum;
  }

  /** Mint lamports out of thin air (test faucet). Increases total supply. */
  airdrop(address, lamports) {
    this.#assertLamports(lamports);
    this.#accounts.set(address, this.balance(address) + lamports);
    this.#minted += lamports;
    return this.#commit(
      { type: 'airdrop', to: address, lamports: lamports.toString(), slot: this.#slot },
      null,
    );
  }

  /** Move lamports from a keypair-held account to an address, signed and verified. */
  transfer({ from, to, lamports, memo = null }) {
    this.#assertLamports(lamports);
    const tx = {
      type: 'transfer',
      slot: this.#slot,
      recentBlockhash: this.#blockhash,
      from: from.address,
      to,
      lamports: lamports.toString(),
      memo,
      timestamp: Date.now(),
    };
    const message = canonicalBytes(tx);
    const signature = from.sign(message);
    if (!verifySignature({ address: tx.from, message, signature })) {
      throw new LedgerError('transaction signature failed verification');
    }
    const available = this.balance(tx.from);
    if (available < lamports) {
      throw new LedgerError(
        `insufficient funds: ${tx.from} holds ${available} lamports, needs ${lamports}`,
      );
    }
    this.#accounts.set(tx.from, available - lamports);
    this.#accounts.set(to, this.balance(to) + lamports);
    return this.#commit(tx, signature);
  }

  #commit(tx, signature) {
    const seal = signature ?? canonicalBytes(tx);
    this.#blockhash = base58Encode(sha256(Buffer.concat([base58Decode(this.#blockhash), seal])));
    this.#slot += 1;
    const entry = {
      slot: this.#slot,
      tx,
      signature: signature ? base58Encode(signature) : null,
      blockhash: this.#blockhash,
    };
    this.#history.push(entry);
    return { signature: entry.signature, slot: entry.slot, blockhash: entry.blockhash };
  }

  #assertLamports(lamports) {
    if (typeof lamports !== 'bigint' || lamports <= 0n) {
      throw new LedgerError('lamports must be a positive BigInt');
    }
  }
}
