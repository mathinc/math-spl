import { tokenize } from './tokenizer.js';
import { MathParseError } from '../errors.js';

/**
 * Recursive-descent parser for arithmetic expressions.
 *
 * Grammar (highest precedence last):
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/' | '%') factor | factor)*   -- bare factor = implicit multiplication
 *   factor     := ('+' | '-') factor | power
 *   power      := primary ('^' factor)?                          -- right-associative
 *   primary    := number | ident '(' args ')' | ident | '(' expression ')'
 *
 * Implicit multiplication makes "2x", "3(x+1)" and "(x+1)(x-1)" parse naturally.
 * Unary minus binds looser than '^', so "-2^2" is -(2^2) = -4, as in mathematics.
 */
export function parseExpression(source) {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const token = next();
    if (token.type !== type) {
      throw new MathParseError(
        `expected '${type}' but found '${token.type}' at position ${token.pos} in "${source}"`,
      );
    }
    return token;
  };

  const startsFactor = (token) =>
    token.type === 'number' || token.type === 'ident' || token.type === '(';

  function expression() {
    let node = term();
    while (peek().type === '+' || peek().type === '-') {
      const op = next().type;
      node = { type: 'binary', op, left: node, right: term() };
    }
    return node;
  }

  function term() {
    let node = factor();
    for (;;) {
      const token = peek();
      if (token.type === '*' || token.type === '/' || token.type === '%') {
        next();
        node = { type: 'binary', op: token.type, left: node, right: factor() };
      } else if (startsFactor(token)) {
        node = { type: 'binary', op: '*', left: node, right: factor() };
      } else {
        return node;
      }
    }
  }

  function factor() {
    const token = peek();
    if (token.type === '+' || token.type === '-') {
      next();
      return { type: 'unary', op: token.type, operand: factor() };
    }
    return power();
  }

  function power() {
    const base = primary();
    if (peek().type === '^') {
      next();
      return { type: 'binary', op: '^', left: base, right: factor() };
    }
    return base;
  }

  function primary() {
    const token = next();
    if (token.type === 'number') {
      return { type: 'number', value: token.value };
    }
    if (token.type === 'ident') {
      if (peek().type === '(') {
        next();
        const args = [];
        if (peek().type !== ')') {
          args.push(expression());
          while (peek().type === ',') {
            next();
            args.push(expression());
          }
        }
        expect(')');
        return { type: 'call', name: token.value, args };
      }
      return { type: 'variable', name: token.value };
    }
    if (token.type === '(') {
      const node = expression();
      expect(')');
      return node;
    }
    throw new MathParseError(
      `unexpected token '${token.type}' at position ${token.pos} in "${source}"`,
    );
  }

  const ast = expression();
  expect('eof');
  return ast;
}

/** Collect free variable names in an AST, skipping anything in `exclude` (e.g. named constants). */
export function collectVariables(ast, exclude = new Set()) {
  const found = new Set();
  (function walk(node) {
    switch (node.type) {
      case 'variable':
        if (!exclude.has(node.name)) found.add(node.name);
        break;
      case 'unary':
        walk(node.operand);
        break;
      case 'binary':
        walk(node.left);
        walk(node.right);
        break;
      case 'call':
        node.args.forEach(walk);
        break;
    }
  })(ast);
  return found;
}
