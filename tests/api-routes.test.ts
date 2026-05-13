import { describe, it, expect } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET!;

// ── Minimal test app — mirrors real server middleware without side effects ──────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token =
      req.cookies?.auth_token ??
      req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return void res.status(401).json({ user: null });
    try {
      (req as any).user = jwt.verify(token, SECRET);
      next();
    } catch {
      return void res.status(401).json({ user: null });
    }
  }

  // Health (no auth)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: Math.floor(process.uptime()), ts: new Date().toISOString() });
  });

  // Auth/me
  app.get("/api/auth/me", requireAuth, (req: Request, res) => {
    res.json({ user: (req as any).user });
  });

  // Login validation
  app.post("/api/auth/local-login", (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return void res.status(400).json({ message: "Email and password are required." });
    }
    return void res.status(401).json({ message: "Invalid credentials." });
  });

  // Generic protected stub
  app.get("/api/products", requireAuth, (_req, res) => res.json([]));
  app.get("/api/customers", requireAuth, (_req, res) => res.json([]));
  app.get("/api/sales", requireAuth, (_req, res) => res.json([]));

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ message: err.message });
  });

  return app;
}

const app = buildApp();

// ── Health check ───────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("returns status: ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.status).toBe("ok");
  });

  it("includes numeric uptime", async () => {
    const res = await request(app).get("/api/health");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("includes ISO timestamp", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("is accessible without authentication", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).not.toBe(401);
  });

  it("returns JSON content-type", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

// ── JWT auth middleware ────────────────────────────────────────────────────────

describe("JWT authentication middleware", () => {
  it("rejects missing token with 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects garbage token with 401", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("rejects token signed with wrong secret", async () => {
    const token = jwt.sign({ id: "u1", jti: "j1" }, "wrong-secret", { expiresIn: "7d" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects expired token", async () => {
    const token = jwt.sign({ id: "u1", jti: "j1" }, SECRET, { expiresIn: "-1s" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("accepts valid Bearer token", async () => {
    const token = jwt.sign({ id: "u1", role: "owner", jti: "j2" }, SECRET, { expiresIn: "7d" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("u1");
  });

  it("accepts valid cookie token", async () => {
    const token = jwt.sign({ id: "u2", role: "cashier", jti: "j3" }, SECRET, { expiresIn: "7d" });
    const res = await request(app).get("/api/auth/me").set("Cookie", `auth_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("u2");
  });

  it("cookie takes precedence over missing header", async () => {
    const token = jwt.sign({ id: "u3", role: "manager", jti: "j4" }, SECRET, { expiresIn: "7d" });
    const res = await request(app).get("/api/auth/me").set("Cookie", `auth_token=${token}`);
    expect(res.body.user.role).toBe("manager");
  });

  it("returns the user payload from the token", async () => {
    const payload = { id: "u4", role: "owner", tenantId: "t1", jti: "j5" };
    const token = jwt.sign(payload, SECRET, { expiresIn: "7d" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.body.user.tenantId).toBe("t1");
  });
});

// ── Protected routes ───────────────────────────────────────────────────────────

describe("Protected route guard", () => {
  const routes = ["/api/products", "/api/customers", "/api/sales"];

  for (const route of routes) {
    it(`GET ${route} → 401 without auth`, async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(401);
    });

    it(`GET ${route} → 200 with valid token`, async () => {
      const token = jwt.sign({ id: "u1", role: "owner", jti: `j-${route}` }, SECRET, { expiresIn: "7d" });
      const res = await request(app).get(route).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  }
});

// ── Login input validation ─────────────────────────────────────────────────────

describe("POST /api/auth/local-login — input validation", () => {
  it("returns 400 when both fields are missing", async () => {
    const res = await request(app).post("/api/auth/local-login").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app).post("/api/auth/local-login").send({ password: "secret123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app).post("/api/auth/local-login").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  it("returns JSON content-type on error", async () => {
    const res = await request(app).post("/api/auth/local-login").send({});
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("returns 400 when sent as query params instead of body", async () => {
    const res = await request(app).post("/api/auth/local-login?email=a@b.com&password=x");
    expect(res.status).toBe(400);
  });

  it("returns 401 when credentials are provided (wrong creds)", async () => {
    const res = await request(app)
      .post("/api/auth/local-login")
      .send({ email: "a@b.com", password: "wrongpass" });
    expect(res.status).toBe(401);
  });
});

// ── 404 on unknown routes ──────────────────────────────────────────────────────

describe("Unknown routes", () => {
  it("returns 404 for an unknown API path", async () => {
    const res = await request(app).get("/api/nonexistent-endpoint-xyz");
    expect(res.status).toBe(404);
  });
});
