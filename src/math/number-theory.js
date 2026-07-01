import { MathEvalError } from '../errors.js';

/** Integer mathematics over BigInt, plus deliberately independent re-implementations
 *  (binaryGcd, isPrimeSlow, fibonacciIterative) used by the verifier. */

const abs = (n) => (n < 0n ? -n : n);

function assertBigInt(...values) {
  for (const value of values) {
    if (typeof value !== 'bigint') {
      throw new MathEvalError('number-theory functions require BigInt arguments');
    }
  }
}

/** Euclidean algorithm. */
export function gcd(a, b) {
  assertBigInt(a, b);
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Stein's binary GCD — a structurally different algorithm, for verification. */
export function binaryGcd(a, b) {
  assertBigInt(a, b);
  let x = abs(a);
  let y = abs(b);
  if (x === 0n) return y;
  if (y === 0n) return x;
  let shift = 0n;
  while (((x | y) & 1n) === 0n) {
    x >>= 1n;
    y >>= 1n;
    shift += 1n;
  }
  while ((x & 1n) === 0n) x >>= 1n;
  while (y !== 0n) {
    while ((y & 1n) === 0n) y >>= 1n;
    if (x > y) [x, y] = [y, x];
    y -= x;
  }
  return x << shift;
}

export function lcm(a, b) {
  assertBigInt(a, b);
  if (a === 0n || b === 0n) return 0n;
  return abs(a / gcd(a, b) * b);
}

/** Trial division over 6k ± 1 candidates. */
export function isPrime(n) {
  assertBigInt(n);
  if (n < 2n) return false;
  if (n < 4n) return true;
  if (n % 2n === 0n || n % 3n === 0n) return false;
  for (let i = 5n; i * i <= n; i += 6n) {
    if (n % i === 0n || n % (i + 2n) === 0n) return false;
  }
  return true;
}

/** Naive odd-divisor trial division — slower, simpler, independent. */
export function isPrimeSlow(n) {
  assertBigInt(n);
  if (n < 2n) return false;
  if (n === 2n) return true;
  if (n % 2n === 0n) return false;
  for (let d = 3n; d * d <= n; d += 2n) {
    if (n % d === 0n) return false;
  }
  return true;
}

/** Factor n ≥ 2 into [{ prime, exponent }], primes ascending. */
export function primeFactors(n) {
  assertBigInt(n);
  if (n < 2n) throw new MathEvalError('prime factorization requires an integer >= 2');
  const factors = [];
  let rest = n;
  const push = (prime) => {
    let exponent = 0n;
    while (rest % prime === 0n) {
      rest /= prime;
      exponent += 1n;
    }
    if (exponent > 0n) factors.push({ prime, exponent });
  };
  push(2n);
  push(3n);
  for (let candidate = 5n; candidate * candidate <= rest; candidate += 6n) {
    push(candidate);
    push(candidate + 2n);
  }
  if (rest > 1n) factors.push({ prime: rest, exponent: 1n });
  return factors;
}

export function formatFactorization(factors) {
  return factors
    .map(({ prime, exponent }) => (exponent === 1n ? `${prime}` : `${prime}^${exponent}`))
    .join(' * ');
}

/** Fast-doubling Fibonacci: F(2k) = F(k)·(2F(k+1) − F(k)), F(2k+1) = F(k)² + F(k+1)². */
export function fibonacci(n) {
  assertBigInt(n);
  if (n < 0n) throw new MathEvalError('fibonacci requires a non-negative integer');
  return fibPair(n)[0];
}

function fibPair(n) {
  if (n === 0n) return [0n, 1n];
  const [a, b] = fibPair(n >> 1n);
  const c = a * (2n * b - a);
  const d = a * a + b * b;
  return (n & 1n) === 1n ? [d, c + d] : [c, d];
}

/** Plain iterative Fibonacci, for verification. */
export function fibonacciIterative(n) {
  assertBigInt(n);
  if (n < 0n) throw new MathEvalError('fibonacci requires a non-negative integer');
  let a = 0n;
  let b = 1n;
  for (let i = 0n; i < n; i += 1n) {
    [a, b] = [b, a + b];
  }
  return a;
}
