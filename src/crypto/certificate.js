import { canonicalBytes } from './canonical.js';
import { sha256Hex } from './hashing.js';
import { base58Encode, base58Decode } from './base58.js';
import { verifySignature } from './keypair.js';

export const CERTIFICATE_VERSION = 1;

/**
 * A solution certificate: the verification authority's signed statement that
 * a specific solver produced a verified answer to a specific problem. The
 * bounty board only pays out against a certificate whose signature checks out
 * against the authority address it trusts.
 */
export function issueCertificate({
  authority,
  problem,
  kind,
  solutionDisplay,
  solverId,
  solverAddress,
  verificationMethod,
}) {
  const certificate = {
    version: CERTIFICATE_VERSION,
    problemId: problem.id,
    problemHash: sha256Hex(problem.text),
    kind,
    solutionDisplay,
    solverId,
    solverAddress,
    verificationMethod,
    authority: authority.address,
    issuedAt: new Date().toISOString(),
  };
  const signature = base58Encode(authority.sign(canonicalBytes(certificate)));
  return { certificate, signature };
}

export function verifyCertificate({ certificate, signature }) {
  if (certificate?.version !== CERTIFICATE_VERSION) return false;
  try {
    return verifySignature({
      address: certificate.authority,
      message: canonicalBytes(certificate),
      signature: base58Decode(signature),
    });
  } catch {
    return false;
  }
}
