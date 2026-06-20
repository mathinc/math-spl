import { applyFunction, CONSTANTS } from './evaluator.js';
import { MathEvalError, UnsupportedProblemError } from '../errors.js';

/**
 * Dense polynomial arithmetic over the reals.
 * Coefficients are stored little-endian: [c0, c1, c2] = c0 + c1·x + c2·x².
 * The zero polynomial is the empty array, with degree -1.
 */

const MAX_EXPONENT = 32;

function trim(coefficients) {
  let length = coefficients.length;
  while (length > 0 && coefficients[length - 1] === 0) length -= 1;
  return coefficients.slice(0, length);
}

export function polyFromConstant(value) {
  return value === 0 ? [] : [value];
}

export function polyDegree(p) {
  return p.length - 1;
}

export function polyIsConstant(p) {
  return p.length <= 1;
}

export function polyConstantValue(p) {
  return p.length === 0 ? 0 : p[0];
}

export function polyAdd(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    out.push((a[i] ?? 0) + (b[i] ?? 0));
  }
  return trim(out);
}

export function polyNeg(a) {
  return a.map((c) => -c);
}

export function polySub(a, b) {
  return polyAdd(a, polyNeg(b));
}

export function polyMul(a, b) {
  if (a.length === 0 || b.length === 0) return [];
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      out[i + j] += a[i] * b[j];
    }
  }
  return trim(out);
}

export function polyScale(a, k) {
  return trim(a.map((c) => c * k));
}

export function polyPow(a, exponent) {
  let result = [1];
  for (let i = 0; i < exponent; i++) result = polyMul(result, a);
  return result;
}

/** Evaluate at a real x via Horner's method. */
export function polyEval(p, x) {
  let acc = 0;
  for (let i = p.length - 1; i >= 0; i--) acc = acc * x + p[i];
  return acc;
}

/**
 * Lower an expression AST into polynomial coefficients in `variable`.
 * Function calls and divisors must reduce to constants; exponents on the
 * variable must be non-negative integers. Anything else is either a math
 * error or an honest "this solver cannot handle that" refusal.
 */
export function toPolynomial(ast, variable) {
  switch (ast.type) {
    case 'number':
      return polyFromConstant(ast.value);
    case 'variable': {
      if (ast.name === variable) return [0, 1];
      if (CONSTANTS.has(ast.name)) return polyFromConstant(CONSTANTS.get(ast.name));
      throw new MathEvalError(`unknown variable '${ast.name}'`);
    }
    case 'unary': {
      const operand = toPolynomial(ast.operand, variable);
      return ast.op === '-' ? polyNeg(operand) : operand;
    }
    case 'binary': {
      const left = toPolynomial(ast.left, variable);
      const right = toPolynomial(ast.right, variable);
      switch (ast.op) {
        case '+': return polyAdd(left, right);
        case '-': return polySub(left, right);
        case '*': return polyMul(left, right);
        case '/': {
          if (!polyIsConstant(right)) {
            throw new UnsupportedProblemError(
              `cannot divide by an expression containing '${variable}'`,
            );
          }
          const divisor = polyConstantValue(right);
          if (divisor === 0) throw new MathEvalError('division by zero');
          return polyScale(left, 1 / divisor);
        }
        case '%': {
          if (!polyIsConstant(left) || !polyIsConstant(right)) {
            throw new UnsupportedProblemError(`cannot apply '%' to an expression containing '${variable}'`);
          }
          const divisor = polyConstantValue(right);
          if (divisor === 0) throw new MathEvalError('modulo by zero');
          return polyFromConstant(polyConstantValue(left) % divisor);
        }
        case '^': {
          if (!polyIsConstant(right)) {
            throw new UnsupportedProblemError(`exponent must not contain '${variable}'`);
          }
          const exponent = polyConstantValue(right);
          if (polyIsConstant(left)) {
            return polyFromConstant(polyConstantValue(left) ** exponent);
          }
          if (!Number.isInteger(exponent) || exponent < 0) {
            throw new UnsupportedProblemError(
              `'${variable}' may only be raised to a non-negative integer power, got ${exponent}`,
            );
          }
          if (exponent > MAX_EXPONENT) {
            throw new UnsupportedProblemError(`polynomial exponent too large (max ${MAX_EXPONENT})`);
          }
          return polyPow(left, exponent);
        }
        default:
          throw new MathEvalError(`unknown operator '${ast.op}'`);
      }
    }
    case 'call': {
      const args = ast.args.map((arg) => {
        const poly = toPolynomial(arg, variable);
        if (!polyIsConstant(poly)) {
          throw new UnsupportedProblemError(
            `function '${ast.name}' may not be applied to an expression containing '${variable}'`,
          );
        }
        return polyConstantValue(poly);
      });
      return polyFromConstant(applyFunction(ast.name, args));
    }
    default:
      throw new MathEvalError(`unknown AST node type '${ast.type}'`);
  }
}
