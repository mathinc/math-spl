import { MathEvalError } from '../errors.js';

function assertSample(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new MathEvalError('statistics require a non-empty array of numbers');
  }
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new MathEvalError(`'${value}' is not a finite number`);
    }
  }
}

function modeOf(values) {
  const frequency = new Map();
  for (const value of values) frequency.set(value, (frequency.get(value) ?? 0) + 1);
  const top = Math.max(...frequency.values());
  if (top === 1) return [];
  return [...frequency.entries()]
    .filter(([, count]) => count === top)
    .map(([value]) => value)
    .sort((a, b) => a - b);
}

/** Population statistics for a sample. */
export function describe(values) {
  assertSample(values);
  const count = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  return {
    count,
    sum,
    mean,
    median,
    mode: modeOf(values),
    min: sorted[0],
    max: sorted[count - 1],
    variance,
    stddev: Math.sqrt(variance),
  };
}

/**
 * The same statistics computed with different formulations (running mean,
 * E[x²] − μ² variance, median from a descending sort) — the verifier's
 * independent path.
 */
export function describeIndependently(values) {
  assertSample(values);
  const count = values.length;
  let mean = 0;
  values.forEach((value, i) => {
    mean += (value - mean) / (i + 1);
  });
  const meanOfSquares = values.reduce((acc, v) => acc + v * v, 0) / count;
  const variance = Math.max(0, meanOfSquares - mean * mean);
  const descending = [...values].sort((a, b) => b - a);
  const mid = Math.floor(count / 2);
  const median = count % 2 === 1 ? descending[mid] : (descending[mid - 1] + descending[mid]) / 2;
  const sum = [...values].reverse().reduce((acc, v) => acc + v, 0);
  return {
    count,
    sum,
    mean,
    median,
    mode: modeOf(values),
    min: descending[count - 1],
    max: descending[0],
    variance,
    stddev: Math.sqrt(variance),
  };
}
