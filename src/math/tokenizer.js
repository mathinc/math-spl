import { MathParseError } from '../errors.js';

const SINGLE_CHAR_TOKENS = new Set(['+', '-', '*', '/', '%', '^', '(', ')', ',']);
const NUMBER_PATTERN = /^\d*\.?\d+(?:[eE][+-]?\d+)?/;
const IDENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*/;

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = NUMBER_PATTERN.exec(source.slice(i));
      if (!match) {
        throw new MathParseError(`malformed number at position ${i} in "${source}"`);
      }
      tokens.push({ type: 'number', value: Number(match[0]), pos: i });
      i += match[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const match = IDENT_PATTERN.exec(source.slice(i));
      tokens.push({ type: 'ident', value: match[0], pos: i });
      i += match[0].length;
      continue;
    }
    if (SINGLE_CHAR_TOKENS.has(ch)) {
      tokens.push({ type: ch, pos: i });
      i += 1;
      continue;
    }
    throw new MathParseError(`unexpected character '${ch}' at position ${i} in "${source}"`);
  }
  tokens.push({ type: 'eof', pos: source.length });
  return tokens;
}
