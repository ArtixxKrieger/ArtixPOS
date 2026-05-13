import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../server/crypto";

// ── hashPassword ───────────────────────────────────────────────────────────────

describe("hashPassword", () => {
  it("returns a string in canonical format (hash.salt)", async () => {
    const hash = await hashPassword("password123");
    expect(hash).toMatch(/^[a-f0-9]{128}\.[a-f0-9]{32}$/);
  });

  it("produces a different hash each call (salt is random)", async () => {
    const h1 = await hashPassword("password123");
    const h2 = await hashPassword("password123");
    expect(h1).not.toBe(h2);
  });

  it("contains exactly one dot separator", async () => {
    const hash = await hashPassword("mypassword");
    const dots = (hash.match(/\./g) ?? []).length;
    expect(dots).toBe(1);
  });

  it("works with an empty string password", async () => {
    const hash = await hashPassword("");
    expect(hash).toContain(".");
  });

  it("works with unicode and special characters", async () => {
    const hash = await hashPassword("p@$$w0rd!™£€");
    expect(hash).toContain(".");
  });

  it("works with a very long password", async () => {
    const hash = await hashPassword("a".repeat(1000));
    expect(hash).toContain(".");
  });
});

// ── verifyPassword — canonical format ─────────────────────────────────────────

describe("verifyPassword (canonical format: hash.salt)", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassword("Password");
    expect(await verifyPassword("password", hash)).toBe(false);
    expect(await verifyPassword("PASSWORD", hash)).toBe(false);
    expect(await verifyPassword("Password", hash)).toBe(true);
  });

  it("returns false for empty password against non-empty hash", async () => {
    const hash = await hashPassword("secret");
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("verifies correct empty-string password against its own hash", async () => {
    const hash = await hashPassword("");
    expect(await verifyPassword("", hash)).toBe(true);
  });

  it("returns false for a tampered hash", async () => {
    const hash = await hashPassword("secret");
    const [, salt] = hash.split(".");
    const tampered = `${"0".repeat(128)}.${salt}`;
    expect(await verifyPassword("secret", tampered)).toBe(false);
  });

  it("returns false for a completely invalid stored string", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });

  it("returns false when stored string has empty hash part", async () => {
    expect(await verifyPassword("pass", ".abcdef1234567890abcdef1234567890")).toBe(false);
  });

  it("returns false when stored string has empty salt part", async () => {
    expect(await verifyPassword("pass", `${"a".repeat(128)}.`)).toBe(false);
  });
});

// ── verifyPassword — legacy format ────────────────────────────────────────────

describe("verifyPassword (legacy format: salt:hash)", () => {
  function buildLegacyHash(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const crypto = require("crypto");
      const salt = crypto.randomBytes(16).toString("hex");
      crypto.scrypt(password, salt, 64, (err: Error | null, buf: Buffer) => {
        if (err) return reject(err);
        resolve(`${salt}:${buf.toString("hex")}`);
      });
    });
  }

  it("returns true for correct password in legacy format", async () => {
    const stored = await buildLegacyHash("legacy-password");
    expect(await verifyPassword("legacy-password", stored)).toBe(true);
  });

  it("returns false for wrong password in legacy format", async () => {
    const stored = await buildLegacyHash("legacy-password");
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("returns false when legacy string has no colon", async () => {
    expect(await verifyPassword("pass", "nocolonhere")).toBe(false);
  });

  it("returns false when legacy hash has wrong length", async () => {
    expect(await verifyPassword("pass", "salt:tooshort")).toBe(false);
  });
});
