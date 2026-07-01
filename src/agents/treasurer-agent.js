import { BaseAgent } from './base-agent.js';

/** Bursar settles verified work: presents the certificate to the bounty board and pays the solver. */
export class TreasurerAgent extends BaseAgent {
  #board;

  constructor({ board }) {
    super({ id: 'agent.treasurer', name: 'Bursar', capabilities: ['settle'] });
    this.#board = board;
  }

  async perform({ problemId, solverAddress, certificate, signature }) {
    const receipt = this.#board.claim({ problemId, solverAddress, certificate, signature });
    return {
      problemId,
      solverAddress,
      lamports: receipt.lamports,
      txSignature: receipt.signature,
      slot: receipt.slot,
    };
  }
}
