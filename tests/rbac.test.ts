import { describe, it, expect } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET!;

function makeToken(role: string, extra: object = {}) {
  return jwt.sign(
    { jti: `rbac-jti-${role}`, id: `${role}_1`, role, tenantId: "tenant_1", ...extra },
    SECRET,
    { expiresIn: "7d" }
  );
}

// ── Minimal RBAC test app — mirrors real middleware logic exactly ──────────────

function buildRbacApp() {
  const app = express();
  app.use(express.json());

  // Replicate jwtAuthMiddleware behaviour
  function jwtAuth(req: Request, _res: Response, next: NextFunction) {
    const token =
      req.cookies?.auth_token ??
      req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return next();
    try {
      (req as any).user = jwt.verify(token, SECRET);
    } catch { /* invalid token — req.user stays undefined */ }
    next();
  }

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return void res.status(401).json({ message: "Unauthorized" });
    next();
  }

  function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) return void res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      if (!roles.includes(user.role)) return void res.status(403).json({ message: "Forbidden: insufficient role" });
      next();
    };
  }

  function requireManagerOrAbove(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return void res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    if (!["owner", "manager"].includes(user.role)) {
      return void res.status(403).json({ message: "Forbidden: manager access required" });
    }
    next();
  }

  function requireOwner(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return void res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    if (user.role !== "owner") return void res.status(403).json({ message: "Forbidden: owner access required" });
    next();
  }

  function requireTenant(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return void res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    if (!user.tenantId) return void res.status(403).json({ message: "No tenant associated with this account" });
    next();
  }

  app.use(jwtAuth);

  // Public
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // Requires login only
  app.get("/api/products",   requireAuth, (_req, res) => res.json({ endpoint: "products" }));
  app.get("/api/sales",      requireAuth, (_req, res) => res.json({ endpoint: "sales" }));
  app.get("/api/customers",  requireAuth, (_req, res) => res.json({ endpoint: "customers" }));

  // Requires manager or owner
  app.delete("/api/sales/:id",           requireAuth, requireManagerOrAbove, (_req, res) => res.json({ ok: true }));
  app.get("/api/sales/export",           requireAuth, requireManagerOrAbove, (_req, res) => res.json({ ok: true }));
  app.post("/api/expenses",              requireAuth, requireManagerOrAbove, (_req, res) => res.json({ ok: true }));
  app.get("/api/reports/daily-summary",  requireAuth, requireManagerOrAbove, (_req, res) => res.json({ ok: true }));

  // Requires owner only
  app.get("/api/admin/users",      requireAuth, requireOwner, (_req, res) => res.json({ ok: true }));
  app.delete("/api/admin/users/:id", requireAuth, requireOwner, (_req, res) => res.json({ ok: true }));
  app.post("/api/branches",        requireAuth, requireOwner, (_req, res) => res.json({ ok: true }));
  app.get("/api/payroll",          requireAuth, requireOwner, (_req, res) => res.json({ ok: true }));

  // Requires specific role
  app.get("/api/kitchen", requireAuth, requireRole("owner", "manager", "kitchen"), (_req, res) => res.json({ ok: true }));

  // Requires tenant
  app.get("/api/tenant-data", requireAuth, requireTenant, (_req, res) => res.json({ ok: true }));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ message: err.message });
  });

  return app;
}

const app = buildRbacApp();

const tokens = {
  owner:   makeToken("owner"),
  manager: makeToken("manager"),
  cashier: makeToken("cashier"),
  kitchen: makeToken("kitchen"),
  staff:   makeToken("staff"),
  noTenant: makeToken("owner", { tenantId: null }),
};

function bearer(role: keyof typeof tokens) {
  return { Authorization: `Bearer ${tokens[role]}` };
}

// ── Public endpoints ───────────────────────────────────────────────────────────

describe("Public endpoints", () => {
  it("GET /api/health is accessible without auth", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });
});

// ── requireAuth — all authenticated roles pass ────────────────────────────────

describe("requireAuth — routes accessible by any authenticated role", () => {
  const routes = ["/api/products", "/api/sales", "/api/customers"];

  for (const route of routes) {
    it(`${route} returns 401 with no token`, async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(401);
    });

    for (const role of ["owner", "manager", "cashier", "staff"] as const) {
      it(`${route} returns 200 for role=${role}`, async () => {
        const res = await request(app).get(route).set(bearer(role));
        expect(res.status).toBe(200);
      });
    }
  }
});

// ── requireManagerOrAbove ─────────────────────────────────────────────────────

describe("requireManagerOrAbove — manager-gated endpoints", () => {
  const managerRoutes = [
    { method: "delete", path: "/api/sales/1" },
    { method: "get",    path: "/api/sales/export" },
    { method: "post",   path: "/api/expenses" },
    { method: "get",    path: "/api/reports/daily-summary" },
  ] as const;

  for (const { method, path } of managerRoutes) {
    it(`${method.toUpperCase()} ${path} → 401 without auth`, async () => {
      const res = await (request(app) as any)[method](path);
      expect(res.status).toBe(401);
    });

    it(`${method.toUpperCase()} ${path} → 403 for cashier`, async () => {
      const res = await (request(app) as any)[method](path).set(bearer("cashier"));
      expect(res.status).toBe(403);
    });

    it(`${method.toUpperCase()} ${path} → 403 for staff`, async () => {
      const res = await (request(app) as any)[method](path).set(bearer("staff"));
      expect(res.status).toBe(403);
    });

    it(`${method.toUpperCase()} ${path} → 200 for manager`, async () => {
      const res = await (request(app) as any)[method](path).set(bearer("manager"));
      expect(res.status).toBe(200);
    });

    it(`${method.toUpperCase()} ${path} → 200 for owner`, async () => {
      const res = await (request(app) as any)[method](path).set(bearer("owner"));
      expect(res.status).toBe(200);
    });
  }
});

// ── requireOwner — owner-only endpoints ───────────────────────────────────────

describe("requireOwner — owner-only endpoints", () => {
  const ownerRoutes = [
    { method: "get",    path: "/api/admin/users" },
    { method: "delete", path: "/api/admin/users/1" },
    { method: "post",   path: "/api/branches" },
    { method: "get",    path: "/api/payroll" },
  ] as const;

  for (const { method, path } of ownerRoutes) {
    it(`${method.toUpperCase()} ${path} → 401 without auth`, async () => {
      const res = await (request(app) as any)[method](path);
      expect(res.status).toBe(401);
    });

    it(`${method.toUpperCase()} ${path} → 403 for cashier`, async () => {
      const res = await (request(app) as any)[method](path).set(bearer("cashier"));
      expect(res.status).toBe(403);
    });

    it(`${method.toUpperCase()} ${path} → 403 for manager`, async () => {
      const res = await (request(app) as any)[method](path).set(bearer("manager"));
      expect(res.status).toBe(403);
    });

    it(`${method.toUpperCase()} ${path} → 200 for owner`, async () => {
      const res = await (request(app) as any)[method](path).set(bearer("owner"));
      expect(res.status).toBe(200);
    });
  }
});

// ── requireRole — specific role sets ─────────────────────────────────────────

describe("requireRole — kitchen-specific endpoint", () => {
  it("returns 403 for cashier role", async () => {
    const res = await request(app).get("/api/kitchen").set(bearer("cashier"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for staff role", async () => {
    const res = await request(app).get("/api/kitchen").set(bearer("staff"));
    expect(res.status).toBe(403);
  });

  it("returns 200 for kitchen role", async () => {
    const res = await request(app).get("/api/kitchen").set(bearer("kitchen"));
    expect(res.status).toBe(200);
  });

  it("returns 200 for manager role", async () => {
    const res = await request(app).get("/api/kitchen").set(bearer("manager"));
    expect(res.status).toBe(200);
  });

  it("returns 200 for owner role", async () => {
    const res = await request(app).get("/api/kitchen").set(bearer("owner"));
    expect(res.status).toBe(200);
  });
});

// ── requireTenant ─────────────────────────────────────────────────────────────

describe("requireTenant", () => {
  it("returns 403 when user has no tenantId", async () => {
    const res = await request(app).get("/api/tenant-data").set(bearer("noTenant"));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no tenant/i);
  });

  it("returns 200 when user has a tenantId", async () => {
    const res = await request(app).get("/api/tenant-data").set(bearer("owner"));
    expect(res.status).toBe(200);
  });
});

// ── Forbidden response shape ───────────────────────────────────────────────────

describe("Forbidden response shape", () => {
  it("returns JSON content-type on 403", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set(bearer("cashier"));
    expect(res.status).toBe(403);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("403 response includes a message field", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set(bearer("manager"));
    expect(res.status).toBe(403);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("401 response includes a message field", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
    expect(typeof res.body.message).toBe("string");
  });
});

// ── Role hierarchy correctness ────────────────────────────────────────────────

describe("Role hierarchy sanity checks", () => {
  it("owner can access all three permission tiers", async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).get("/api/products").set(bearer("owner")),
      request(app).get("/api/reports/daily-summary").set(bearer("owner")),
      request(app).get("/api/admin/users").set(bearer("owner")),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });

  it("manager can access auth+manager tiers but not owner tier", async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).get("/api/products").set(bearer("manager")),
      request(app).get("/api/reports/daily-summary").set(bearer("manager")),
      request(app).get("/api/admin/users").set(bearer("manager")),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(403);
  });

  it("cashier can access only auth-level routes", async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).get("/api/products").set(bearer("cashier")),
      request(app).get("/api/reports/daily-summary").set(bearer("cashier")),
      request(app).get("/api/admin/users").set(bearer("cashier")),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(403);
    expect(r3.status).toBe(403);
  });
});
