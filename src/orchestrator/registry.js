import { PamError } from '../errors.js';

/** Capability-based agent lookup. First registered agent for a capability wins. */
export class AgentRegistry {
  #agents = [];

  register(agent) {
    this.#agents.push(agent);
    return this;
  }

  resolve(capability) {
    const agent = this.#agents.find((candidate) => candidate.capabilities.includes(capability));
    if (!agent) throw new PamError(`no registered agent provides capability '${capability}'`);
    return agent;
  }

  all() {
    return [...this.#agents];
  }
}
