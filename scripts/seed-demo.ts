/**
 * Seed 1 year of realistic demo data for shyttyplays@gmail.com
 * Uses client.batch() to send inserts in bulk – much faster over network.
 * Run with:  npx tsx scripts/seed-demo.ts
 */

import { createClient, type InStatement } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, and } from "drizzle-orm";
import * as schema from "../shared/schema";
import { randomUUID } from "crypto";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const ri = (a: number, b: number) => Math.floor(rand(a, b + 1));
const pick = <T>(a: T[]): T => a[ri(0, a.length - 1)];
const fmt = (n: number) => n.toFixed(2);

function daysAgo(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(ri(7, 9), ri(0, 59), ri(0, 59), 0);
  return dt.toISOString();
}
function addMinutes(iso: string, m: number) {
  return new Date(new Date(iso).getTime() + m * 60_000).toISOString();
}

// send stmts in chunks of `size`
async function batchSend(stmts: InStatement[], size = 80) {
  for (let i = 0; i < stmts.length; i += size) {
    await client.batch(stmts.slice(i, i + size), "write");
  }
}

// ─── Reference data ──────────────────────────────────────────────────────────

const PRODUCTS_DEF = [
  { name: "Espresso", price: "65", category: "Coffee" },
  { name: "Americano", price: "85", category: "Coffee" },
  { name: "Cappuccino", price: "110", category: "Coffee" },
  { name: "Caramel Latte", price: "130", category: "Coffee" },
  { name: "Matcha Latte", price: "120", category: "Coffee" },
  { name: "Iced Coffee", price: "95", category: "Coffee" },
  { name: "Chocolate Frappe", price: "145", category: "Coffee" },
  { name: "Cheesecake Slice", price: "125", category: "Pastry" },
  { name: "Croissant", price: "75", category: "Pastry" },
  { name: "Blueberry Muffin", price: "80", category: "Pastry" },
  { name: "Club Sandwich", price: "180", category: "Food" },
  { name: "Chicken Wrap", price: "160", category: "Food" },
  { name: "Caesar Salad", price: "155", category: "Food" },
  { name: "Fruit Waffle", price: "170", category: "Food" },
  { name: "Still Water (500ml)", price: "30", category: "Beverage" },
  { name: "Sparkling Water", price: "55", category: "Beverage" },
  { name: "Fresh Orange Juice", price: "90", category: "Beverage" },
  { name: "Strawberry Smoothie", price: "135", category: "Beverage" },
];

const CUSTOMER_NAMES = [
  "Maria Santos", "Juan dela Cruz", "Ana Reyes", "Carlos Gomez", "Lucia Torres",
  "Miguel Bautista", "Rosa Fernandez", "Jose Ramos", "Carmen Mendoza", "Pedro Villanueva",
  "Sofia Castillo", "Diego Morales", "Isabela Garcia", "Andres Navarro", "Elena Herrera",
  "Rafael Cruz", "Valentina Jimenez", "Adrian Vargas", "Paula Romero", "Marco Salazar",
  "Bianca Lim", "Renz Abad", "Trisha Dela Rosa", "Aaron Villafuerte", "Jenny Corpuz",
];

const STAFF_NAMES = [
  { name: "Camille Reyes", role: "manager" },
  { name: "Justin Tan", role: "cashier" },
  { name: "Alyssa Cruz", role: "cashier" },
  { name: "Kevin Santos", role: "admin" },
  { name: "Maricel Buena", role: "cashier" },
];

const EXPENSE_TEMPLATES = [
  { category: "Utilities", description: "Electricity bill", min: 2000, max: 5000 },
  { category: "Supplies", description: "Coffee beans restock", min: 1500, max: 3500 },
  { category: "Supplies", description: "Milk and dairy products", min: 800, max: 2000 },
  { category: "Maintenance", description: "Equipment cleaning/service", min: 500, max: 1500 },
  { category: "Supplies", description: "Packaging and cups", min: 400, max: 900 },
  { category: "Utilities", description: "Internet bill", min: 1500, max: 2500 },
  { category: "Maintenance", description: "Minor repairs", min: 300, max: 1200 },
];

const REFUND_REASONS = [
  "Wrong order delivered",
  "Customer changed mind",
  "Product quality issue",
  "Duplicate charge",
  "Item out of stock after payment",
];

const PAYMENT_METHODS = ["cash", "cash", "cash", "gcash", "gcash", "card"];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Owner
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, "shyttyplays@gmail.com"));
  if (!owner) { console.error("❌  User not found. Log in first."); process.exit(1); }
  console.log(`✅  Owner: ${owner.name}`);

  // 2. Tenant
  let tenantId = owner.tenantId;
  if (!tenantId) {
    tenantId = randomUUID();
    await db.insert(schema.tenants).values({ id: tenantId, name: "Artix Café", slug: "artix-cafe-" + tenantId.slice(0, 6) });
    await db.update(schema.users).set({ tenantId }).where(eq(schema.users.id, owner.id));
  }

  // 3. Branches
  const existingBranches = await db.select().from(schema.branches).where(eq(schema.branches.tenantId, tenantId));
  let branchIds: number[] = existingBranches.map(b => b.id);
  if (branchIds.length === 0) {
    const defs = [
      { name: "Main Branch", address: "123 Rizal Ave, Makati City", phone: "0917-123-4567" },
      { name: "BGC Outlet", address: "BGC High Street, Taguig City", phone: "0918-234-5678" },
      { name: "Ortigas Hub", address: "Robinsons Galleria, Pasig City", phone: "0919-345-6789" },
    ];
    for (const b of defs) {
      const [row] = await db.insert(schema.branches).values({ ...b, tenantId }).returning();
      branchIds.push(row.id);
    }
    console.log(`✅  Created ${branchIds.length} branches`);
  }

  // Assign owner to all branches
  for (const bid of branchIds) {
    const ex = await db.select().from(schema.userBranches).where(and(eq(schema.userBranches.userId, owner.id), eq(schema.userBranches.branchId, bid)));
    if (!ex.length) await db.insert(schema.userBranches).values({ userId: owner.id, branchId: bid });
  }

  // 4. Staff
  const staffIds: string[] = [];
  for (const s of STAFF_NAMES) {
    const email = s.name.toLowerCase().replace(/\s+/g, ".") + "@artixcafe.demo";
    const ex = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (ex.length) { staffIds.push(ex[0].id); continue; }
    const sid = randomUUID();
    await db.insert(schema.users).values({ id: sid, email, name: s.name, provider: "local", providerId: sid, tenantId, role: s.role });
    const assigned = branchIds.slice(0, ri(1, branchIds.length));
    for (const bid of assigned) await db.insert(schema.userBranches).values({ userId: sid, branchId: bid });
    staffIds.push(sid);
  }
  console.log(`✅  Staff ready (${staffIds.length})`);

  // 5. Products
  let productList = await db.select().from(schema.products).where(eq(schema.products.userId, owner.id));
  if (productList.length < 5) {
    for (const p of PRODUCTS_DEF) {
      const [row] = await db.insert(schema.products).values({ userId: owner.id, branchId: branchIds[0], name: p.name, price: p.price, category: p.category }).returning();
      productList.push(row);
    }
    console.log(`✅  Created ${PRODUCTS_DEF.length} products`);
  }

  // 6. Customers
  let customerList = await db.select().from(schema.customers).where(eq(schema.customers.userId, owner.id));
  if (customerList.length < 5) {
    for (const name of CUSTOMER_NAMES) {
      const [row] = await db.insert(schema.customers).values({
        userId: owner.id, name,
        phone: `09${ri(10, 99)}-${ri(100, 999)}-${ri(1000, 9999)}`,
        email: name.toLowerCase().replace(/\s+/g, ".") + "@demo.com",
        totalSpent: "0", visitCount: 0,
      }).returning();
      customerList.push(row);
    }
    console.log(`✅  Created ${CUSTOMER_NAMES.length} customers`);
  }

  // 7. Build all shifts / sales / expenses / refunds in memory, then bulk insert
  console.log("⏳  Building data…");

  const allUsers = [owner.id, ...staffIds];

  type SaleRow = {
    userId: string; branchId: number; customerId: number | null;
    items: string; subtotal: string; tax: string; discount: string;
    total: string; paymentMethod: string; paymentAmount: string; changeAmount: string;
    createdAt: string;
  };
  type ShiftRow = {
    userId: string; branchId: number; status: string;
    openingBalance: string; closingBalance: string;
    totalSales: string; totalExpenses: string; salesCount: number;
    openedAt: string; closedAt: string;
  };
  type ExpenseRow = {
    userId: string; branchId: number; category: string; description: string; amount: string; createdAt: string;
  };

  const salesToInsert: SaleRow[] = [];
  const shiftsToInsert: ShiftRow[] = [];
  const expensesToInsert: ExpenseRow[] = [];

  // Track which sale index (1-based) should get a refund
  const refundTargets: { saleIdx: number; amount: string; reason: string; userId: string; createdAt: string }[] = [];

  let saleIdx = 0;

  for (let day = 364; day >= 0; day--) {
    for (const branchId of branchIds) {
      if (Math.random() < 0.08) continue; // closed ~8% of days

      const openedAt = daysAgo(day);
      const closedAt = addMinutes(openedAt, ri(420, 660)); // 7–11 h
      const shiftUser = pick(allUsers);
      const numSales = ri(6, 30);

      let shiftSalesTotal = 0;
      let shiftExpTotal = 0;

      for (let si = 0; si < numSales; si++) {
        const numItems = ri(1, 4);
        const items: any[] = [];
        let subtotal = 0;
        for (let ii = 0; ii < numItems; ii++) {
          const prod = pick(productList);
          const qty = ri(1, 3);
          const up = parseFloat(prod.price);
          subtotal += up * qty;
          items.push({ productId: prod.id, name: prod.name, price: prod.price, quantity: qty, total: fmt(up * qty) });
        }
        const tax = subtotal * 0.12;
        const total = subtotal + tax;
        shiftSalesTotal += total;
        const pm = pick(PAYMENT_METHODS);
        const pa = pm === "cash" ? total + ri(0, 150) : total;
        const customer = Math.random() < 0.35 ? pick(customerList) : null;
        const saleTime = addMinutes(openedAt, ri(5, ri(300, 600)));

        salesToInsert.push({
          userId: shiftUser,
          branchId,
          customerId: customer?.id ?? null,
          items: JSON.stringify(items),
          subtotal: fmt(subtotal),
          tax: fmt(tax),
          discount: "0",
          total: fmt(total),
          paymentMethod: pm,
          paymentAmount: fmt(pa),
          changeAmount: fmt(Math.max(0, pa - total)),
          createdAt: saleTime,
        });

        saleIdx++;

        // ~4% get refunded
        if (Math.random() < 0.04) {
          refundTargets.push({
            saleIdx, // 1-based index in salesToInsert
            amount: fmt(ri(50, Math.min(300, total))),
            reason: pick(REFUND_REASONS),
            userId: shiftUser,
            createdAt: addMinutes(closedAt, ri(30, 1440)),
          });
        }
      }

      // Expense ~25% of days
      if (Math.random() < 0.25) {
        const tmpl = pick(EXPENSE_TEMPLATES);
        const amt = ri(tmpl.min, tmpl.max);
        shiftExpTotal += amt;
        expensesToInsert.push({
          userId: shiftUser, branchId,
          category: tmpl.category, description: tmpl.description,
          amount: fmt(amt),
          createdAt: addMinutes(openedAt, ri(30, 240)),
        });
      }

      const openBal = ri(1000, 5000);
      shiftsToInsert.push({
        userId: shiftUser, branchId,
        status: "closed",
        openingBalance: fmt(openBal),
        closingBalance: fmt(openBal + shiftSalesTotal - shiftExpTotal),
        totalSales: fmt(shiftSalesTotal),
        totalExpenses: fmt(shiftExpTotal),
        salesCount: numSales,
        openedAt,
        closedAt,
      });
    }
  }

  console.log(`   ${shiftsToInsert.length} shifts, ${salesToInsert.length} sales, ${expensesToInsert.length} expenses, ~${refundTargets.length} refunds`);
  console.log("⏳  Inserting shifts…");

  // Bulk insert shifts
  const shiftStmts: InStatement[] = shiftsToInsert.map(s => ({
    sql: `INSERT INTO shifts (user_id,branch_id,status,opening_balance,closing_balance,total_sales,total_expenses,sales_count,opened_at,closed_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [s.userId, s.branchId, s.status, s.openingBalance, s.closingBalance, s.totalSales, s.totalExpenses, s.salesCount, s.openedAt, s.closedAt],
  }));
  await batchSend(shiftStmts);
  console.log("✅  Shifts done");

  console.log("⏳  Inserting sales…");
  const saleStmts: InStatement[] = salesToInsert.map(s => ({
    sql: `INSERT INTO sales (user_id,branch_id,customer_id,items,subtotal,tax,discount,total,payment_method,payment_amount,change_amount,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [s.userId, s.branchId, s.customerId, s.items, s.subtotal, s.tax, s.discount, s.total, s.paymentMethod, s.paymentAmount, s.changeAmount, s.createdAt],
  }));
  await batchSend(saleStmts, 100);
  console.log("✅  Sales done");

  console.log("⏳  Inserting expenses…");
  const expStmts: InStatement[] = expensesToInsert.map(e => ({
    sql: `INSERT INTO expenses (user_id,branch_id,category,description,amount,created_at) VALUES (?,?,?,?,?,?)`,
    args: [e.userId, e.branchId, e.category, e.description, e.amount, e.createdAt],
  }));
  await batchSend(expStmts);
  console.log("✅  Expenses done");

  // Refunds: need real sale IDs — fetch the last N inserted sales in order
  console.log("⏳  Inserting refunds…");
  const insertedSales = await client.execute({
    sql: `SELECT id FROM sales WHERE user_id = ? ORDER BY id ASC LIMIT ?`,
    args: [owner.id, salesToInsert.length + 10],
  });
  const saleIdRows = insertedSales.rows.map(r => Number(r[0]));

  const refundStmts: InStatement[] = [];
  for (const rt of refundTargets) {
    const sid = saleIdRows[rt.saleIdx - 1];
    if (!sid) continue;
    refundStmts.push({
      sql: `INSERT INTO refunds (sale_id,user_id,amount,reason,created_at) VALUES (?,?,?,?,?)`,
      args: [sid, rt.userId, rt.amount, rt.reason, rt.createdAt],
    });
  }
  await batchSend(refundStmts);
  console.log("✅  Refunds done");

  console.log("\n🎉  Seed complete!");
  console.log(`   Shifts   : ${shiftsToInsert.length}`);
  console.log(`   Sales    : ${salesToInsert.length}`);
  console.log(`   Expenses : ${expensesToInsert.length}`);
  console.log(`   Refunds  : ${refundStmts.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
