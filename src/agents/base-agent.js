import { PamError } from '../errors.js';

/**
 * Base class for all agents. Subclasses implement `perform(task, ctx)`.
 * `handle` wraps perform with bookkeeping so the orchestrator and reports
 * can see per-agent workload without agents doing anything special.
 */
export class BaseAgent {
  constructor({ id, name, capabilities, wallet = null }) {
    this.id = id;
    this.name = name;
    this.capabilities = capabilities;
    this.wallet = wallet;
    this.stats = { handled: 0, failed: 0, totalMs: 0 };
  }

  get address() {
    return this.wallet?.address ?? null;
  }

  async handle(task, ctx) {
    const startedAt = performance.now();
    try {
      const result = await this.perform(task, ctx);
      this.stats.handled += 1;
      return result;
    } catch (error) {
      this.stats.failed += 1;
      throw error;
    } finally {
      this.stats.totalMs += performance.now() - startedAt;
    }
  }

  // eslint-disable-next-line no-unused-vars
  async perform(task, ctx) {
    throw new PamError(`agent '${this.name}' does not implement perform()`);
  }
}
