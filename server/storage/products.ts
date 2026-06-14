import { db } from "../db";
import { dbRead } from "../db-read";
import {
  products,
  stockLogs,
  users,
  type Product,
  type InsertProduct,
  type StockLog,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, sql, type SQL } from "drizzle-orm";
import { getTenantUserIds } from "./base";
import { createNotification } from "./notifications";

export async function getProducts(
  userId: string,
  branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number },
): Promise<Product[]> {
  try {
    const isOpts = (v: unknown): v is { branchId?: number | null; limit?: number; offset?: number } =>
      typeof v === "object" && v !== null;
    const branchId: number | null | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.branchId : branchIdOrOpts;
    const limit: number | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.limit : undefined;
    const offset: number = (isOpts(branchIdOrOpts) ? branchIdOrOpts.offset : undefined) ?? 0;
    const userIds = await getTenantUserIds(userId);
    const conditions: SQL<unknown>[] = [];
    conditions.push(userIds.length === 1 ? eq(products.userId, userIds[0]) : inArray(products.userId, userIds));
    if (branchId != null) conditions.push(eq(products.branchId, branchId));
    const baseQuery = dbRead.select().from(products).where(and(...conditions)).orderBy(desc(products.id));
    return await (typeof limit === "number" && limit > 0
      ? baseQuery.limit(limit).offset(offset)
      : baseQuery);
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
}

export async function getLowStockProducts(userId: string, branchId?: number | null): Promise<Product[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const conditions: SQL<unknown>[] = [
      isNull(products.deletedAt),
      eq(products.trackStock, true),
      sql`${products.stock} <= ${products.lowStockThreshold}`,
      userIds.length === 1 ? eq(products.userId, userIds[0]) : inArray(products.userId, userIds),
    ];
    if (branchId != null) conditions.push(eq(products.branchId, branchId));
    return await dbRead.select().from(products).where(and(...conditions)).orderBy(products.stock);
  } catch (error) {
    console.error("Error fetching low-stock products:", error);
    return [];
  }
}

export async function getProduct(id: number, userId: string): Promise<Product | undefined> {
  try {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) return undefined;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.tenantId) {
      return product.userId === userId ? product : undefined;
    }
    const [productOwner] = await db.select().from(users).where(eq(users.id, product.userId));
    if (productOwner?.tenantId === user.tenantId) return product;
    return undefined;
  } catch (error) {
    console.error("Error fetching product:", error);
    return undefined;
  }
}

export async function createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product> {
  try {
    const [created] = await db.insert(products).values({ ...product, userId } as any).returning();
    return created;
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
}

export async function updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined> {
  try {
    const existing = await getProduct(id, userId);
    if (!existing) return undefined;
    const [updated] = await db.update(products)
      .set(product as any)
      .where(eq(products.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error("Error updating product:", error);
    return undefined;
  }
}

export async function deleteProduct(id: number, userId: string): Promise<void> {
  try {
    const existing = await getProduct(id, userId);
    if (!existing) return;
    await db.update(products).set({ deletedAt: new Date().toISOString() } as any).where(eq(products.id, id));
  } catch (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
}

export async function adjustStock(id: number, userId: string, delta: number): Promise<Product | undefined> {
  try {
    const existing = await getProduct(id, userId);
    if (!existing) return undefined;
    const previousStock = existing.stock ?? 0;
    const [updated] = await db.update(products)
      .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) + ${delta})` } as any)
      .where(eq(products.id, id))
      .returning();
    if (updated) {
      const newStock = updated.stock ?? 0;
      await db.insert(stockLogs).values({
        productId: id,
        userId,
        previousStock,
        newStock,
        delta: newStock - previousStock,
        reason: "adjustment",
      } as any).catch(() => {});
    }
    return updated;
  } catch (error) {
    console.error("Error adjusting stock:", error);
    return undefined;
  }
}

export async function setStock(id: number, userId: string, newStock: number): Promise<Product | undefined> {
  try {
    const existing = await getProduct(id, userId);
    if (!existing) return undefined;
    const previousStock = existing.stock ?? 0;
    const clampedStock = Math.max(0, newStock);
    const [updated] = await db.update(products)
      .set({ stock: clampedStock } as any)
      .where(eq(products.id, id))
      .returning();
    if (updated) {
      await db.insert(stockLogs).values({
        productId: id,
        userId,
        previousStock,
        newStock: clampedStock,
        delta: clampedStock - previousStock,
        reason: "restock",
      } as any).catch(() => {});
    }
    return updated;
  } catch (error) {
    console.error("Error setting stock:", error);
    return undefined;
  }
}

export async function getStockLogs(productId: number, userId: string): Promise<StockLog[]> {
  try {
    const product = await getProduct(productId, userId);
    if (!product) return [];
    return await db.select().from(stockLogs)
      .where(eq(stockLogs.productId, productId))
      .orderBy(desc(stockLogs.createdAt))
      .limit(50);
  } catch (error) {
    console.error("Error fetching stock logs:", error);
    return [];
  }
}

export async function getProductByBarcode(barcode: string, userId: string): Promise<Product | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(products.barcode, barcode), eq(products.userId, userIds[0]))
      : and(eq(products.barcode, barcode), inArray(products.userId, userIds));
    const [product] = await db.select().from(products).where(condition);
    return product;
  } catch (error) {
    console.error("Error fetching product by barcode:", error);
    return undefined;
  }
}

export async function deductProductStockForSale(userId: string, items: any[]): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  try {
    const userIds = await getTenantUserIds(userId);
    const productQty = new Map<number, number>();
    for (const it of items) {
      const pid = Number(it?.productId ?? it?.id ?? it?.product?.id);
      const qty = Number(it?.quantity ?? 1);
      if (!Number.isFinite(pid) || !Number.isFinite(qty) || qty <= 0) continue;
      productQty.set(pid, (productQty.get(pid) ?? 0) + qty);
    }
    if (productQty.size === 0) return;

    const productIds = [...productQty.keys()];
    const userCondition = userIds.length === 1
      ? eq(products.userId, userIds[0])
      : inArray(products.userId, userIds);
    const rows = await db.select().from(products)
      .where(and(userCondition, inArray(products.id, productIds)));

    for (const product of rows) {
      if (!product.trackStock) continue;
      const sold = productQty.get(product.id) ?? 0;
      if (sold === 0) continue;
      const prevStock = product.stock ?? 0;

      const [updated] = await (db.update(products) as any)
        .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) - ${sold})` })
        .where(eq(products.id, product.id))
        .returning();
      const newStock: number = (updated as any)?.stock ?? Math.max(0, prevStock - sold);
      const threshold = product.lowStockThreshold ?? 10;

      if (newStock === 0 && prevStock > 0) {
        await createNotification(userId, {
          type: "restock",
          title: `${product.name} is out of stock`,
          message: `Sold ${sold} unit${sold !== 1 ? "s" : ""}. Stock is now 0. Reorder immediately.`,
          productId: product.id,
        });
        setImmediate(async () => {
          try {
            const { sendPushToUsers } = await import("../push");
            const tenantUserIds = await getTenantUserIds(userId);
            await sendPushToUsers(tenantUserIds, {
              title: `⚠️ Out of stock: ${product.name}`,
              body: `Sold ${sold} unit${sold !== 1 ? "s" : ""}. Stock is now 0. Reorder immediately.`,
              tag: `stock-${product.id}`,
              url: "/products",
            });
          } catch {}
        });
      } else if (newStock > 0 && newStock <= threshold && prevStock > threshold) {
        await createNotification(userId, {
          type: "low_stock",
          title: `${product.name} is running low`,
          message: `Only ${newStock} unit${newStock !== 1 ? "s" : ""} remaining (threshold: ${threshold}).`,
          productId: product.id,
        });
        setImmediate(async () => {
          try {
            const { sendPushToUsers } = await import("../push");
            const tenantUserIds = await getTenantUserIds(userId);
            await sendPushToUsers(tenantUserIds, {
              title: `📦 Low stock: ${product.name}`,
              body: `Only ${newStock} unit${newStock !== 1 ? "s" : ""} remaining (threshold: ${threshold}).`,
              tag: `stock-${product.id}`,
              url: "/products",
            });
          } catch {}
        });
      }
    }
  } catch (e) {
    console.error("deductProductStockForSale error:", e);
  }
}
