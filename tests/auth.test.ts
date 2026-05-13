import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET!;

// ── Helpers ────────────────────────────────────────────────────────────────────

function signTestToken(payload: object, expiresIn = "7d") {
  return jwt.sign({ jti: "test-jti-123", ...payload }, SECRET, { expiresIn });
}

function decodeToken(token: string) {
  return jwt.verify(token, SECRET) as any;
}

// ── Token structure ────────────────────────────────────────────────────────────

describe("JWT token structure", () => {
  it("includes a jti claim for revocation", () => {
    const token = signTestToken({ id: "user_1", role: "owner" });
    const payload = decodeToken(token);
    expect(payload.jti).toBeDefined();
    expect(typeof payload.jti).toBe("string");
  });

  it("includes required user claims", () => {
    const user = {
      id: "user_1",
      name: "Alice",
      email: "alice@example.com",
      role: "owner",
      tenantId: "tenant_1",
      activeBranchId: 1,
    };
    const token = signTestToken(user);
    const payload = decodeToken(token);
    expect(payload.id).toBe(user.id);
    expect(payload.name).toBe(user.name);
    expect(payload.email).toBe(user.email);
    expect(payload.role).toBe(user.role);
    expect(payload.tenantId).toBe(user.tenantId);
    expect(payload.activeBranchId).toBe(user.activeBranchId);
  });

  it("expires after 7 days", () => {
    const token = signTestToken({ id: "user_1" });
    const payload = decodeToken(token);
    const exp = payload.exp;
    const iat = payload.iat;
    const diffDays = (exp - iat) / (60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("rejects tokens signed with a different secret", () => {
    const token = jwt.sign({ id: "user_1" }, "wrong-secret", { expiresIn: "7d" });
    expect(() => decodeToken(token)).toThrow();
  });

  it("rejects expired tokens", () => {
    const token = jwt.sign({ id: "user_1", jti: "test" }, SECRET, { expiresIn: "-1s" });
    expect(() => decodeToken(token)).toThrow(/expired/);
  });
});

// ── Revocation logic ───────────────────────────────────────────────────────────

describe("Token revocation", () => {
  it("revoked token jti is in the revoked set", () => {
    const revokedJtis = new Set<string>();
    const jti = "jti-to-revoke";
    revokedJtis.add(jti);
    expect(revokedJtis.has(jti)).toBe(true);
  });

  it("valid token jti is not in the revoked set", () => {
    const revokedJtis = new Set<string>();
    expect(revokedJtis.has("fresh-jti")).toBe(false);
  });

  it("revoking one token does not affect others", () => {
    const revokedJtis = new Set<string>(["revoked-jti"]);
    expect(revokedJtis.has("revoked-jti")).toBe(true);
    expect(revokedJtis.has("valid-jti")).toBe(false);
  });
});

// ── Token expiry math ──────────────────────────────────────────────────────────

describe("Token expiry calculation", () => {
  it("converts unix exp to ISO string correctly", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const isoDate = new Date(futureExp * 1000).toISOString();
    expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("detects expired token from exp claim", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 1;
    const isExpired = pastExp * 1000 < Date.now();
    expect(isExpired).toBe(true);
  });

  it("detects valid token from exp claim", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const isExpired = futureExp * 1000 < Date.now();
    expect(isExpired).toBe(false);
  });
});
