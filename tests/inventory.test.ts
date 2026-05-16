import { describe, it, expect } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET!;

function makeToken(payload: object) {
  return jwt.sign({ jti: "inv-jti", ...payload }, SECRET, { expiresIn: "7d" });
}

// ── In-memory product store to simulate storage layer ─────────────────────────

let productDb: Record<number, any> = {};
let nextId = 1;

function resetDb() {
  productDb = {};
  nextId = 1;
}

function buildInventoryApp() {
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

  // List products
  app.get("/api/products", requireAuth, (_req, res) => {
    res.json(Object.values(productDb));
  });

  // Get single product
  app.get("/api/products/:id", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return void res.status(400).json({ message: "Invalid product id" });
    }
    const product = productDb[id];
    if (!product) return void res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  // Create product
  app.post("/api/products", requireAuth, (req, res) => {
    const { name, price, category, sku, trackStock, stock } = req.body ?? {};

    if (!name || typeof name !== "string" || name.trim() === "") {
      return void res.status(400).json({ message: "name is required" });
    }
    if (price === undefined || price === null || price === "") {
      return void res.status(400).json({ message: "price is required" });
    }
    const parsedPrice = parseFloat(String(price));
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return void res.status(400).json({ message: "price must be a non-negative number" });
    }

    const id = nextId++;
    const product = {
      id,
      name: name.trim(),
      price: String(parsedPrice),
      category: category ?? null,
      sku: sku ?? null,
      trackStock: trackStock ?? false,
      stock: trackStock ? (stock ?? 0) : null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    productDb[id] = product;
    res.status(201).json(product);
  });

  // Update product
  app.put("/api/products/:id", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const product = productDb[id];
    if (!product) return void res.status(404).json({ message: "Product not found" });

    const { name, price } = req.body ?? {};
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      return void res.status(400).json({ message: "name cannot be empty" });
    }
    if (price !== undefined) {
      const p = parseFloat(String(price));
      if (isNaN(p) || p < 0) return void res.status(400).json({ message: "price must be a non-negative number" });
    }

    productDb[id] = { ...product, ...req.body };
    res.json(productDb[id]);
  });

  // Delete product
  app.delete("/api/products/:id", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!productDb[id]) return void res.status(404).json({ message: "Product not found" });
    delete productDb[id];
    res.status(204).end();
  });

  // Adjust stock (relative delta: +/-)
  app.post("/api/products/:id/stock", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const product = productDb[id];
    if (!product) return void res.status(404).json({ message: "Product not found" });

    const { delta } = req.body ?? {};
    if (typeof delta !== "number") {
      return void res.status(400).json({ message: "delta must be a number" });
    }

    const newStock = (product.stock ?? 0) + delta;
    productDb[id] = { ...product, stock: newStock };
    res.json(productDb[id]);
  });

  // Set stock (absolute value)
  app.patch("/api/products/:id/stock", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const product = productDb[id];
    if (!product) return void res.status(404).json({ message: "Product not found" });

    const { stock } = req.body ?? {};
    if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
      return void res.status(400).json({ message: "stock must be a non-negative integer" });
    }

    productDb[id] = { ...product, stock };
    res.json(productDb[id]);
  });

  // Barcode lookup
  app.get("/api/products/barcode/:barcode", requireAuth, (req, res) => {
    const barcode = req.params.barcode;
    const found = Object.values(productDb).find((p: any) => p.sku === barcode);
    if (!found) return void res.status(404).json({ message: "Product not found" });
    res.json(found);
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ message: err.message });
  });

  return app;
}

const app = buildInventoryApp();
const ownerToken = makeToken({ id: "owner_1", role: "owner", tenantId: "t1" });
const auth = { Authorization: `Bearer ${ownerToken}` };

// ── Authentication guard ───────────────────────────────────────────────────────

describe("Inventory — authentication", () => {
  it("rejects unauthenticated GET /api/products with 401", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated POST /api/products with 401", async () => {
    const res = await request(app).post("/api/products").send({ name: "Item", price: "1.00" });
    expect(res.status).toBe(401);
  });

  it("allows authenticated user to list products", async () => {
    const res = await request(app).get("/api/products").set(auth);
    expect(res.status).toBe(200);
  });
});

// ── Create product ─────────────────────────────────────────────────────────────

describe("POST /api/products — create product", () => {
  beforeEach(() => resetDb());

  it("returns 201 with valid name and price", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Espresso", price: "3.50" });
    expect(res.status).toBe(201);
  });

  it("returns the created product with id", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Latte", price: "4.00" });
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Latte");
    expect(res.body.price).toBe("4");
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ price: "5.00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it("returns 400 when name is empty string", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "   ", price: "5.00" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when price is missing", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Cappuccino" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/price/i);
  });

  it("returns 400 for negative price", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Item", price: "-5.00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/non-negative/i);
  });

  it("returns 400 for non-numeric price", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Item", price: "free" });
    expect(res.status).toBe(400);
  });

  it("sets trackStock=false and null stock by default", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Widget", price: "1.00" });
    expect(res.body.trackStock).toBe(false);
    expect(res.body.stock).toBeNull();
  });

  it("initialises stock to 0 when trackStock is true and stock omitted", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Tea", price: "2.00", trackStock: true });
    expect(res.body.stock).toBe(0);
  });

  it("accepts sku, category, and other optional fields", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Medicine", price: "10.00", category: "Pharmacy", sku: "MED-001" });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("Pharmacy");
    expect(res.body.sku).toBe("MED-001");
  });

  it("sets isActive to true on creation", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Item", price: "1.00" });
    expect(res.body.isActive).toBe(true);
  });
});

// ── Read product ───────────────────────────────────────────────────────────────

describe("GET /api/products — list and get", () => {
  beforeEach(() => {
    resetDb();
    productDb[1] = { id: 1, name: "Coffee", price: "3.00", sku: "COFFEE-1", stock: 50, isActive: true };
    productDb[2] = { id: 2, name: "Tea",    price: "2.00", sku: "TEA-1",    stock: 30, isActive: true };
    nextId = 3;
  });

  it("lists all products", async () => {
    const res = await request(app).get("/api/products").set(auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it("returns the correct product by id", async () => {
    const res = await request(app).get("/api/products/1").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Coffee");
  });

  it("returns 404 for non-existent product id", async () => {
    const res = await request(app).get("/api/products/999").set(auth);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid (non-numeric) product id", async () => {
    const res = await request(app).get("/api/products/abc").set(auth);
    expect(res.status).toBe(400);
  });
});

// ── Update product ─────────────────────────────────────────────────────────────

describe("PUT /api/products/:id — update", () => {
  beforeEach(() => {
    resetDb();
    productDb[1] = { id: 1, name: "Espresso", price: "3.50", stock: 20 };
    nextId = 2;
  });

  it("updates the product name", async () => {
    const res = await request(app)
      .put("/api/products/1")
      .set(auth)
      .send({ name: "Double Espresso" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Double Espresso");
  });

  it("updates the product price", async () => {
    const res = await request(app)
      .put("/api/products/1")
      .set(auth)
      .send({ price: "4.50" });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.price)).toBe(4.5);
  });

  it("returns 404 for non-existent product", async () => {
    const res = await request(app)
      .put("/api/products/999")
      .set(auth)
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when updating name to empty string", async () => {
    const res = await request(app)
      .put("/api/products/1")
      .set(auth)
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when updating price to negative", async () => {
    const res = await request(app)
      .put("/api/products/1")
      .set(auth)
      .send({ price: "-10" });
    expect(res.status).toBe(400);
  });
});

// ── Delete product ─────────────────────────────────────────────────────────────

describe("DELETE /api/products/:id — delete", () => {
  beforeEach(() => {
    resetDb();
    productDb[1] = { id: 1, name: "Chai", price: "2.50" };
    nextId = 2;
  });

  it("returns 204 on successful delete", async () => {
    const res = await request(app).delete("/api/products/1").set(auth);
    expect(res.status).toBe(204);
  });

  it("product is gone after deletion", async () => {
    await request(app).delete("/api/products/1").set(auth);
    const res = await request(app).get("/api/products/1").set(auth);
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting non-existent product", async () => {
    const res = await request(app).delete("/api/products/999").set(auth);
    expect(res.status).toBe(404);
  });
});

// ── Stock adjustments ─────────────────────────────────────────────────────────

describe("POST /api/products/:id/stock — relative delta", () => {
  beforeEach(() => {
    resetDb();
    productDb[1] = { id: 1, name: "Juice", price: "2.00", stock: 10 };
    nextId = 2;
  });

  it("increases stock by positive delta", async () => {
    const res = await request(app)
      .post("/api/products/1/stock")
      .set(auth)
      .send({ delta: 20 });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(30);
  });

  it("decreases stock by negative delta", async () => {
    const res = await request(app)
      .post("/api/products/1/stock")
      .set(auth)
      .send({ delta: -5 });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(5);
  });

  it("returns 400 when delta is missing", async () => {
    const res = await request(app)
      .post("/api/products/1/stock")
      .set(auth)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/delta/i);
  });

  it("returns 400 when delta is a string", async () => {
    const res = await request(app)
      .post("/api/products/1/stock")
      .set(auth)
      .send({ delta: "ten" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent product", async () => {
    const res = await request(app)
      .post("/api/products/999/stock")
      .set(auth)
      .send({ delta: 5 });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/products/:id/stock — absolute set", () => {
  beforeEach(() => {
    resetDb();
    productDb[1] = { id: 1, name: "Water", price: "1.00", stock: 100 };
    nextId = 2;
  });

  it("sets stock to an exact value", async () => {
    const res = await request(app)
      .patch("/api/products/1/stock")
      .set(auth)
      .send({ stock: 50 });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(50);
  });

  it("allows setting stock to 0", async () => {
    const res = await request(app)
      .patch("/api/products/1/stock")
      .set(auth)
      .send({ stock: 0 });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(0);
  });

  it("returns 400 for negative stock", async () => {
    const res = await request(app)
      .patch("/api/products/1/stock")
      .set(auth)
      .send({ stock: -1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/non-negative/i);
  });

  it("returns 400 for float stock", async () => {
    const res = await request(app)
      .patch("/api/products/1/stock")
      .set(auth)
      .send({ stock: 10.5 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent product", async () => {
    const res = await request(app)
      .patch("/api/products/999/stock")
      .set(auth)
      .send({ stock: 10 });
    expect(res.status).toBe(404);
  });
});

// ── Barcode lookup ─────────────────────────────────────────────────────────────

describe("GET /api/products/barcode/:barcode", () => {
  beforeEach(() => {
    resetDb();
    productDb[1] = { id: 1, name: "Chips", price: "1.50", sku: "CHIPS-001", stock: 40 };
    nextId = 2;
  });

  it("returns the product matching the barcode", async () => {
    const res = await request(app)
      .get("/api/products/barcode/CHIPS-001")
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Chips");
  });

  it("returns 404 for an unknown barcode", async () => {
    const res = await request(app)
      .get("/api/products/barcode/UNKNOWN-999")
      .set(auth);
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/products/barcode/CHIPS-001");
    expect(res.status).toBe(401);
  });
});
