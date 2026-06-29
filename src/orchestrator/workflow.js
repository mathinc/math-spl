/**
 * A workflow is an ordered list of stages plus failure handlers (compensation).
 *
 * Stage definition:
 *   capability  string, or (ctx) => string for routing decided at runtime
 *   task        (ctx) => task object handed to the agent (defaults to ctx itself)
 *   save        artifact key to store the stage result under
 *   retries     per-stage override of the orchestrator's retry count
 *   timeoutMs   per-stage override of the orchestrator's timeout
 */
export class Workflow {
  constructor(name) {
    this.name = name;
    this.stages = [];
    this.failureHandlers = [];
  }

  stage(name, { capability, task, save, retries, timeoutMs } = {}) {
    this.stages.push({ name, capability, task, save, retries, timeoutMs });
    return this;
  }

  onFailure(handler) {
    this.failureHandlers.push(handler);
    return this;
  }
}
