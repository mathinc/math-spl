import { BaseAgent } from './base-agent.js';
import { issueCertificate } from '../crypto/certificate.js';

/**
 * Notary is the verification authority: its wallet signs solution
 * certificates, and the bounty board only pays against its signature.
 */
export class CertifierAgent extends BaseAgent {
  constructor({ wallet }) {
    super({ id: 'agent.certifier', name: 'Notary', capabilities: ['certify'], wallet });
  }

  async perform({ problem, parsed, solution, verification, solver }) {
    return issueCertificate({
      authority: this.wallet,
      problem,
      kind: parsed.kind,
      solutionDisplay: solution.display,
      solverId: solver.id,
      solverAddress: solver.address,
      verificationMethod: verification.method,
    });
  }
}
