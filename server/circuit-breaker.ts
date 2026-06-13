

export type CBState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {

  name: string;

  failureThreshold?: number;

  resetTimeoutMs?: number;

  successThreshold?: number;
}

export class CircuitBreaker {
  private state: CBState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs   = opts.resetTimeoutMs   ?? 30_000;
    this.successThreshold = opts.successThreshold ?? 2;
  }

async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.resetTimeoutMs) {
        const waitSec = Math.ceil((this.resetTimeoutMs - elapsed) / 1000);
        throw new Error(
          `[circuit-breaker] "${this.opts.name}" is OPEN — retry in ${waitSec}s`
        );
      }

      this.state = "HALF_OPEN";
      this.successes = 0;
      console.log(`[circuit-breaker] "${this.opts.name}" → HALF_OPEN (probing…)`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = "CLOSED";
        console.log(`[circuit-breaker] "${this.opts.name}" → CLOSED (service recovered)`);
      }
    }
  }

  private onFailure(err: unknown): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.warn(
        `[circuit-breaker] "${this.opts.name}" → OPEN after ${this.failures} failure(s) — ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  getState(): CBState { return this.state; }
  getFailures(): number { return this.failures; }

toJSON() {
    return {
      name:        this.opts.name,
      state:       this.state,
      failures:    this.failures,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }
}

const registry = new Map<string, CircuitBreaker>();

export function createBreaker(opts: CircuitBreakerOptions): CircuitBreaker {
  const cb = new CircuitBreaker(opts);
  registry.set(opts.name, cb);
  return cb;
}

export function getAllBreakerStates() {
  return Array.from(registry.values()).map((cb) => cb.toJSON());
}
