import { describe, it, expect } from "vitest";
import {
  insertProductSchema,
  insertCustomerSchema,
  insertSaleSchema,
  insertExpenseSchema,
  insertBranchSchema,
  insertTenantSchema,
  insertUserBranchSchema,
  insertTableSchema,
} from "../shared/schema";

// ── Product schema ─────────────────────────────────────────────────────────────

describe("insertProductSchema", () => {
  const valid = { name: "Espresso", price: "3.50" };

  it("accepts a minimal valid product", () => {
    expect(insertProductSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing name", () => {
    expect(insertProductSchema.safeParse({ price: "3.50" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(insertProductSchema.safeParse({ name: "", price: "3.50" }).success).toBe(false);
  });

  it("rejects missing price", () => {
    expect(insertProductSchema.safeParse({ name: "Espresso" }).success).toBe(false);
  });

  it("rejects empty price string", () => {
    expect(insertProductSchema.safeParse({ name: "Espresso", price: "" }).success).toBe(false);
  });

  it("accepts optional fields as null", () => {
    const result = insertProductSchema.safeParse({
      ...valid, category: null, sku: null, barcode: null, taxRate: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts trackStock as boolean", () => {
    expect(insertProductSchema.safeParse({ ...valid, trackStock: true }).success).toBe(true);
  });

  it("accepts stock as a number", () => {
    expect(insertProductSchema.safeParse({ ...valid, stock: 100 }).success).toBe(true);
  });

  it("accepts sizes array with correct shape", () => {
    const result = insertProductSchema.safeParse({
      ...valid,
      hasSizes: true,
      sizes: [{ name: "Small", price: "3.00" }, { name: "Large", price: "5.00" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts modifiers array", () => {
    const result = insertProductSchema.safeParse({
      ...valid,
      hasModifiers: true,
      modifiers: [{ name: "Extra Shot", price: "0.75" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts pharmacy fields", () => {
    const result = insertProductSchema.safeParse({
      ...valid,
      genericName: "Paracetamol",
      requiresPrescription: false,
      expiryDate: "2026-12-31",
      batchNumber: "BX-001",
    });
    expect(result.success).toBe(true);
  });
});

// ── Customer schema ────────────────────────────────────────────────────────────

describe("insertCustomerSchema", () => {
  it("accepts a customer with only name", () => {
    expect(insertCustomerSchema.safeParse({ name: "Alice" }).success).toBe(true);
  });

  it("rejects missing name", () => {
    expect(insertCustomerSchema.safeParse({ phone: "555-1234" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(insertCustomerSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts all optional fields", () => {
    const result = insertCustomerSchema.safeParse({
      name: "Alice",
      phone: "+63 912 345 6789",
      email: "alice@example.com",
      notes: "VIP customer",
      birthday: "1990-05-15",
      referredBy: 42,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null optional fields", () => {
    expect(
      insertCustomerSchema.safeParse({ name: "Bob", phone: null, email: null }).success
    ).toBe(true);
  });

  it("rejects non-integer referredBy", () => {
    expect(
      insertCustomerSchema.safeParse({ name: "Carol", referredBy: 1.5 }).success
    ).toBe(false);
  });
});

// ── Sale schema ────────────────────────────────────────────────────────────────

describe("insertSaleSchema", () => {
  const validSale = {
    items: [{ productId: 1, quantity: 2, price: "3.50" }],
    subtotal: "7.00",
    total: "7.00",
  };

  it("accepts a minimal valid sale", () => {
    expect(insertSaleSchema.safeParse(validSale).success).toBe(true);
  });

  it("rejects missing items", () => {
    expect(insertSaleSchema.safeParse({ subtotal: "7.00", total: "7.00" }).success).toBe(false);
  });

  it("rejects missing subtotal", () => {
    expect(insertSaleSchema.safeParse({ items: [], total: "7.00" }).success).toBe(false);
  });

  it("rejects missing total", () => {
    expect(insertSaleSchema.safeParse({ items: [], subtotal: "7.00" }).success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = insertSaleSchema.safeParse({
      ...validSale,
      tax: "0.84",
      discount: "0.50",
      tip: "1.00",
      paymentMethod: "cash",
      customerId: 5,
      notes: "No sugar",
    });
    expect(result.success).toBe(true);
  });

  it("accepts BIR compliance fields", () => {
    const result = insertSaleSchema.safeParse({
      ...validSale,
      discountType: "senior",
      scPwdId: "SC-12345",
      vatableSales: "6.25",
      vatExemptSales: "0.75",
      zeroRatedSales: "0.00",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty items array", () => {
    expect(insertSaleSchema.safeParse({ ...validSale, items: [] }).success).toBe(true);
  });
});

// ── Expense schema ─────────────────────────────────────────────────────────────

describe("insertExpenseSchema", () => {
  const valid = { category: "Supplies", description: "Paper cups", amount: "150.00" };

  it("accepts a valid expense", () => {
    expect(insertExpenseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing category", () => {
    expect(insertExpenseSchema.safeParse({ description: "cups", amount: "150.00" }).success).toBe(false);
  });

  it("rejects empty category", () => {
    expect(insertExpenseSchema.safeParse({ ...valid, category: "" }).success).toBe(false);
  });

  it("rejects missing description", () => {
    expect(insertExpenseSchema.safeParse({ category: "Supplies", amount: "150.00" }).success).toBe(false);
  });

  it("rejects empty description", () => {
    expect(insertExpenseSchema.safeParse({ ...valid, description: "" }).success).toBe(false);
  });

  it("rejects missing amount", () => {
    expect(insertExpenseSchema.safeParse({ category: "Supplies", description: "cups" }).success).toBe(false);
  });

  it("accepts optional branchId", () => {
    expect(insertExpenseSchema.safeParse({ ...valid, branchId: 2 }).success).toBe(true);
  });
});

// ── Branch schema ──────────────────────────────────────────────────────────────

describe("insertBranchSchema", () => {
  it("accepts a branch with only name", () => {
    expect(insertBranchSchema.safeParse({ name: "Main Branch" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(insertBranchSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects missing name", () => {
    expect(insertBranchSchema.safeParse({ address: "123 St" }).success).toBe(false);
  });

  it("defaults isActive to true", () => {
    const result = insertBranchSchema.safeParse({ name: "Branch A" });
    expect(result.success).toBe(true);
    expect(result.data?.isActive).toBe(true);
  });

  it("accepts isActive: false", () => {
    expect(insertBranchSchema.safeParse({ name: "Closed Branch", isActive: false }).success).toBe(true);
  });
});

// ── Tenant schema ──────────────────────────────────────────────────────────────

describe("insertTenantSchema", () => {
  it("accepts valid name and slug", () => {
    expect(insertTenantSchema.safeParse({ name: "Acme Corp", slug: "acme-corp" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(insertTenantSchema.safeParse({ name: "", slug: "acme" }).success).toBe(false);
  });

  it("rejects empty slug", () => {
    expect(insertTenantSchema.safeParse({ name: "Acme", slug: "" }).success).toBe(false);
  });

  it("rejects missing slug", () => {
    expect(insertTenantSchema.safeParse({ name: "Acme" }).success).toBe(false);
  });
});

// ── UserBranch schema ──────────────────────────────────────────────────────────

describe("insertUserBranchSchema", () => {
  it("accepts valid userId and branchId", () => {
    expect(insertUserBranchSchema.safeParse({ userId: "user_123", branchId: 1 }).success).toBe(true);
  });

  it("rejects missing userId", () => {
    expect(insertUserBranchSchema.safeParse({ branchId: 1 }).success).toBe(false);
  });

  it("rejects missing branchId", () => {
    expect(insertUserBranchSchema.safeParse({ userId: "user_123" }).success).toBe(false);
  });

  it("rejects string branchId", () => {
    expect(insertUserBranchSchema.safeParse({ userId: "user_123", branchId: "one" }).success).toBe(false);
  });
});

// ── Table schema ───────────────────────────────────────────────────────────────

describe("insertTableSchema", () => {
  it("accepts a table with only name", () => {
    expect(insertTableSchema.safeParse({ name: "Table 1" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(insertTableSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts optional seats and status", () => {
    expect(
      insertTableSchema.safeParse({ name: "Table 2", seats: 4, status: "available" }).success
    ).toBe(true);
  });
});
