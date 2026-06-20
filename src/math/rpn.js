import { CONSTANTS, applyFunction } from './evaluator.js';
import { MathEvalError } from '../errors.js';

/**
 * A second, structurally different evaluation path: compile the AST to RPN
 * and run it on a stack machine. The verifier uses this so that a bug in the
 * tree-walking evaluator cannot silently confirm its own wrong answer.
 */

export function compileToRpn(ast, program = []) {
  switch (ast.type) {
    case 'number':
      program.push({ op: 'push', value: ast.value });
      break;
    case 'variable':
      program.push({ op: 'load', name: ast.name });
      break;
    case 'unary':
      compileToRpn(ast.operand, program);
      if (ast.op === '-') program.push({ op: 'neg' });
      break;
    case 'binary':
      compileToRpn(ast.left, program);
      compileToRpn(ast.right, program);
      program.push({ op: ast.op });
      break;
    case 'call':
      for (const arg of ast.args) compileToRpn(arg, program);
      program.push({ op: 'call', name: ast.name, argc: ast.args.length });
      break;
    default:
      throw new MathEvalError(`cannot compile AST node type '${ast.type}'`);
  }
  return program;
}

export function runRpn(program, env = {}) {
  const stack = [];
  for (const instr of program) {
    switch (instr.op) {
      case 'push':
        stack.push(instr.value);
        break;
      case 'load':
        if (Object.hasOwn(env, instr.name)) stack.push(env[instr.name]);
        else if (CONSTANTS.has(instr.name)) stack.push(CONSTANTS.get(instr.name));
        else throw new MathEvalError(`unknown variable '${instr.name}'`);
        break;
      case 'neg':
        stack.push(-stack.pop());
        break;
      case 'call':
        stack.push(applyFunction(instr.name, stack.splice(stack.length - instr.argc, instr.argc)));
        break;
      default: {
        const b = stack.pop();
        const a = stack.pop();
        switch (instr.op) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/':
            if (b === 0) throw new MathEvalError('division by zero');
            stack.push(a / b);
            break;
          case '%':
            if (b === 0) throw new MathEvalError('modulo by zero');
            stack.push(a % b);
            break;
          case '^': stack.push(a ** b); break;
          default:
            throw new MathEvalError(`unknown instruction '${instr.op}'`);
        }
      }
    }
  }
  if (stack.length !== 1) throw new MathEvalError('rpn program left a malformed stack');
  return stack[0];
}
