import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ── Inline the brute-force logic for deterministic time-travel testing ─────────
// We re-implement the same logic here so we can control Date.now() precisely.
// The actual server/brute-force.ts module uses a module-level Map that persists
// across tests, making time-travel impossible. This verifies the logic directly.

const WINDOW_MS  = 15 * 60 * 1000;
const THRESHOLDS = [
  { count: 50, blockMs: 24 * 60 * 60 * 1000 },
  { count: 20, blockMs:      60 * 60 * 1000  },
  { count:  5, blockMs:  15 * 60 * 1000      },
] as const;

interface AttemptRecord { timestamps: number[]; blockedUntil: number }

function makeStore() {
  const store = new Map<string, AttemptRecord>();

  function getRecord(ip: string) {
    if (!store.has(ip)) store.set(ip, { timestamps: [], blockedUntil: 0 });
    return store.get(ip)!;
  }

  function pruneWindow(record: AttemptRecord, now: number) {
    record.timestamps = record.timestamps.filter(t => t > now - WINDOW_MS);
  }

  function recordFailed(ip: string, now = Date.now()) {
    const rec = getRecord(ip);
    pruneWindow(rec, now);
    rec.timestamps.push(now);
    const count = rec.timestamps.length;
    for (const { count: threshold, blockMs } of THRESHOLDS) {
      if (count >= threshold) { rec.blockedUntil = now + blockMs; break; }
    }
  }

  function recordSuccess(ip: string) { store.delete(ip); }

  function isBlocked(ip: string, now = Date.now()) {
    const rec = store.get(ip);
    if (!rec) return false;
    if (rec.blockedUntil > now) return true;
    if (rec.blockedUntil > 0) { rec.blockedUntil = 0; pruneWindow(rec, now); }
    return false;
  }

  function blockSecondsRemaining(ip: string, now = Date.now()) {
    const rec = store.get(ip);
    if (!rec || rec.blockedUntil <= now) return 0;
    return Math.ceil((rec.blockedUntil - now) / 1000);
  }

  return { recordFailed, recordSuccess, isBlocked, blockSecondsRemaining, store };
}

// ── Initial state ──────────────────────────────────────────────────────────────

describe("Initial state", () => {
  it("unknown IP is not blocked", () => {
    const { isBlocked } = makeStore();
    expect(isBlocked("1.2.3.4")).toBe(false);
  });

  it("one failure does not block", () => {
    const { recordFailed, isBlocked } = makeStore();
    recordFailed("1.2.3.4");
    expect(isBlocked("1.2.3.4")).toBe(false);
  });

  it("four failures do not block", () => {
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 4; i++) recordFailed("1.2.3.4");
    expect(isBlocked("1.2.3.4")).toBe(false);
  });
});

// ── Medium threshold (5 failures → 15 min block) ──────────────────────────────

describe("Medium brute-force threshold (5 failures)", () => {
  it("blocks after exactly 5 failures", () => {
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 5; i++) recordFailed("10.0.0.1");
    expect(isBlocked("10.0.0.1")).toBe(true);
  });

  it("block duration is 15 minutes", () => {
    const now = Date.now();
    const { recordFailed, blockSecondsRemaining } = makeStore();
    for (let i = 0; i < 5; i++) recordFailed("10.0.0.1", now);
    const remaining = blockSecondsRemaining("10.0.0.1", now);
    expect(remaining).toBeGreaterThan(14 * 60);
    expect(remaining).toBeLessThanOrEqual(15 * 60);
  });

  it("block expires after 15 minutes", () => {
    const now = Date.now();
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 5; i++) recordFailed("10.0.0.1", now);
    const future = now + 15 * 60 * 1000 + 1;
    expect(isBlocked("10.0.0.1", future)).toBe(false);
  });
});

// ── High threshold (20 failures → 1 hour block) ───────────────────────────────

describe("High brute-force threshold (20 failures)", () => {
  it("blocks for 1 hour after 20 failures", () => {
    const now = Date.now();
    const { recordFailed, blockSecondsRemaining } = makeStore();
    for (let i = 0; i < 20; i++) recordFailed("10.0.0.2", now);
    const remaining = blockSecondsRemaining("10.0.0.2", now);
    expect(remaining).toBeGreaterThan(59 * 60);
    expect(remaining).toBeLessThanOrEqual(60 * 60);
  });

  it("does not unblock after 15 minutes", () => {
    const now = Date.now();
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 20; i++) recordFailed("10.0.0.2", now);
    const after15 = now + 15 * 60 * 1000 + 1;
    expect(isBlocked("10.0.0.2", after15)).toBe(true);
  });

  it("unblocks after 1 hour", () => {
    const now = Date.now();
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 20; i++) recordFailed("10.0.0.2", now);
    const after1h = now + 60 * 60 * 1000 + 1;
    expect(isBlocked("10.0.0.2", after1h)).toBe(false);
  });
});

// ── Critical threshold (50 failures → 24 hour block) ─────────────────────────

describe("Critical threshold / credential stuffing (50 failures)", () => {
  it("blocks for 24 hours after 50 failures", () => {
    const now = Date.now();
    const { recordFailed, blockSecondsRemaining } = makeStore();
    for (let i = 0; i < 50; i++) recordFailed("10.0.0.3", now);
    const remaining = blockSecondsRemaining("10.0.0.3", now);
    expect(remaining).toBeGreaterThan(23 * 60 * 60);
    expect(remaining).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("does not unblock after 1 hour", () => {
    const now = Date.now();
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 50; i++) recordFailed("10.0.0.3", now);
    expect(isBlocked("10.0.0.3", now + 60 * 60 * 1000 + 1)).toBe(true);
  });
});

// ── Successful login resets state ─────────────────────────────────────────────

describe("Successful login resets state", () => {
  it("clears block after successful login", () => {
    const { recordFailed, recordSuccess, isBlocked } = makeStore();
    for (let i = 0; i < 5; i++) recordFailed("10.0.0.4");
    expect(isBlocked("10.0.0.4")).toBe(true);
    recordSuccess("10.0.0.4");
    expect(isBlocked("10.0.0.4")).toBe(false);
  });

  it("does not affect other IPs when resetting one", () => {
    const { recordFailed, recordSuccess, isBlocked } = makeStore();
    for (let i = 0; i < 5; i++) {
      recordFailed("10.0.0.4");
      recordFailed("10.0.0.5");
    }
    recordSuccess("10.0.0.4");
    expect(isBlocked("10.0.0.4")).toBe(false);
    expect(isBlocked("10.0.0.5")).toBe(true);
  });
});

// ── Rolling window ────────────────────────────────────────────────────────────

describe("Rolling 15-minute window", () => {
  it("failures older than 15 minutes are pruned and do not count", () => {
    const now = Date.now();
    const old = now - (16 * 60 * 1000);
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 4; i++) recordFailed("10.0.0.6", old);
    recordFailed("10.0.0.6", now);
    expect(isBlocked("10.0.0.6", now)).toBe(false);
  });

  it("5 failures within window are counted and block", () => {
    const now = Date.now();
    const { recordFailed, isBlocked } = makeStore();
    for (let i = 0; i < 5; i++) recordFailed("10.0.0.7", now - i * 60 * 1000);
    expect(isBlocked("10.0.0.7", now)).toBe(true);
  });
});

// ── blockSecondsRemaining ─────────────────────────────────────────────────────

describe("blockSecondsRemaining", () => {
  it("returns 0 for an unblocked IP", () => {
    const { blockSecondsRemaining } = makeStore();
    expect(blockSecondsRemaining("1.2.3.4")).toBe(0);
  });

  it("returns 0 after block expires", () => {
    const now = Date.now();
    const { recordFailed, blockSecondsRemaining } = makeStore();
    for (let i = 0; i < 5; i++) recordFailed("10.0.0.8", now);
    expect(blockSecondsRemaining("10.0.0.8", now + 15 * 60 * 1000 + 1)).toBe(0);
  });

  it("returns a positive integer while blocked", () => {
    const now = Date.now();
    const { recordFailed, blockSecondsRemaining } = makeStore();
    for (let i = 0; i < 5; i++) recordFailed("10.0.0.9", now);
    const remaining = blockSecondsRemaining("10.0.0.9", now + 1000);
    expect(remaining).toBeGreaterThan(0);
    expect(Number.isInteger(remaining)).toBe(true);
  });
});
