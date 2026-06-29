import { BaseAgent } from './base-agent.js';
import { parseExpression, collectVariables } from '../math/parser.js';
import { CONSTANTS } from '../math/evaluator.js';
import { MathParseError, UnsupportedProblemError } from '../errors.js';

const DIRECTIVES = new Set([
  'evaluate', 'solve', 'gcd', 'lcm', 'prime-factors', 'is-prime', 'fibonacci', 'stats',
]);

function parseIntegerList(payload, expected) {
  const parts = payload.split(',').map((part) => part.trim());
  if (parts.length !== expected) {
    throw new MathParseError(`expected ${expected} integer(s), got ${parts.length} in "${payload}"`);
  }
  return parts.map((part) => {
    if (!/^[+-]?\d+$/.test(part)) throw new MathParseError(`'${part}' is not an integer`);
    return BigInt(part);
  });
}

function parseNumberList(payload) {
  const parts = payload.split(',').map((part) => part.trim());
  return parts.map((part) => {
    const value = Number(part);
    if (part === '' || !Number.isFinite(value)) {
      throw new MathParseError(`'${part}' is not a number`);
    }
    return value;
  });
}

/**
 * Lexis turns raw problem text of the form "<directive>: <payload>" into a
 * structured task the rest of the pipeline can work with.
 */
export class ParserAgent extends BaseAgent {
  constructor({ wallet } = {}) {
    super({ id: 'agent.parser', name: 'Lexis', capabilities: ['parse'], wallet });
  }

  async perform({ text }) {
    const colon = text.indexOf(':');
    if (colon < 0) {
      throw new MathParseError(`problem text needs the form '<directive>: <payload>' — got "${text}"`);
    }
    const directive = text.slice(0, colon).trim().toLowerCase();
    const payload = text.slice(colon + 1).trim();
    if (!DIRECTIVES.has(directive)) {
      throw new UnsupportedProblemError(`unknown directive '${directive}'`);
    }
    if (payload.length === 0) {
      throw new MathParseError(`directive '${directive}' has an empty payload`);
    }
    switch (directive) {
      case 'evaluate':
        return { kind: 'evaluate', text: payload, ast: parseExpression(payload) };
      case 'solve':
        return this.#parseEquation(payload);
      case 'gcd':
      case 'lcm': {
        const [a, b] = parseIntegerList(payload, 2);
        return { kind: directive, a, b };
      }
      case 'prime-factors':
      case 'is-prime':
      case 'fibonacci': {
        const [n] = parseIntegerList(payload, 1);
        return { kind: directive, n };
      }
      case 'stats':
        return { kind: 'stats', values: parseNumberList(payload) };
    }
  }

  #parseEquation(payload) {
    const sides = payload.split('=');
    if (sides.length !== 2) {
      throw new MathParseError(`an equation needs exactly one '=' — got "${payload}"`);
    }
    const lhs = parseExpression(sides[0]);
    const rhs = parseExpression(sides[1]);
    const variables = new Set([
      ...collectVariables(lhs, CONSTANTS),
      ...collectVariables(rhs, CONSTANTS),
    ]);
    if (variables.size > 1) {
      throw new UnsupportedProblemError(
        `multivariate equations are not supported (found: ${[...variables].join(', ')})`,
      );
    }
    const variable = variables.size === 1 ? [...variables][0] : 'x';
    return { kind: 'solve', text: payload, lhs, rhs, variable };
  }
}
