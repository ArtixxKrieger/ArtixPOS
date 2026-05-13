import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker, createBreaker, getAllBreakerStates } from "../server/circuit-breaker";

const fail = () => Promise.reject(new Error("service unavailable"));
const succeed = () => Promise.resolve("ok");

// ── Initial state ──────────────────────────────────────────────────────────────

describe("CircuitBreaker initial state", () => {
  it("starts in CLOSED state", () => {
    const cb = new CircuitBreaker({ name: "test-init" });
    expect(cb.getState()).toBe("CLOSED");
  });

  it("starts with 0 failures", () => {
    const cb = new CircuitBreaker({ name: "test-failures" });
    expect(cb.getFailures()).toBe(0);
  });

  it("allows calls through when CLOSED", async () => {
    const cb = new CircuitBreaker({ name: "test-closed" });
    const result = await cb.execute(succeed);
    expect(result).toBe("ok");
  });
});

// ── CLOSED → OPEN transition ───────────────────────────────────────────────────

describe("CLOSED → OPEN transition", () => {
  it("opens after reaching failureThreshold (default 5)", async () => {
    const cb = new CircuitBreaker({ name: "test-open" });
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.getState()).toBe("OPEN");
  });

  it("does not open before reaching failureThreshold", async () => {
    const cb = new CircuitBreaker({ name: "test-not-open" });
    for (let i = 0; i < 4; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.getState()).toBe("CLOSED");
  });

  it("respects a custom failureThreshold", async () => {
    const cb = new CircuitBreaker({ name: "test-custom-thresh", failureThreshold: 2 });
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe("CLOSED");
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");
  });

  it("tracks failure count correctly", async () => {
    const cb = new CircuitBreaker({ name: "test-count", failureThreshold: 10 });
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.getFailures()).toBe(3);
  });

  it("resets failure count after a success", async () => {
    const cb = new CircuitBreaker({ name: "test-reset", failureThreshold: 10 });
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    await cb.execute(succeed);
    expect(cb.getFailures()).toBe(0);
  });
});

// ── OPEN state — fast-fail ────────────────────────────────────────────────────

describe("OPEN state fast-fail", () => {
  async function openBreaker(name: string, threshold = 3) {
    const cb = new CircuitBreaker({ name, failureThreshold: threshold, resetTimeoutMs: 30_000 });
    for (let i = 0; i < threshold; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.getState()).toBe("OPEN");
    return cb;
  }

  it("rejects immediately without calling fn when OPEN", async () => {
    const cb = await openBreaker("test-fast-fail");
    const spy = vi.fn(succeed);
    await expect(cb.execute(spy)).rejects.toThrow(/OPEN/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("error message includes the breaker name", async () => {
    const cb = await openBreaker("my-ai-service");
    await expect(cb.execute(fail)).rejects.toThrow("my-ai-service");
  });

  it("error message includes retry hint", async () => {
    const cb = await openBreaker("test-retry-msg");
    await expect(cb.execute(fail)).rejects.toThrow(/retry in/i);
  });
});

// ── OPEN → HALF_OPEN transition ───────────────────────────────────────────────

describe("OPEN → HALF_OPEN transition", () => {
  it("transitions to HALF_OPEN after resetTimeout has elapsed", async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ name: "test-half-open", failureThreshold: 2, resetTimeoutMs: 100 });
    for (let i = 0; i < 2; i++) await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(101);
    await cb.execute(succeed).catch(() => {});
    expect(cb.getState()).not.toBe("OPEN");
    vi.useRealTimers();
  });
});

// ── HALF_OPEN → CLOSED (recovery) ─────────────────────────────────────────────

describe("HALF_OPEN → CLOSED recovery", () => {
  async function halfOpenBreaker(name: string) {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ name, failureThreshold: 1, resetTimeoutMs: 100, successThreshold: 2 });
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");
    vi.advanceTimersByTime(101);
    return cb;
  }

  it("closes after successThreshold consecutive successes in HALF_OPEN", async () => {
    const cb = await halfOpenBreaker("test-recovery");
    await cb.execute(succeed);
    expect(cb.getState()).toBe("HALF_OPEN");
    await cb.execute(succeed);
    expect(cb.getState()).toBe("CLOSED");
    vi.useRealTimers();
  });

  it("re-opens immediately on failure in HALF_OPEN", async () => {
    const cb = await halfOpenBreaker("test-reopen");
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");
    vi.useRealTimers();
  });
});

// ── toJSON snapshot ───────────────────────────────────────────────────────────

describe("toJSON snapshot", () => {
  it("includes name, state, failures, and lastFailure", async () => {
    const cb = new CircuitBreaker({ name: "test-json" });
    const snap = cb.toJSON();
    expect(snap).toHaveProperty("name", "test-json");
    expect(snap).toHaveProperty("state", "CLOSED");
    expect(snap).toHaveProperty("failures", 0);
    expect(snap).toHaveProperty("lastFailure", null);
  });

  it("lastFailure is an ISO string after a failure", async () => {
    const cb = new CircuitBreaker({ name: "test-json-fail", failureThreshold: 10 });
    await expect(cb.execute(fail)).rejects.toThrow();
    const snap = cb.toJSON();
    expect(snap.lastFailure).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── Global registry ───────────────────────────────────────────────────────────

describe("Global registry via createBreaker / getAllBreakerStates", () => {
  it("createBreaker registers the breaker in the global registry", () => {
    const uniqueName = `registry-test-${Date.now()}`;
    createBreaker({ name: uniqueName });
    const states = getAllBreakerStates();
    expect(states.some(s => s.name === uniqueName)).toBe(true);
  });

  it("getAllBreakerStates returns an array", () => {
    expect(Array.isArray(getAllBreakerStates())).toBe(true);
  });
});
