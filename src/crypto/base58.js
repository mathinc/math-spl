/** Base58 (Bitcoin/Solana alphabet) — addresses and signatures render the way Solana's do. */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = 58n;
const INDEX = new Map([...ALPHABET].map((char, i) => [char, BigInt(i)]));

export function base58Encode(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length === 0) return '';
  let n = BigInt('0x' + (buffer.toString('hex') || '0'));
  let encoded = '';
  while (n > 0n) {
    encoded = ALPHABET[Number(n % BASE)] + encoded;
    n /= BASE;
  }
  let zeros = 0;
  while (zeros < buffer.length && buffer[zeros] === 0) zeros += 1;
  return '1'.repeat(zeros) + encoded;
}

export function base58Decode(text) {
  if (typeof text !== 'string') throw new TypeError('base58Decode expects a string');
  if (text.length === 0) return Buffer.alloc(0);
  let n = 0n;
  for (const char of text) {
    const digit = INDEX.get(char);
    if (digit === undefined) throw new TypeError(`invalid base58 character '${char}'`);
    n = n * BASE + digit;
  }
  let hex = n.toString(16);
  if (hex.length % 2 === 1) hex = '0' + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros += 1;
  return Buffer.concat([Buffer.alloc(zeros), body]);
}
