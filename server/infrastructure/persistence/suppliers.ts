import { db } from "../../db";
import {
  suppliers,
  supplierProducts,
  purchaseOrders,
  purchaseOrderItems,
  products,
  stockLogs,
  sales,
  type Supplier,
  type InsertSupplier,
  type SupplierProduct,
  type InsertSupplierProduct,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type InsertPurchaseOrder,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getSuppliers(userId: string): Promise<Supplier[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1 ? and(eq(suppliers.userId, userIds[0]), isNull(suppliers.deletedAt)) : and(inArray(suppliers.userId, userIds), isNull(suppliers.deletedAt));
    return await db.select().from(suppliers).where(condition).orderBy(suppliers.name);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return [];
  }
}

export async function createSupplier(userId: string, supplier: InsertSupplier): Promise<Supplier> {
  try {
    const [created] = await db.insert(suppliers).values({ ...supplier, userId } as any).returning();
    return created;
  } catch (error) {
    console.error("Error creating supplier:", error);
    throw error;
  }
}

export async function updateSupplier(id: number, userId: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
    if (!existing || !userIds.includes(existing.userId)) return undefined;
    const [updated] = await db.update(suppliers).set(supplier as any).where(eq(suppliers.id, id)).returning();
    return updated;
  } catch (error) {
    console.error("Error updating supplier:", error);
    return undefined;
  }
}

export async function deleteSupplier(id: number, userId: string): Promise<void> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    if (!existing || !userIds.includes(existing.userId)) return;
    await db.update(suppliers).set({ deletedAt: new Date().toISOString() } as any).where(eq(suppliers.id, id));
  } catch (error) {
    console.error("Error deleting supplier:", error);
    throw error;
  }
}

export async function getSupplierStats(userId: string, supplierId: number): Promise<{ totalOrders: number; totalSpent: number; pendingAmount: number; lastOrderAt: string | null }> {
  try {
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(purchaseOrders.supplierId, supplierId), eq(purchaseOrders.userId, userIds[0]))
      : and(eq(purchaseOrders.supplierId, supplierId), inArray(purchaseOrders.userId, userIds));
    const pos = await db.select().from(purchaseOrders).where(condition).orderBy(desc(purchaseOrders.createdAt));
    const totalOrders = pos.length;
    const totalSpent = pos.filter(p => p.status === "received").reduce((s, p) => s + parseFloat(p.totalAmount || "0"), 0);
    const pendingAmount = pos.filter(p => p.status === "pending").reduce((s, p) => s + parseFloat(p.totalAmount || "0"), 0);
    const lastOrderAt = pos[0]?.createdAt ?? null;
    return { totalOrders, totalSpent, pendingAmount, lastOrderAt };
  } catch {
    return { totalOrders: 0, totalSpent: 0, pendingAmount: 0, lastOrderAt: null };
  }
}

export async function getSupplierProducts(supplierId: number, userId: string): Promise<(SupplierProduct & { productName: string; productSku: string | null; currentStock: number | null })[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [supplier] = await db.select({ id: suppliers.id }).from(suppliers)
      .where(and(eq(suppliers.id, supplierId), inArray(suppliers.userId, userIds)));
    if (!supplier) return [];

    const rows = await db.select({
      id: supplierProducts.id,
      supplierId: supplierProducts.supplierId,
      productId: supplierProducts.productId,
      unitCost: supplierProducts.unitCost,
      minOrderQty: supplierProducts.minOrderQty,
      leadDays: supplierProducts.leadDays,
      createdAt: supplierProducts.createdAt,
      productName: products.name,
      productSku: products.sku,
      currentStock: products.stock,
    })
      .from(supplierProducts)
      .innerJoin(products, eq(products.id, supplierProducts.productId))
      .where(eq(supplierProducts.supplierId, supplierId))
      .orderBy(products.name);
    return rows;
  } catch {
    return [];
  }
}

export async function upsertSupplierProduct(supplierId: number, userId: string, data: InsertSupplierProduct): Promise<SupplierProduct> {
  const [existing] = await db.select().from(supplierProducts)
    .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.productId, data.productId)));
  if (existing) {
    const [updated] = await db.update(supplierProducts)
      .set({ unitCost: data.unitCost, minOrderQty: data.minOrderQty ?? 1, leadDays: data.leadDays ?? null } as any)
      .where(eq(supplierProducts.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(supplierProducts).values({ supplierId, ...data } as any).returning();
  return created;
}

export async function deleteSupplierProduct(id: number, userId: string): Promise<void> {
  const userIds = await getTenantUserIds(userId);
  const [row] = await db.select({ supplierId: supplierProducts.supplierId })
    .from(supplierProducts).where(eq(supplierProducts.id, id));
  if (!row) return;
  const [supplier] = await db.select({ id: suppliers.id }).from(suppliers)
    .where(and(eq(suppliers.id, row.supplierId), inArray(suppliers.userId, userIds)));
  if (!supplier) return;
  await db.delete(supplierProducts).where(eq(supplierProducts.id, id));
}

export async function getPurchaseOrders(userId: string): Promise<(PurchaseOrder & { items: PurchaseOrderItem[] })[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1 ? eq(purchaseOrders.userId, userIds[0]) : inArray(purchaseOrders.userId, userIds);
    const pos = await db.select().from(purchaseOrders).where(condition).orderBy(desc(purchaseOrders.createdAt)).limit(200);
    if (pos.length === 0) return [];

    const poIds = pos.map(p => p.id);
    const allItems = await db.select().from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.purchaseOrderId, poIds));
    const itemsByPo = new Map<number, PurchaseOrderItem[]>();
    for (const item of allItems) {
      const list = itemsByPo.get(item.purchaseOrderId) ?? [];
      list.push(item);
      itemsByPo.set(item.purchaseOrderId, list);
    }
    return pos.map(po => ({ ...po, items: itemsByPo.get(po.id) ?? [] }));
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    return [];
  }
}

export async function createPurchaseOrder(userId: string, po: InsertPurchaseOrder): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }> {
  try {
    const { items = [], ...poData } = po;
    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.totalCost || "0"), 0).toFixed(2);

    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(purchaseOrders).values({
        ...poData,
        userId,
        totalAmount,
      } as any).returning();

      const createdItems: PurchaseOrderItem[] =
        items.length > 0
          ? await tx.insert(purchaseOrderItems)
              .values(items.map((item) => ({ ...item, purchaseOrderId: created.id }) as any))
              .returning()
          : [];
      return { ...created, items: createdItems };
    });
  } catch (error) {
    console.error("Error creating purchase order:", error);
    throw error;
  }
}

export async function receivePurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po || !userIds.includes(po.userId)) return undefined;

    if ((po as any).status === "received") return po as PurchaseOrder;

    const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));

    const productIds = items.map(i => i.productId).filter((pid): pid is number => pid != null);
    const deltaMap = new Map<number, number>();
    for (const item of items) {
      if (item.productId != null && productIds.includes(item.productId)) {
        deltaMap.set(item.productId, (deltaMap.get(item.productId) ?? 0) + item.quantity);
      }
    }

    const currentStocks = productIds.length > 0
      ? await db.select({ id: products.id, stock: products.stock }).from(products)
          .where(inArray(products.id, productIds))
      : [];
    const stockMap = new Map(currentStocks.map(p => [p.id, p.stock ?? 0]));

    const [updated] = await db.transaction(async (tx) => {
      await Promise.all(
        [...deltaMap.entries()].map(async ([pid, delta]) => {
          const previousStock = stockMap.get(pid) ?? 0;
          const newStock = previousStock + delta;
          await tx.update(products)
            .set({ stock: sql`COALESCE(stock, 0) + ${delta}` } as any)
            .where(eq(products.id, pid));
          await tx.insert(stockLogs).values({
            productId: pid,
            userId: po.userId,
            previousStock,
            newStock,
            delta,
            reason: "purchase_order",
            note: `PO #${id} received`,
          } as any).catch(() => {});
        })
      );
      return tx.update(purchaseOrders).set({
        status: "received",
        receivedAt: new Date().toISOString(),
      } as any).where(eq(purchaseOrders.id, id)).returning();
    });

    return updated;
  } catch (error) {
    console.error("Error receiving purchase order:", error);
    return undefined;
  }
}

export async function cancelPurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po || !userIds.includes(po.userId)) return undefined;
    const [updated] = await db.update(purchaseOrders).set({ status: "cancelled" } as any).where(eq(purchaseOrders.id, id)).returning();
    return updated;
  } catch (error) {
    console.error("Error cancelling purchase order:", error);
    return undefined;
  }
}

export async function updatePurchaseOrderPayment(id: number, userId: string, paymentStatus: string): Promise<PurchaseOrder | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po || !userIds.includes(po.userId)) return undefined;
    const [updated] = await db.update(purchaseOrders).set({ paymentStatus } as any).where(eq(purchaseOrders.id, id)).returning();
    return updated;
  } catch (error) {
    console.error("Error updating PO payment:", error);
    return undefined;
  }
}

export async function getReorderSuggestions(userId: string, branchId?: number | null): Promise<{
  productId: number; productName: string; currentStock: number;
  lowStockThreshold: number; soldLast30Days: number; avgDailySales: number;
  daysOfStockLeft: number; suggestedOrderQty: number; preferredSupplierId: number | null;
  preferredSupplierName: string | null; unitCost: string | null;
}[]> {
  const userIds = await getTenantUserIds(userId);
  const userCond = userIds.length === 1 ? eq(products.userId, userIds[0]) : inArray(products.userId, userIds);
  const branchCond = branchId != null ? eq(products.branchId, branchId) : undefined;
  const lowStockProds = await db.select().from(products).where(
    and(userCond, branchCond, eq(products.trackStock, true), sql`COALESCE(stock, 0) <= COALESCE(low_stock_threshold, 10)`, isNull(products.deletedAt))
  );
  if (lowStockProds.length === 0) return [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentSales = await db.select({ id: sales.id, items: sales.items, createdAt: sales.createdAt })
    .from(sales)
    .where(and(inArray(sales.userId, userIds), sql`${sales.createdAt} >= ${thirtyDaysAgo}`, isNull(sales.deletedAt)));

  const soldMap = new Map<number, number>();
  for (const sale of recentSales) {
    const items = (sale.items ?? []) as { productId?: number; id?: number; quantity?: number }[];
    for (const item of items) {
      const pid = Number(item.productId ?? item.id);
      if (!Number.isFinite(pid)) continue;
      soldMap.set(pid, (soldMap.get(pid) ?? 0) + Number(item.quantity ?? 1));
    }
  }

  const productIds = lowStockProds.map(p => p.id);
  const supplierProds = productIds.length > 0
    ? await db.select({ productId: supplierProducts.productId, supplierId: supplierProducts.supplierId, unitCost: supplierProducts.unitCost })
        .from(supplierProducts).where(inArray(supplierProducts.productId, productIds))
    : [];
  const supplierMap = new Map<number, { supplierId: number; unitCost: string }>();
  for (const sp of supplierProds) { if (!supplierMap.has(sp.productId)) supplierMap.set(sp.productId, { supplierId: sp.supplierId, unitCost: sp.unitCost }); }

  const supplierIdSet = new Set<number>();
  for (const sv of supplierMap.values()) supplierIdSet.add(sv.supplierId);
  const supplierIds = [...supplierIdSet];
  const supplierNames = supplierIds.length > 0
    ? await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(inArray(suppliers.id, supplierIds as number[]))
    : [];
  const supplierNameMap = new Map(supplierNames.map(s => [s.id, s.name]));

  return lowStockProds.map(prod => {
    const sold30 = soldMap.get(prod.id) ?? 0;
    const avgDaily = sold30 / 30;
    const current = prod.stock ?? 0;
    const daysLeft = avgDaily > 0 ? Math.floor(current / avgDaily) : 999;
    const reorderDays = 14;
    const suggested = Math.max(prod.lowStockThreshold ?? 10, Math.ceil(avgDaily * reorderDays * 1.2));
    const sp = supplierMap.get(prod.id);
    return {
      productId: prod.id, productName: prod.name,
      currentStock: current, lowStockThreshold: prod.lowStockThreshold ?? 10,
      soldLast30Days: sold30, avgDailySales: Math.round(avgDaily * 10) / 10,
      daysOfStockLeft: daysLeft, suggestedOrderQty: suggested,
      preferredSupplierId: sp?.supplierId ?? null,
      preferredSupplierName: sp ? (supplierNameMap.get(sp.supplierId) ?? null) : null,
      unitCost: sp?.unitCost ?? null,
    };
  }).sort((a, b) => a.daysOfStockLeft - b.daysOfStockLeft);
}
