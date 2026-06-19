import { MathEvalError } from '../errors.js';

export const CONSTANTS = new Map([
  ['pi', Math.PI],
  ['e', Math.E],
  ['tau', Math.PI * 2],
  ['phi', (1 + Math.sqrt(5)) / 2],
]);

const unary = (fn) => ({ arity: 1, fn });

export const FUNCTIONS = new Map([
  ['sqrt', unary((x) => {
    if (x < 0) throw new MathEvalError('sqrt of a negative number');
    return Math.sqrt(x);
  })],
  ['cbrt', unary(Math.cbrt)],
  ['abs', unary(Math.abs)],
  ['sin', unary(Math.sin)],
  ['cos', unary(Math.cos)],
  ['tan', unary(Math.tan)],
  ['asin', unary(Math.asin)],
  ['acos', unary(Math.acos)],
  ['atan', unary(Math.atan)],
  ['ln', unary(Math.log)],
  ['log', unary(Math.log10)],
  ['log2', unary(Math.log2)],
  ['exp', unary(Math.exp)],
  ['floor', unary(Math.floor)],
  ['ceil', unary(Math.ceil)],
  ['round', unary(Math.round)],
  ['sign', unary(Math.sign)],
  ['pow', { arity: 2, fn: Math.pow }],
  ['min', { arity: 'variadic', fn: Math.min }],
  ['max', { arity: 'variadic', fn: Math.max }],
  ['hypot', { arity: 'variadic', fn: Math.hypot }],
]);

export function applyFunction(name, args) {
  const def = FUNCTIONS.get(name);
  if (!def) throw new MathEvalError(`unknown function '${name}'`);
  if (def.arity === 'variadic') {
    if (args.length === 0) {
      throw new MathEvalError(`function '${name}' expects at least one argument`);
    }
  } else if (args.length !== def.arity) {
    throw new MathEvalError(
      `function '${name}' expects ${def.arity} argument(s), got ${args.length}`,
    );
  }
  return def.fn(...args);
}

/** Tree-walking evaluator. `env` maps variable names to numbers. */
export function evaluate(ast, env = {}) {
  switch (ast.type) {
    case 'number':
      return ast.value;
    case 'variable': {
      if (Object.hasOwn(env, ast.name)) return env[ast.name];
      if (CONSTANTS.has(ast.name)) return CONSTANTS.get(ast.name);
      throw new MathEvalError(`unknown variable '${ast.name}'`);
    }
    case 'unary': {
      const value = evaluate(ast.operand, env);
      return ast.op === '-' ? -value : value;
    }
    case 'binary': {
      const a = evaluate(ast.left, env);
      const b = evaluate(ast.right, env);
      switch (ast.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
          if (b === 0) throw new MathEvalError('division by zero');
          return a / b;
        case '%':
          if (b === 0) throw new MathEvalError('modulo by zero');
          return a % b;
        case '^': return a ** b;
        default:
          throw new MathEvalError(`unknown operator '${ast.op}'`);
      }
    }
    case 'call':
      return applyFunction(ast.name, ast.args.map((arg) => evaluate(arg, env)));
    default:
      throw new MathEvalError(`unknown AST node type '${ast.type}'`);
  }
}

/** Render a number without float noise: integers stay exact, others get 12 significant digits. */
export function formatNumber(x) {
  if (!Number.isFinite(x)) return String(x);
  const rounded = Math.round(x);
  if (Math.abs(x - rounded) < 1e-12 * Math.max(1, Math.abs(x))) return String(rounded);
  return String(Number(x.toPrecision(12)));
}
