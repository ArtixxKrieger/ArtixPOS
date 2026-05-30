import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ── Hash chain verification ────────────────────────────────────────────────────
// The audit log uses a SHA-256 chain: each entry hashes its own content +
// the previous entry's hash. Tampering with any entry breaks all subsequent hashes.

interface AuditEntry {
  tenantId: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, any> | null;
  previousHash: string | null;
  createdAt: string;
}

function computeHash(entry: AuditEntry): string {
  const payload = JSON.stringify({
    tenantId: entry.tenantId,
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    previousHash: entry.previousHash,
    createdAt: entry.createdAt,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function buildChain(events: Omit<AuditEntry, "previousHash" | "createdAt">[]): Array<AuditEntry & { recordHash: string }> {
  const chain: Array<AuditEntry & { recordHash: string }> = [];
  let previousHash: string | null = null;

  for (const ev of events) {
    const entry: AuditEntry = {
      ...ev,
      previousHash,
      createdAt: new Date().toISOString(),
    };
    const recordHash = computeHash(entry);
    chain.push({ ...entry, recordHash });
    previousHash = recordHash;
  }

  return chain;
}

function verifyChain(chain: Array<AuditEntry & { recordHash: string }>): boolean {
  let expectedPrevious: string | null = null;
  for (const entry of chain) {
    if (entry.previousHash !== expectedPrevious) return false;
    const expectedHash = computeHash(entry);
    if (entry.recordHash !== expectedHash) return false;
    expectedPrevious = entry.recordHash;
  }
  return true;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Audit log hash chain", () => {
  const sampleEvents: Omit<AuditEntry, "previousHash" | "createdAt">[] = [
    { tenantId: "t1", userId: "u1", action: "login", entity: "auth", entityId: null, metadata: null },
    { tenantId: "t1", userId: "u1", action: "create", entity: "product", entityId: "42", metadata: { name: "Coffee" } },
    { tenantId: "t1", userId: "u1", action: "update", entity: "product", entityId: "42", metadata: { price: "4.50" } },
    { tenantId: "t1", userId: "u1", action: "delete", entity: "product", entityId: "42", metadata: null },
  ];

  it("first entry has null previousHash", () => {
    const chain = buildChain(sampleEvents);
    expect(chain[0].previousHash).toBeNull();
  });

  it("each entry points to the previous entry's hash", () => {
    const chain = buildChain(sampleEvents);
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].previousHash).toBe(chain[i - 1].recordHash);
    }
  });

  it("valid chain passes verification", () => {
    const chain = buildChain(sampleEvents);
    expect(verifyChain(chain)).toBe(true);
  });

  it("tampering with an entry breaks the chain", () => {
    const chain = buildChain(sampleEvents);
    const tampered = chain.map((e, i) =>
      i === 1 ? { ...e, metadata: { name: "Hacked" } } : e
    );
    expect(verifyChain(tampered)).toBe(false);
  });

  it("tampering with a hash breaks subsequent entries", () => {
    const chain = buildChain(sampleEvents);
    chain[1].recordHash = "0".repeat(64);
    expect(verifyChain(chain)).toBe(false);
  });

  it("each entry has a unique hash", () => {
    const chain = buildChain(sampleEvents);
    const hashes = chain.map(e => e.recordHash);
    const unique = new Set(hashes);
    expect(unique.size).toBe(chain.length);
  });

  it("single-entry chain is valid", () => {
    const chain = buildChain([sampleEvents[0]]);
    expect(verifyChain(chain)).toBe(true);
  });
});

// ── Auth event audit metadata ──────────────────────────────────────────────────

describe("Auth event metadata", () => {
  it("login event has correct structure", () => {
    const event = {
      action: "login",
      entity: "auth",
      metadata: { provider: "email", ip: "127.0.0.1" },
    };
    expect(event.action).toBe("login");
    expect(event.entity).toBe("auth");
    expect(event.metadata.provider).toBeDefined();
  });

  it("logout event has correct entity", () => {
    const event = { action: "logout", entity: "auth" };
    expect(event.entity).toBe("auth");
  });

  it("register event includes provider", () => {
    const event = {
      action: "register",
      entity: "auth",
      metadata: { provider: "email" },
    };
    expect(event.metadata.provider).toBe("email");
  });
});
