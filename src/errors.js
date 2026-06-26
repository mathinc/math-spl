/**
 * Error taxonomy for PAM.
 *
 * Errors marked `fatal = true` are deterministic — retrying the same input
 * cannot succeed, so the orchestrator fails the stage immediately instead of
 * burning retry attempts. Everything else (timeouts, transient faults) is
 * considered retryable.
 */

export class PamError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class StageTimeoutError extends PamError {
  constructor(stage, timeoutMs) {
    super(`stage '${stage}' timed out after ${timeoutMs}ms`);
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

export class StageFailedError extends PamError {
  constructor(stage, cause) {
    super(`stage '${stage}' failed: ${cause.message}`, { cause });
    this.stage = stage;
  }
}

export class MathParseError extends PamError {
  fatal = true;
}

export class MathEvalError extends PamError {
  fatal = true;
}

export class UnsupportedProblemError extends PamError {
  fatal = true;
}

export class VerificationError extends PamError {
  fatal = true;
}

export class LedgerError extends PamError {
  fatal = true;
}

export class BountyError extends PamError {
  fatal = true;
}
