import { formatNumber } from './evaluator.js';

/** Minimal complex arithmetic — just enough to state and check quadratic roots. */

export const complex = (re, im = 0) => ({ re, im });

export function cAdd(a, b) {
  return complex(a.re + b.re, a.im + b.im);
}

export function cMul(a, b) {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

export function cAbs(a) {
  return Math.hypot(a.re, a.im);
}

/** Evaluate a real-coefficient polynomial at a complex point via Horner's method. */
export function polyEvalComplex(coefficients, z) {
  let acc = complex(0);
  for (let i = coefficients.length - 1; i >= 0; i--) {
    acc = cAdd(cMul(acc, z), complex(coefficients[i]));
  }
  return acc;
}

export function formatComplex({ re, im }) {
  if (im === 0) return formatNumber(re);
  const imaginary = `${formatNumber(Math.abs(im))}i`;
  if (re === 0) return im < 0 ? `-${imaginary}` : imaginary;
  return `${formatNumber(re)} ${im < 0 ? '-' : '+'} ${imaginary}`;
}
