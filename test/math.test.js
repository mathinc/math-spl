import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from '../src/math/tokenizer.js';
import { parseExpression, collectVariables } from '../src/math/parser.js';
import { evaluate, formatNumber, CONSTANTS } from '../src/math/evaluator.js';
import { compileToRpn, runRpn } from '../src/math/rpn.js';
import { toPolynomial, polyDegree, polyEval } from '../src/math/polynomial.js';
import { MathParseError, MathEvalError, UnsupportedProblemError } from '../src/errors.js';

const evalText = (text, env) => evaluate(parseExpression(text), env);

describe('tokenizer', () => {
  it('tokenizes numbers, identifiers, and operators', () => {
    const tokens = tokenize('2 * sqrt(x_1) + 3.5e2');
    assert.deepEqual(
      tokens.map((t) => t.type),
      ['number', '*', 'ident', '(', 'ident', ')', '+', 'number', 'eof'],
    );
    assert.equal(tokens[7].value, 350);
  });

  it('rejects unknown characters with a position', () => {
    assert.throws(() => tokenize('2 @ 3'), MathParseError);
  });
});

describe('parser and evaluator', () => {
  it('respects precedence and associativity', () => {
    assert.equal(evalText('2 + 3 * 4'), 14);
    assert.equal(evalText('(2 + 3) * 4'), 20);
    assert.equal(evalText('2 ^ 3 ^ 2'), 512); // right-associative
    assert.equal(evalText('-2^2'), -4); // unary minus binds looser than ^
    assert.equal(evalText('10 % 3'), 1);
    assert.equal(evalText('2 / 4'), 0.5);
  });

  it('supports implicit multiplication', () => {
    assert.equal(evalText('2x', { x: 5 }), 10);
    assert.equal(evalText('3(4 + 1)'), 15);
    assert.equal(evalText('(1 + 1)(2 + 2)'), 8);
  });

  it('evaluates functions and constants', () => {
    assert.equal(evalText('sqrt(144)'), 12);
    assert.equal(evalText('min(3, 1, 2)'), 1);
    assert.equal(evalText('pow(2, 10)'), 1024);
    assert.ok(Math.abs(evalText('sin(pi)')) < 1e-12);
    assert.equal(evalText('ln(e)'), 1);
  });

  it('rejects malformed input and bad evaluations', () => {
    assert.throws(() => parseExpression('2 +'), MathParseError);
    assert.throws(() => parseExpression('(1 + 2'), MathParseError);
    assert.throws(() => evalText('nope(3)'), MathEvalError);
    assert.throws(() => evalText('sqrt(1, 2)'), MathEvalError);
    assert.throws(() => evalText('y + 1'), MathEvalError);
    assert.throws(() => evalText('1 / 0'), MathEvalError);
    assert.throws(() => evalText('sqrt(-1)'), MathEvalError);
  });

  it('collects free variables, excluding constants', () => {
    const ast = parseExpression('2x + pi * y - sqrt(z)');
    assert.deepEqual([...collectVariables(ast, CONSTANTS)].sort(), ['x', 'y', 'z']);
  });

  it('formats numbers without float noise', () => {
    assert.equal(formatNumber(56), '56');
    assert.equal(formatNumber(0.1 + 0.2), '0.3');
    assert.equal(formatNumber(1.0000000000000002), '1');
  });
});

describe('rpn stack machine', () => {
  it('agrees with the tree-walking evaluator', () => {
    const samples = [
      '2 + 3 * 4 - 5',
      '-2^2 + sqrt(16)',
      'min(3, 1, 2) * max(5, 8)',
      'sin(pi / 6) + cos(pi / 3)',
      '2x^2 - 3x + 1',
    ];
    for (const text of samples) {
      const ast = parseExpression(text);
      const env = { x: 2.5 };
      assert.ok(
        Math.abs(runRpn(compileToRpn(ast), env) - evaluate(ast, env)) < 1e-12,
        `disagreement on "${text}"`,
      );
    }
  });
});

describe('polynomial lowering', () => {
  it('lowers expressions to coefficients', () => {
    assert.deepEqual(toPolynomial(parseExpression('x^2 - 5x + 6'), 'x'), [6, -5, 1]);
    assert.deepEqual(toPolynomial(parseExpression('(x + 1)(x - 1)'), 'x'), [-1, 0, 1]);
    assert.deepEqual(toPolynomial(parseExpression('2(x + 3) - 2x'), 'x'), [6]);
    assert.deepEqual(toPolynomial(parseExpression('x - x'), 'x'), []);
    assert.deepEqual(toPolynomial(parseExpression('sqrt(9) * x'), 'x'), [0, 3]);
  });

  it('reports degree and evaluates via Horner', () => {
    const p = toPolynomial(parseExpression('x^3 - 2x + 1'), 'x');
    assert.equal(polyDegree(p), 3);
    assert.equal(polyEval(p, 2), 5);
    assert.equal(polyDegree([]), -1);
  });

  it('refuses what it cannot represent', () => {
    assert.throws(() => toPolynomial(parseExpression('1 / x'), 'x'), UnsupportedProblemError);
    assert.throws(() => toPolynomial(parseExpression('x ^ x'), 'x'), UnsupportedProblemError);
    assert.throws(() => toPolynomial(parseExpression('x ^ 2.5'), 'x'), UnsupportedProblemError);
    assert.throws(() => toPolynomial(parseExpression('sqrt(x)'), 'x'), UnsupportedProblemError);
  });
});
