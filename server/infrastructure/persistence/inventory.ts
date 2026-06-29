import { db } from "../../db";
import {
  ingredients,
  productRecipes,
  wasteLog,
  stockTransfers,
  stockTransferItems,
  stockLogs,
  products,
  type Ingredient,
  type InsertIngredient,
  type ProductRecipe,
  type WasteLogEntry,
  type StockTransfer,
  type StockTransferItem,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getIngredients(userId: string): Promise<Ingredient[]> {
  const userIds = await getTenantUserIds(userId);
  return db
    .select()
    .from(ingredients)
    .where(and(inArray(ingredients.userId, userIds), isNull(ingredients.deletedAt)))
    .orderBy(desc(ingredients.id));
}

export async function getIngredient(id: number, userId: string): Promise<Ingredient | undefined> {
  const userIds = await getTenantUserIds(userId);
  const [row] = await db
    .select()
    .from(ingredients)
    .where(and(eq(ingredients.id, id), inArray(ingredients.userId, userIds), isNull(ingredients.deletedAt)));
  return row;
}

export async function createIngredient(userId: string, data: InsertIngredient): Promise<Ingredient> {
  const [created] = await db.insert(ingredients).values({ ...data, userId } as any).returning();
  return created;
}

export async function updateIngredient(
  id: number,
  userId: string,
  data: Partial<InsertIngredient>,
): Promise<Ingredient | undefined> {
  const existing = await getIngredient(id, userId);
  if (!existing) return undefined;
  const [updated] = await db.update(ingredients).set(data as any).where(eq(ingredients.id, id)).returning();
  return updated;
}

export async function deleteIngredient(id: number, userId: string): Promise<void> {
  const existing = await getIngredient(id, userId);
  if (!existing) return;
  await db
    .update(ingredients)
    .set({ deletedAt: new Date().toISOString() } as any)
    .where(eq(ingredients.id, id));
}

/**
 * Adjusts ingredient stock by a signed delta.
 * Uses GREATEST(0, ...) to prevent stock from going below zero.
 */
export async function adjustIngredientStock(
  id: number,
  userId: string,
  delta: number,
): Promise<Ingredient | undefined> {
  const existing = await getIngredient(id, userId);
  if (!existing) return undefined;
  const [updated] = await db
    .update(ingredients)
    .set({
      stockQty: sql`GREATEST('0', (COALESCE(stock_qty::numeric, 0) + ${delta}))::text`,
    } as any)
    .where(eq(ingredients.id, id))
    .returning();
  return updated;
}

export async function getRecipeForProduct(
  productId: number,
  userId: string,
): Promise<(ProductRecipe & { ingredientName: string; unit: string })[]> {
  const userIds = await getTenantUserIds(userId);
  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), inArray(products.userId, userIds)));
  if (!prod) return [];
  const rows = await db
    .select({
      id: productRecipes.id,
      productId: productRecipes.productId,
      ingredientId: productRecipes.ingredientId,
      quantity: productRecipes.quantity,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
    })
    .from(productRecipes)
    .leftJoin(ingredients, eq(productRecipes.ingredientId, ingredients.id))
    .where(eq(productRecipes.productId, productId));
  return rows as any;
}

export async function getProductsUsingIngredient(
  ingredientId: number,
  userId: string,
): Promise<{ id: number; name: string; quantity: string }[]> {
  const userIds = await getTenantUserIds(userId);
  const [ing] = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(
      and(eq(ingredients.id, ingredientId), inArray(ingredients.userId, userIds), isNull(ingredients.deletedAt)),
    );
  if (!ing) return [];
  return db
    .select({ id: products.id, name: products.name, quantity: productRecipes.quantity })
    .from(productRecipes)
    .innerJoin(products, eq(products.id, productRecipes.productId))
    .where(and(eq(productRecipes.ingredientId, ingredientId), inArray(products.userId, userIds)))
    .orderBy(products.name);
}

/**
 * Replaces all recipe entries for a product.
 *
 * Guards against silently wiping the recipe when the caller passes ingredient IDs
 * that all fail the tenant ownership check: if items were provided but none pass
 * the filter, we throw instead of deleting all recipes and inserting nothing.
 */
export async function setRecipeForProduct(
  productId: number,
  userId: string,
  items: { ingredientId: number; quantity: string }[],
): Promise<void> {
  const userIds = await getTenantUserIds(userId);
  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), inArray(products.userId, userIds)));
  if (!prod) throw new Error("Product not found");

  if (items.length === 0) {
    await db.delete(productRecipes).where(eq(productRecipes.productId, productId));
    return;
  }

  // Validate that at least one ingredient belongs to this tenant before mutating
  const ingIds = items.map((i) => i.ingredientId);
  const tenantIngs = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(inArray(ingredients.id, ingIds), inArray(ingredients.userId, userIds)));
  const allowed = new Set(tenantIngs.map((i) => i.id));
  const filtered = items.filter((i) => allowed.has(i.ingredientId));

  if (filtered.length === 0) {
    // None of the provided ingredients belong to this tenant — refuse silently wiping
    throw new Error("None of the provided ingredients belong to this tenant");
  }

  await db.transaction(async (tx) => {
    await tx.delete(productRecipes).where(eq(productRecipes.productId, productId));
    await tx.insert(productRecipes).values(
      filtered.map((i) => ({
        productId,
        ingredientId: i.ingredientId,
        quantity: i.quantity,
      })) as any,
    );
  });
}

export async function deductIngredientsForSale(
  userId: string,
  items: { productId: number; quantity: number }[],
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  const userIds = await getTenantUserIds(userId);

  const productQty = new Map<number, number>();
  for (const it of items) {
    const pid = Number(it?.productId);
    const qty = Number(it?.quantity ?? 1);
    if (!Number.isFinite(pid) || !Number.isFinite(qty) || qty <= 0) continue;
    productQty.set(pid, (productQty.get(pid) ?? 0) + qty);
  }
  if (productQty.size === 0) return;

  const productIds = [...productQty.keys()];
  const recipes = await db
    .select()
    .from(productRecipes)
    .where(inArray(productRecipes.productId, productIds));
  if (recipes.length === 0) return;

  const tenantProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, productIds), inArray(products.userId, userIds)));
  const allowedProducts = new Set(tenantProducts.map((p) => p.id));

  const ingredientDelta = new Map<number, number>();
  for (const r of recipes) {
    if (!allowedProducts.has(r.productId)) continue;
    const sold = productQty.get(r.productId) ?? 0;
    const perUnit = parseFloat(r.quantity || "0");
    if (sold <= 0 || !Number.isFinite(perUnit) || perUnit <= 0) continue;
    ingredientDelta.set(r.ingredientId, (ingredientDelta.get(r.ingredientId) ?? 0) + sold * perUnit);
  }
  if (ingredientDelta.size === 0) return;

  await db.transaction(async (tx) => {
    await Promise.all(
      [...ingredientDelta.entries()].map(([ingId, delta]) =>
        tx
          .update(ingredients)
          .set({
            // GREATEST prevents stock going negative during recipe deduction
            stockQty: sql`GREATEST('0', (COALESCE(stock_qty::numeric, 0) - ${delta}))::text`,
          } as any)
          .where(eq(ingredients.id, ingId)),
      ),
    );
  });
}

export async function getWasteLogs(userId: string, branchId?: number | null): Promise<WasteLogEntry[]> {
  const userIds = await getTenantUserIds(userId);
  const conds: ReturnType<typeof eq>[] = [inArray(wasteLog.userId, userIds) as ReturnType<typeof eq>];
  if (branchId != null) conds.push(eq(wasteLog.branchId, branchId) as ReturnType<typeof eq>);
  return db.select().from(wasteLog).where(and(...conds)).orderBy(desc(wasteLog.createdAt));
}

export async function createWasteLog(
  userId: string,
  data: {
    productId?: number | null;
    ingredientId?: number | null;
    itemName: string;
    quantity: string;
    unit?: string;
    reason: string;
    costImpact: string;
    note?: string;
    branchId?: number | null;
  },
): Promise<WasteLogEntry> {
  const [entry] = await db
    .insert(wasteLog)
    .values({
      userId,
      productId: data.productId ?? null,
      ingredientId: data.ingredientId ?? null,
      itemName: data.itemName,
      quantity: data.quantity,
      unit: data.unit ?? "pcs",
      reason: data.reason,
      costImpact: data.costImpact,
      note: data.note ?? null,
      branchId: data.branchId ?? null,
    })
    .returning();

  if (data.productId && Number(data.quantity) > 0) {
    const qty = Math.round(Number(data.quantity));
    const [prod] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, data.productId));
    const prev = prod?.stock ?? 0;
    const next = Math.max(0, prev - qty);
    await (db.update(products) as ReturnType<typeof db.update>)
      .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) - ${qty})` })
      .where(eq(products.id, data.productId));
    await db.insert(stockLogs).values({
      productId: data.productId,
      userId,
      previousStock: prev,
      newStock: next,
      delta: -qty,
      reason: "waste",
      note: `${data.reason}${data.note ? ": " + data.note : ""}`,
    });
  }

  if (data.ingredientId && Number(data.quantity) > 0) {
    await (db.update(ingredients) as ReturnType<typeof db.update>)
      .set({
        stockQty: sql`GREATEST('0', (COALESCE(stock_qty, '0')::numeric - ${Number(data.quantity)})::text)`,
      })
      .where(eq(ingredients.id, data.ingredientId));
  }
  return entry;
}

export async function getStockTransfers(
  userId: string,
  branchId?: number | null,
): Promise<(StockTransfer & { items: StockTransferItem[] })[]> {
  const userIds = await getTenantUserIds(userId);
  const conds: ReturnType<typeof eq>[] = [inArray(stockTransfers.userId, userIds) as ReturnType<typeof eq>];
  if (branchId != null) {
    conds.push(
      sql`(${stockTransfers.fromBranchId} = ${branchId} OR ${stockTransfers.toBranchId} = ${branchId})` as ReturnType<
        typeof eq
      >,
    );
  }
  const transfers = await db
    .select()
    .from(stockTransfers)
    .where(and(...conds))
    .orderBy(desc(stockTransfers.createdAt));
  if (transfers.length === 0) return [];
  const ids = transfers.map((t) => t.id);
  const items = await db.select().from(stockTransferItems).where(inArray(stockTransferItems.transferId, ids));
  const itemsByTransfer = new Map<number, StockTransferItem[]>();
  for (const item of items) {
    const arr = itemsByTransfer.get(item.transferId) ?? [];
    arr.push(item);
    itemsByTransfer.set(item.transferId, arr);
  }
  return transfers.map((t) => ({ ...t, items: itemsByTransfer.get(t.id) ?? [] }));
}

/**
 * Creates a stock transfer and deducts stock from the source branch.
 * Stock log entries now carry the real previousStock / newStock values
 * instead of the hardcoded 0 / 0 that corrupted the audit trail.
 */
export async function createStockTransfer(
  userId: string,
  data: {
    fromBranchId?: number | null;
    toBranchId?: number | null;
    notes?: string;
    items: { productId: number; productName: string; quantity: number; note?: string }[];
  },
): Promise<StockTransfer & { items: StockTransferItem[] }> {
  const [transfer] = await db
    .insert(stockTransfers)
    .values({
      userId,
      fromBranchId: data.fromBranchId ?? null,
      toBranchId: data.toBranchId ?? null,
      notes: data.notes ?? null,
      status: "pending",
      updatedAt: new Date().toISOString(),
    })
    .returning();

  let insertedItems: StockTransferItem[] = [];
  if (data.items.length > 0) {
    insertedItems = await db
      .insert(stockTransferItems)
      .values(
        data.items.map((i) => ({
          transferId: transfer.id,
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          note: i.note ?? null,
        })),
      )
      .returning();

    const userIds = await getTenantUserIds(userId);
    const productIds = data.items.map((i) => i.productId);

    // Fetch current stock for all products in one query so each log entry
    // records the real previousStock / newStock instead of hardcoded zeros.
    const stockRows = await db
      .select({ id: products.id, stock: products.stock })
      .from(products)
      .where(and(inArray(products.id, productIds), inArray(products.userId, userIds)));
    const stockMap = new Map(stockRows.map((r) => [r.id, r.stock ?? 0]));

    for (const item of data.items) {
      const prevStock = stockMap.get(item.productId) ?? 0;
      const newStock = Math.max(0, prevStock - item.quantity);

      await (db.update(products) as ReturnType<typeof db.update>)
        .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) - ${item.quantity})` })
        .where(and(eq(products.id, item.productId), inArray(products.userId, userIds)));

      await db.insert(stockLogs).values({
        productId: item.productId,
        userId,
        previousStock: prevStock,
        newStock,
        delta: -item.quantity,
        reason: "transfer_out",
        note: `Transfer to branch ${data.toBranchId ?? "?"}`,
      });

      // Update the local map so subsequent items see the post-deduction stock
      stockMap.set(item.productId, newStock);
    }
  }
  return { ...transfer, items: insertedItems };
}

/**
 * Updates the status of a stock transfer (in_transit → received | rejected).
 * "received" adds stock to the destination branch; "rejected" restores it to the source.
 * Both cases now write real previousStock / newStock to the stock log.
 */
export async function updateStockTransferStatus(
  id: number,
  userId: string,
  status: "in_transit" | "received" | "rejected",
): Promise<void> {
  const userIds = await getTenantUserIds(userId);
  const [transfer] = await db
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), inArray(stockTransfers.userId, userIds)));
  if (!transfer) throw new Error("Transfer not found");

  await (db.update(stockTransfers) as ReturnType<typeof db.update>)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(stockTransfers.id, id));

  const items = await db
    .select()
    .from(stockTransferItems)
    .where(eq(stockTransferItems.transferId, id));

  if ((status === "received" || status === "rejected") && items.length > 0) {
    const productIds = items.map((i) => i.productId);
    const stockRows = await db
      .select({ id: products.id, stock: products.stock })
      .from(products)
      .where(and(inArray(products.id, productIds), inArray(products.userId, userIds)));
    const stockMap = new Map(stockRows.map((r) => [r.id, r.stock ?? 0]));

    for (const item of items) {
      const prevStock = stockMap.get(item.productId) ?? 0;
      const newStock = prevStock + item.quantity;

      await (db.update(products) as ReturnType<typeof db.update>)
        .set({ stock: sql`COALESCE(stock, 0) + ${item.quantity}` })
        .where(and(eq(products.id, item.productId), inArray(products.userId, userIds)));

      const reason = status === "received" ? "transfer_in" : "transfer_rejected";
      const note =
        status === "received"
          ? `Received transfer from branch ${transfer.fromBranchId ?? "?"}`
          : `Transfer rejected — stock returned`;

      await db.insert(stockLogs).values({
        productId: item.productId,
        userId,
        previousStock: prevStock,
        newStock,
        delta: item.quantity,
        reason,
        note,
      });

      stockMap.set(item.productId, newStock);
    }
  }
}
