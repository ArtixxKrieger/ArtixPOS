import { db } from "./db";
import {
  purchaseOrders,
  suppliers,
  products,
  branches,
  users,
  userSettings,
} from "@shared/schema";
import { eq, and, isNull, lt, lte, gte, isNotNull } from "drizzle-orm";
import { isExpiryTrackingBusiness } from "@shared/business-access";
import { sendPushToTenant } from "./push";

const CHECK_INTERVAL_MS = 15 * 60 * 1_000;

const EXPIRY_WARNING_DAYS = 7;
const BRANCH_OFFLINE_AFTER_MS = 30 * 60 * 1_000;

async function checkOverduePurchaseOrders(): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const overdue = await db.select().from(purchaseOrders).where(
      and(
        isNull(purchaseOrders.receivedAt),
        isNull(purchaseOrders.overdueAlertedAt),
        isNotNull(purchaseOrders.expectedDeliveryAt),
        lt(purchaseOrders.expectedDeliveryAt, nowIso),
      ),
    );
    const active = overdue.filter((po) => po.status !== "cancelled" && po.status !== "received");
    if (active.length === 0) return;

    for (const po of active) {
      const [owner] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, po.userId));
      if (!owner?.tenantId) continue;

      let supplierName = "your supplier";
      if (po.supplierId) {
        const [supplier] = await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, po.supplierId));
        if (supplier?.name) supplierName = supplier.name;
      }

      await sendPushToTenant(owner.tenantId, {
        title: `⏰ Delivery overdue: PO #${po.id}`,
        body: `${supplierName} hasn't delivered PO #${po.id} yet (expected ${new Date(po.expectedDeliveryAt!).toLocaleDateString()}).`,
        tag: `po-overdue-${po.id}`,
        url: "/purchases",
      }).catch(() => {});

      await db.update(purchaseOrders)
        .set({ overdueAlertedAt: new Date().toISOString() } as any)
        .where(eq(purchaseOrders.id, po.id))
        .catch(() => {});
    }
  } catch (err) {
    console.warn("[notifications] overdue PO check failed:", (err as Error)?.message ?? String(err));
  }
}

async function checkExpiringProducts(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + EXPIRY_WARNING_DAYS);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const todayIso = new Date().toISOString().slice(0, 10);

    const candidates = await db.select().from(products).where(
      and(
        isNull(products.deletedAt),
        isNotNull(products.expiryDate),
        isNull(products.expiryAlertedAt),
        lte(products.expiryDate, cutoffIso),
        gte(products.expiryDate, todayIso),
      ),
    ).catch(async () => {
      // Fallback: some expiryDate values may not compare lexicographically
      // as ISO dates (defensive — filter in JS instead).
      const all = await db.select().from(products).where(
        and(isNull(products.deletedAt), isNotNull(products.expiryDate), isNull(products.expiryAlertedAt)),
      );
      return all.filter((p) => {
        if (!p.expiryDate) return false;
        const d = new Date(p.expiryDate);
        if (Number.isNaN(d.getTime())) return false;
        return d >= new Date() && d <= cutoff;
      });
    });

    if (candidates.length === 0) return;

    for (const product of candidates) {
      const [owner] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, product.userId));
      if (!owner?.tenantId) continue;

      const [settings] = await db.select({ businessType: userSettings.businessType, businessSubType: userSettings.businessSubType })
        .from(userSettings)
        .where(eq(userSettings.userId, product.userId));

      let businessType = settings?.businessType ?? null;
      let businessSubType = settings?.businessSubType ?? null;
      if (product.branchId) {
        const [branch] = await db.select({ businessType: branches.businessType, businessSubType: branches.businessSubType })
          .from(branches).where(eq(branches.id, product.branchId));
        if (branch?.businessType) {
          businessType = branch.businessType;
          businessSubType = branch.businessSubType;
        }
      }

      if (!isExpiryTrackingBusiness(businessType, businessSubType)) continue;

      const daysLeft = Math.max(0, Math.ceil((new Date(product.expiryDate!).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

      await sendPushToTenant(owner.tenantId, {
        title: `⏳ Expiring soon: ${product.name}`,
        body: daysLeft === 0
          ? `${product.name} expires today. Consider a markdown or pulling it from shelves.`
          : `${product.name} expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
        tag: `expiry-${product.id}`,
        url: "/expiry",
      }).catch(() => {});

      await db.update(products)
        .set({ expiryAlertedAt: new Date().toISOString() } as any)
        .where(eq(products.id, product.id))
        .catch(() => {});
    }
  } catch (err) {
    console.warn("[notifications] expiring product check failed:", (err as Error)?.message ?? String(err));
  }
}

async function checkOfflineBranches(): Promise<void> {
  try {
    const staleBefore = new Date(Date.now() - BRANCH_OFFLINE_AFTER_MS).toISOString();
    const candidates = await db.select().from(branches).where(
      and(
        eq(branches.isActive, true),
        isNull(branches.deletedAt),
        isNotNull(branches.lastHeartbeatAt),
        isNull(branches.offlineAlertedAt),
        lt(branches.lastHeartbeatAt, staleBefore),
      ),
    );
    if (candidates.length === 0) return;

    for (const branch of candidates) {
      await sendPushToTenant(branch.tenantId, {
        title: `📡 ${branch.name} appears offline`,
        body: `No activity from this branch in over ${Math.round(BRANCH_OFFLINE_AFTER_MS / 60000)} minutes. Check its connection.`,
        tag: `branch-offline-${branch.id}`,
        url: "/admin/branches",
      }).catch(() => {});

      await db.update(branches)
        .set({ offlineAlertedAt: new Date().toISOString() } as any)
        .where(eq(branches.id, branch.id))
        .catch(() => {});
    }
  } catch (err) {
    console.warn("[notifications] branch offline check failed:", (err as Error)?.message ?? String(err));
  }
}

async function runAllChecks(): Promise<void> {
  await checkOverduePurchaseOrders();
  await checkExpiringProducts();
  await checkOfflineBranches();
}

export function startNotificationScheduler(): void {
  runAllChecks().catch(() => {});

  const timer = setInterval(() => {
    runAllChecks().catch(() => {});
  }, CHECK_INTERVAL_MS);

  timer.unref();

  console.log("[notifications] Scheduler started — overdue POs, expiring products, offline branches checked every 15m");
}
