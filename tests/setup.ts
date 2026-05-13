import { vi } from "vitest";

process.env.SESSION_SECRET = "test-secret-for-vitest-that-is-at-least-64-characters-long-for-security";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost/test";

vi.mock("../server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
        limit: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
        orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    execute: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("../server/admin-storage", () => ({
  createAuditLog: vi.fn(() => Promise.resolve()),
  updateLastSeen: vi.fn(() => Promise.resolve()),
}));
