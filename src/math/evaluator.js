import { MathEvalError } from '../errors.js';

/** Tree-walking evaluator. `env` maps variable names to numbers. */
export function evaluate(ast, env = {}) {
  switch (ast.type) {
    case 'number':
      return ast.value;
    case 'variable': {
      if (Object.hasOwn(env, ast.name)) return env[ast.name];
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
    default:
      throw new MathEvalError(`unknown AST node type '${ast.type}'`);
  }
}
