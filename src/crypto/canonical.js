/**
 * Canonical JSON: recursively sorted object keys so that signing and verifying
 * always see byte-identical messages. BigInt is rejected on purpose — callers
 * must stringify amounts explicitly before signing.
 */

function normalize(value) {
  if (value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('cannot canonicalize a non-finite number');
    return value;
  }
  if (type === 'bigint') {
    throw new TypeError('BigInt must be converted to a string before canonicalization');
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (type === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = normalize(value[key]);
    return sorted;
  }
  throw new TypeError(`cannot canonicalize a value of type '${type}'`);
}

export function canonicalize(value) {
  return JSON.stringify(normalize(value));
}

export function canonicalBytes(value) {
  return Buffer.from(canonicalize(value), 'utf8');
}
