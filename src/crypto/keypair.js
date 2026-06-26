import { generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';
import { base58Encode, base58Decode } from './base58.js';

/**
 * Ed25519 keypair, Solana-style: the address IS the base58-encoded 32-byte
 * public key, so anyone holding an address can verify signatures from it
 * without a separate key registry.
 */

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export class Keypair {
  #privateKey;
  #publicKeyBytes;
  #address;

  constructor(privateKey, publicKeyBytes) {
    this.#privateKey = privateKey;
    this.#publicKeyBytes = publicKeyBytes;
    this.#address = base58Encode(publicKeyBytes);
  }

  static generate() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    return new Keypair(privateKey, Buffer.from(der.subarray(der.length - 32)));
  }

  get publicKeyBytes() {
    return Buffer.from(this.#publicKeyBytes);
  }

  get address() {
    return this.#address;
  }

  /** Sign a Buffer, returning the raw 64-byte ed25519 signature. */
  sign(message) {
    return edSign(null, message, this.#privateKey);
  }
}

/** Verify a signature against the public key embedded in a base58 address. */
export function verifySignature({ address, message, signature }) {
  let raw;
  try {
    raw = base58Decode(address);
  } catch {
    return false;
  }
  if (raw.length !== 32) return false;
  const publicKey = createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
  try {
    return edVerify(null, message, publicKey, signature);
  } catch {
    return false;
  }
}
