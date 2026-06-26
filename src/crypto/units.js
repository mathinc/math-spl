import { LedgerError } from '../errors.js';

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Convert a SOL amount (number, up to 9 decimal places) to lamports. */
export function solToLamports(sol) {
  if (typeof sol !== 'number' || !Number.isFinite(sol) || sol < 0) {
    throw new LedgerError(`invalid SOL amount: ${sol}`);
  }
  return BigInt(Math.round(sol * 1e9));
}

export function lamportsToSol(lamports) {
  return Number(lamports) / 1e9;
}

export function formatSol(lamports) {
  const negative = lamports < 0n;
  const magnitude = negative ? -lamports : lamports;
  const whole = magnitude / LAMPORTS_PER_SOL;
  const fraction = magnitude % LAMPORTS_PER_SOL;
  const body = fraction === 0n
    ? `${whole}`
    : `${whole}.${fraction.toString().padStart(9, '0').replace(/0+$/, '')}`;
  return `${negative ? '-' : ''}${body} SOL`;
}
