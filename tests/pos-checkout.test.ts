import { describe, it, expect, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET!;

function makeToken(payload: object) {
  return jwt.sign({ jti: "test-jti", ...payload }, SECRET, { expiresIn: "7d" });
}

// ── Minimal POS app — mirrors real sale route logic without DB side effects ───

function buildPosApp() {
  const app = express();
  app.use(express.json());

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token =
      req.cookies?.auth_token ??
      req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return void res.status(401).json({ message: "Unauthorized" });
    try {
      (req as any).user = jwt.verify(token, SECRET);
      next();
    } catch {
      return void res.status(401).json({ message: "Unauthorized" });
    }
  }

  // Simulate sale creation with the same validation logic as the real route
  app.post("/api/sales", requireAuth, (req, res) => {
    const { items, subtotal, total, paymentMethod, discount } = req.body ?? {};

    if (!items) return void res.status(400).json({ message: "items is required" });
    if (!subtotal && subtotal !== 0) return void res.status(400).json({ message: "subtotal is required" });
    if (!total && total !== 0) return void res.status(400).json({ message: "total is required" });

    const sub = parseFloat(subtotal);
    const tot = parseFloat(total);
    const disc = parseFloat(discount ?? "0");

    if (isNaN(sub) || sub < 0) return void res.status(400).json({ message: "subtotal must be a non-negative number" });
    if (isNaN(tot) || tot < 0) return void res.status(400).json({ message: "total must be a non-negative number" });
    if (tot > sub + 0.01) return void res.status(400).json({ message: "total cannot exceed subtotal before discounts" });

    // Cashier role enforces max discount of 20%
    const user = (req as any).user;
    if (user?.role === "cashier" && sub > 0) {
      const discountPct = (disc / sub) * 100;
      if (discountPct > 20) {
        return void res.status(403).json({ message: "Discount exceeds your allowed maximum of 20%" });
      }
    }

    const validPaymentMethods = ["cash", "card", "gcash", "maya", "bank_transfer", "other"];
    if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
      return void res.status(400).json({ message: "Invalid payment method" });
    }

    const sale = {
      id: 1,
      items,
      subtotal: String(sub),
      total: String(tot),
      discount: String(disc),
      paymentMethod: paymentMethod ?? "cash",
      cashierId: user?.id ?? "unknown",
      status: "active",
      createdAt: new Date().toISOString(),
    };

    res.status(201).json(sale);
  });

  // List sales — returns paginated empty list in stub
  app.get("/api/sales", requireAuth, (req, res) => {
    const { startDate, endDate } = req.query as Record<string, string>;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !dateRe.test(startDate)) {
      return void res.status(400).json({ message: "Invalid startDate format" });
    }
    if (endDate && !dateRe.test(endDate)) {
      return void res.status(400).json({ message: "Invalid endDate format" });
    }
    res.json([]);
  });

  // Void sale — manager or above
  app.delete("/api/sales/:id", requireAuth, (req, res) => {
    const user = (req as any).user;
    if (!["owner", "manager"].includes(user?.role)) {
      return void res.status(403).json({ message: "Forbidden: manager access required" });
    }
    const { voidReason } = req.body ?? {};
    if (!voidReason) return void res.status(400).json({ message: "voidReason is required" });
    res.json({ success: true, voidedAt: new Date().toISOString() });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ message: err.message });
  });

  return app;
}

const app = buildPosApp();
const ownerToken  = makeToken({ id: "owner_1",   role: "owner",   tenantId: "t1" });
const cashierToken = makeToken({ id: "cashier_1", role: "cashier", tenantId: "t1" });
const managerToken = makeToken({ id: "manager_1", role: "manager", tenantId: "t1" });

// ── Authentication guard ───────────────────────────────────────────────────────

describe("POST /api/sales — authentication", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = await request(app).post("/api/sales").send({});
    expect(res.status).toBe(401);
  });

  it("allows authenticated owner to reach validation", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Input validation ───────────────────────────────────────────────────────────

describe("POST /api/sales — input validation", () => {
  it("returns 400 when items is missing", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ subtotal: "10.00", total: "10.00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/items/i);
  });

  it("returns 400 when subtotal is missing", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], total: "10.00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/subtotal/i);
  });

  it("returns 400 when total is missing", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "10.00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/total/i);
  });

  it("returns 400 when total exceeds subtotal", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "5.00", total: "10.00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/total cannot exceed/i);
  });

  it("returns 400 for negative subtotal", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "-1.00", total: "-1.00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/non-negative/i);
  });

  it("returns 400 for invalid payment method", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "10.00", total: "10.00", paymentMethod: "bitcoin" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/payment method/i);
  });
});

// ── Successful sale creation ───────────────────────────────────────────────────

describe("POST /api/sales — successful creation", () => {
  const validSale = {
    items: [{ productId: 1, quantity: 2, price: "5.00" }],
    subtotal: "10.00",
    total: "10.00",
    paymentMethod: "cash",
  };

  it("returns 201 on success", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(validSale);
    expect(res.status).toBe(201);
  });

  it("returns the created sale object", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(validSale);
    expect(res.body.id).toBeDefined();
    expect(res.body.items).toBeDefined();
    expect(res.body.total).toBe("10");
  });

  it("assigns cashierId from the authenticated user", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send(validSale);
    expect(res.body.cashierId).toBe("cashier_1");
  });

  it("accepts all valid payment methods", async () => {
    const methods = ["cash", "card", "gcash", "maya", "bank_transfer", "other"];
    for (const paymentMethod of methods) {
      const res = await request(app)
        .post("/api/sales")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ ...validSale, paymentMethod });
      expect(res.status).toBe(201);
    }
  });

  it("defaults to cash when paymentMethod is omitted", async () => {
    const { paymentMethod: _, ...saleWithoutMethod } = validSale;
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(saleWithoutMethod);
    expect(res.body.paymentMethod).toBe("cash");
  });

  it("includes a createdAt timestamp", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(validSale);
    expect(res.body.createdAt).toBeDefined();
    expect(new Date(res.body.createdAt).getTime()).not.toBeNaN();
  });
});

// ── Discount enforcement per role ─────────────────────────────────────────────

describe("POST /api/sales — discount enforcement", () => {
  it("allows owner to apply >20% discount", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "100.00", total: "50.00", discount: "50.00" });
    expect(res.status).toBe(201);
  });

  it("blocks cashier from exceeding 20% discount", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ items: [], subtotal: "100.00", total: "70.00", discount: "30.00" });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/discount/i);
  });

  it("allows cashier to apply exactly 20% discount", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ items: [], subtotal: "100.00", total: "80.00", discount: "20.00" });
    expect(res.status).toBe(201);
  });

  it("allows cashier with 0% discount", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ items: [], subtotal: "50.00", total: "50.00", discount: "0.00" });
    expect(res.status).toBe(201);
  });
});

// ── Sales listing ─────────────────────────────────────────────────────────────

describe("GET /api/sales", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/sales");
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid auth", async () => {
    const res = await request(app)
      .get("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  it("returns an array", async () => {
    const res = await request(app)
      .get("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 400 for invalid startDate format", async () => {
    const res = await request(app)
      .get("/api/sales?startDate=not-a-date")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/startDate/i);
  });

  it("returns 400 for invalid endDate format", async () => {
    const res = await request(app)
      .get("/api/sales?endDate=13/40/2025")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/endDate/i);
  });

  it("accepts valid ISO date filter", async () => {
    const res = await request(app)
      .get("/api/sales?startDate=2025-01-01&endDate=2025-12-31")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });
});

// ── Void sale ─────────────────────────────────────────────────────────────────

describe("DELETE /api/sales/:id — void sale", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/sales/1");
    expect(res.status).toBe(401);
  });

  it("returns 403 when cashier tries to void", async () => {
    const res = await request(app)
      .delete("/api/sales/1")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ voidReason: "Customer changed mind" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when voidReason is missing", async () => {
    const res = await request(app)
      .delete("/api/sales/1")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/voidReason/i);
  });

  it("allows manager to void a sale", async () => {
    const res = await request(app)
      .delete("/api/sales/1")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ voidReason: "Customer returned item" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.voidedAt).toBeDefined();
  });

  it("allows owner to void a sale", async () => {
    const res = await request(app)
      .delete("/api/sales/1")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ voidReason: "Entered wrong items" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Sale total math ────────────────────────────────────────────────────────────

describe("Sale total math validation", () => {
  it("subtotal and total can be equal (no discount, no tax)", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "25.00", total: "25.00" });
    expect(res.status).toBe(201);
  });

  it("total can be less than subtotal (discount applied)", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "100.00", total: "90.00", discount: "10.00" });
    expect(res.status).toBe(201);
  });

  it("zero-value sale is allowed", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "0", total: "0" });
    expect(res.status).toBe(201);
  });

  it("floating point totals are handled correctly", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ items: [], subtotal: "33.33", total: "33.33" });
    expect(res.status).toBe(201);
  });
});
