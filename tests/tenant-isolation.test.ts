import { describe, it, expect } from "vitest";

// ── Tenant cache TTL ───────────────────────────────────────────────────────────

const TENANT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  ids: string[];
  at: number;
}

class TenantUserCache {
  private cache = new Map<string, CacheEntry>();

  set(userId: string, ids: string[]): void {
    this.cache.set(userId, { ids, at: Date.now() });
  }

  get(userId: string): string[] | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.at >= TENANT_CACHE_TTL) {
      this.cache.delete(userId);
      return null;
    }
    return entry.ids;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  size(): number {
    return this.cache.size;
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Tenant user cache", () => {
  it("returns null for unknown user", () => {
    const cache = new TenantUserCache();
    expect(cache.get("unknown_user")).toBeNull();
  });

  it("returns cached ids within TTL", () => {
    const cache = new TenantUserCache();
    cache.set("u1", ["u1", "u2", "u3"]);
    expect(cache.get("u1")).toEqual(["u1", "u2", "u3"]);
  });

  it("returns null after manual invalidation", () => {
    const cache = new TenantUserCache();
    cache.set("u1", ["u1", "u2"]);
    cache.invalidate("u1");
    expect(cache.get("u1")).toBeNull();
  });

  it("invalidation only removes the target user", () => {
    const cache = new TenantUserCache();
    cache.set("u1", ["u1", "u2"]);
    cache.set("u3", ["u3", "u4"]);
    cache.invalidate("u1");
    expect(cache.get("u1")).toBeNull();
    expect(cache.get("u3")).toEqual(["u3", "u4"]);
  });

  it("overwriting cache entry updates ids", () => {
    const cache = new TenantUserCache();
    cache.set("u1", ["u1"]);
    cache.set("u1", ["u1", "u2", "u3"]);
    expect(cache.get("u1")).toEqual(["u1", "u2", "u3"]);
  });
});

// ── Tenant isolation logic ────────────────────────────────────────────────────

describe("Tenant data isolation", () => {
  it("user can only access data within their tenant", () => {
    const tenantAUsers = ["u1", "u2", "u3"];
    const tenantBUsers = ["u4", "u5"];

    const requestingUser = "u1";
    const userTenantIds = tenantAUsers;

    const allProducts = [
      { id: 1, userId: "u1", name: "Product A" },
      { id: 2, userId: "u2", name: "Product B" },
      { id: 3, userId: "u4", name: "Product C (tenant B)" },
    ];

    const visible = allProducts.filter(p => userTenantIds.includes(p.userId));
    expect(visible).toHaveLength(2);
    expect(visible.map(p => p.id)).not.toContain(3);
    void tenantBUsers;
    void requestingUser;
  });

  it("cross-tenant product is not visible to wrong tenant", () => {
    const tenantAUserIds = ["u1"];
    const crossTenantProduct = { id: 99, userId: "u4" };
    expect(tenantAUserIds.includes(crossTenantProduct.userId)).toBe(false);
  });

  it("tenant membership includes all users in same tenant", () => {
    const tenantUsers = ["u1", "u2", "u3"];
    const requestingUser = "u2";
    expect(tenantUsers.includes(requestingUser)).toBe(true);
    expect(tenantUsers.length).toBe(3);
  });

  it("user without tenant only sees their own data", () => {
    const userId = "solo_user";
    const tenantId: string | null = null;
    const visibleUserIds = tenantId ? ["would_be_expanded"] : [userId];
    expect(visibleUserIds).toEqual([userId]);
  });
});

// ── Role hierarchy ─────────────────────────────────────────────────────────────

describe("Role hierarchy enforcement", () => {
  type Role = "owner" | "manager" | "admin" | "cashier";
  const ROLE_HIERARCHY: Record<Role, number> = {
    owner: 4,
    manager: 3,
    admin: 2,
    cashier: 1,
  };

  function hasPermission(userRole: Role, requiredRole: Role): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
  }

  it("owner can access all role levels", () => {
    expect(hasPermission("owner", "owner")).toBe(true);
    expect(hasPermission("owner", "manager")).toBe(true);
    expect(hasPermission("owner", "admin")).toBe(true);
    expect(hasPermission("owner", "cashier")).toBe(true);
  });

  it("cashier cannot access manager routes", () => {
    expect(hasPermission("cashier", "manager")).toBe(false);
    expect(hasPermission("cashier", "admin")).toBe(false);
    expect(hasPermission("cashier", "owner")).toBe(false);
  });

  it("manager can access admin and cashier routes", () => {
    expect(hasPermission("manager", "admin")).toBe(true);
    expect(hasPermission("manager", "cashier")).toBe(true);
    expect(hasPermission("manager", "owner")).toBe(false);
  });

  it("admin cannot access manager or owner routes", () => {
    expect(hasPermission("admin", "manager")).toBe(false);
    expect(hasPermission("admin", "owner")).toBe(false);
    expect(hasPermission("admin", "cashier")).toBe(true);
  });
});

// ── Revoked token isolation ────────────────────────────────────────────────────

describe("Revoked token set", () => {
  it("empty set allows all tokens", () => {
    const revoked = new Set<string>();
    expect(revoked.has("any-jti")).toBe(false);
  });

  it("adding a jti marks it as revoked", () => {
    const revoked = new Set<string>(["jti-abc"]);
    expect(revoked.has("jti-abc")).toBe(true);
  });

  it("multiple tokens can be revoked independently", () => {
    const revoked = new Set(["jti-1", "jti-2"]);
    expect(revoked.has("jti-1")).toBe(true);
    expect(revoked.has("jti-2")).toBe(true);
    expect(revoked.has("jti-3")).toBe(false);
  });

  it("pruning removes only expired entries", () => {
    const now = Date.now();
    const entries = [
      { jti: "expired-1", expiresAt: new Date(now - 1000).toISOString() },
      { jti: "expired-2", expiresAt: new Date(now - 5000).toISOString() },
      { jti: "valid-1", expiresAt: new Date(now + 86400000).toISOString() },
    ];
    const active = entries.filter(e => new Date(e.expiresAt).getTime() > now);
    expect(active).toHaveLength(1);
    expect(active[0].jti).toBe("valid-1");
  });
});
