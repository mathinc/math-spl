import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { base58Encode, base58Decode } from '../src/crypto/base58.js';
import { canonicalize, canonicalBytes } from '../src/crypto/canonical.js';
import { Keypair, verifySignature } from '../src/crypto/keypair.js';
import { sha256Hex } from '../src/crypto/hashing.js';

describe('base58', () => {
  it('matches the well-known test vector', () => {
    assert.equal(base58Encode(Buffer.from('hello world')), 'StV1DL6CwTryKyV');
  });

  it('round-trips arbitrary bytes', () => {
    const samples = [
      Buffer.alloc(0),
      Buffer.from([0]),
      Buffer.from([0, 0, 1]),
      Buffer.from([255, 254, 253]),
      Buffer.from('The quick brown fox'),
    ];
    for (const sample of samples) {
      assert.deepEqual(base58Decode(base58Encode(sample)), sample);
    }
  });

  it('preserves leading zero bytes as leading 1s', () => {
    assert.equal(base58Encode(Buffer.from([0, 0, 1])), '112');
    assert.deepEqual(base58Decode('112'), Buffer.from([0, 0, 1]));
  });

  it('rejects characters outside the alphabet', () => {
    assert.throws(() => base58Decode('0OIl'), TypeError);
  });
});

describe('canonical JSON', () => {
  it('sorts keys recursively and deterministically', () => {
    assert.equal(
      canonicalize({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }),
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
    assert.equal(
      canonicalize({ x: 1, y: 2 }),
      canonicalize({ y: 2, x: 1 }),
    );
  });

  it('rejects BigInt and non-finite numbers', () => {
    assert.throws(() => canonicalize({ amount: 5n }), TypeError);
    assert.throws(() => canonicalize({ value: Infinity }), TypeError);
  });
});

describe('ed25519 keypair', () => {
  it('derives a 32-byte base58 address from the public key', () => {
    const keypair = Keypair.generate();
    const decoded = base58Decode(keypair.address);
    assert.equal(decoded.length, 32);
    assert.deepEqual(decoded, keypair.publicKeyBytes);
  });

  it('signs messages the address can verify', () => {
    const keypair = Keypair.generate();
    const message = canonicalBytes({ hello: 'world', n: 42 });
    const signature = keypair.sign(message);
    assert.equal(signature.length, 64);
    assert.equal(verifySignature({ address: keypair.address, message, signature }), true);
  });

  it('rejects tampered messages, signatures, and wrong signers', () => {
    const keypair = Keypair.generate();
    const other = Keypair.generate();
    const message = Buffer.from('pay the solver 1 SOL');
    const signature = keypair.sign(message);

    assert.equal(
      verifySignature({ address: keypair.address, message: Buffer.from('pay the solver 9 SOL'), signature }),
      false,
    );
    const forged = Buffer.from(signature);
    forged[0] ^= 0xff;
    assert.equal(verifySignature({ address: keypair.address, message, signature: forged }), false);
    assert.equal(verifySignature({ address: other.address, message, signature }), false);
    assert.equal(verifySignature({ address: 'not-base58-0OIl', message, signature }), false);
  });
});

describe('hashing', () => {
  it('computes stable sha256 digests', () => {
    assert.equal(
      sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
