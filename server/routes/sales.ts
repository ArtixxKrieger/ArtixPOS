import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { emit as emitTenantEvent } from "../events";
import { getRolePermissionForRole } from "../admin-storage";
import { getSaleTimestamp } from "../infrastructure/persistence/sales";
import { getClosedShiftsForUser } from "../infrastructure/persistence/shifts";
import { cache, dashboardCacheKey, salesCacheKey } from "../cache";
import { pool } from "../db";
import { runAsAdmin } from "../tenant-context";
import {
  getUserId,
  getActiveBranchId,
  resolveBranchId,
  auditLog,
  isValidDate,
  handleZodError,
  getTenantId,
} from "../lib/route-utils";

const IDEM_TTL_MS = 60 * 60 * 1000; // 1 hour
const PERM_CACHE_TTL_MS = 30_000; // 30 s — role permissions change rarely

/** Cached wrapper around getRolePermissionForRole to avoid a DB hit on every sale. */
async function getRolePermCached(tenantId: string, role: string) {
  const ck = `roleperm:${tenantId}:${role}`;
  const hit = cache.get<Awaited<ReturnType<typeof getRolePermissionForRole>>>(ck);
  if (hit !== undefined) return hit;
  const perm = await getRolePermissionForRole(tenantId, role);
  cache.set(ck, perm, PERM_CACHE_TTL_MS);
  return perm;
}

export function registerSaleRoutes(app: Express): void {
  app.get(api.sales.list.path, requireAuth, async (req, res) => {
    const { limit, offset, startDate, endDate, includeVoided, status } =
      req.query as Record<string, string>;
    if (startDate && !isValidDate(startDate))
      return res.status(400).json({ message: "Invalid startDate format" });
    if (endDate && !isValidDate(endDate))
      return res.status(400).json({ message: "Invalid endDate format" });
    const uid = getUserId(req);
    const bid = getActiveBranchId(req);

    // B-pattern: ?status=void is an alias for ?includeVoided=1
    const showVoided = includeVoided === "1" || status === "void";
    const pageLimit = Math.min(Number(limit) || 200, 1000);

    const tag = `${pageLimit}:${offset || ""}:${startDate || ""}:${endDate || ""}:${showVoided ? "1" : "0"}`;
    const ck = salesCacheKey(uid, bid, tag);
    const salesList = await cache.getOrFetch(
      ck,
      () =>
        storage.getSales(uid, {
          branchId: bid ?? undefined,
          limit: pageLimit,
          offset: Math.max(Number(offset) || 0, 0),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          includeVoided: showVoided,
        }),
      15_000,
    );

    res.json(salesList);
  });

  app.get("/api/sales/export", requireAuth, requireManagerOrAbove, async (req, res) => {
    const { startDate, endDate } = req.query as Record<string, string>;
    const salesList = await storage.getSales(getUserId(req), {
      limit: 5000,
      includeVoided: true,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
    const headers = [
      "id",
      "status",
      "createdAt",
      "receiptNumber",
      "orNumber",
      "invoiceNumber",
      "subtotal",
      "tax",
      "discount",
      "total",
      "paymentMethod",
      "customerName",
      "discountType",
      "scPwdId",
      "vatableSales",
      "vatExemptSales",
      "zeroRatedSales",
      "voidedAt",
      "voidedBy",
      "voidReason",
    ];
    const rows = salesList.map((sale) => {
      const s = sale as any;
      return [
        sale.id,
        s.deletedAt ? "VOID" : "ACTIVE",
        sale.createdAt ?? "",
        s.receiptNumber ?? "",
        s.orNumber ?? "",
        s.invoiceNumber ?? "",
        sale.subtotal ?? "",
        sale.tax ?? "",
        sale.discount ?? "",
        sale.total ?? "",
        sale.paymentMethod ?? "",
        sale.customerName ?? "",
        s.discountType ?? "regular",
        s.scPwdId ?? "",
        s.vatableSales ?? "0",
        s.vatExemptSales ?? "0",
        s.zeroRatedSales ?? "0",
        s.deletedAt ?? "",
        s.deletedBy ?? "",
        s.voidReason ?? "",
      ];
    });
    const filename =
      startDate && endDate
        ? `sales-journal-${startDate}-to-${endDate}.csv`
        : `sales-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.send(csv);
  });

  app.post(api.sales.create.path, requireAuth, async (req, res) => {
    try {
      // Idempotency guard — prevents the offline-sync queue from creating a
      // duplicate sale when a request times out on the client but succeeds on
      // the server.
      const rawIdemKey =
        typeof (req.body as Record<string, unknown>).idempotencyKey === "string"
          ? ((req.body as Record<string, unknown>).idempotencyKey as string)
          : undefined;
      const idemTid = getTenantId(req);
      if (rawIdemKey && idemTid) {
        const ck = `idem:sale:${idemTid}:${rawIdemKey}`;
        const hit = cache.get<object>(ck);
        if (hit) return res.status(201).json(hit);
      }

      const bodySchema = api.sales.create.input.extend({
        subtotal: z.coerce.string(),
        total: z.coerce.string(),
        tax: z.coerce.string().optional(),
        discount: z.coerce.string().optional(),
        paymentAmount: z.coerce.string().optional(),
        changeAmount: z.coerce.string().optional(),
        customerId: z.coerce.number().optional().nullable(),
      });
      const input = bodySchema.parse(req.body);
      const uid = getUserId(req);

      // Never trust client-computed money fields for regular POS cart checkouts:
      // re-derive subtotal/tax/total from canonical DB product prices to close a
      // client-side tampering vector (product/size/modifier prices are echoed back
      // from the client cart and are trivially editable via devtools/network
      // interception). This only applies when every line item references a real
      // catalog product by id — other sale-creation flows (appointment checkout,
      // pending-order completion, ad-hoc service/tip lines) don't carry product
      // ids in their item shape, so they keep the pre-existing behavior of
      // trusting their own already-computed totals.
      const rawItems = Array.isArray(input.items) ? (input.items as any[]) : [];
      // Pending-order completions already had prices server-verified at checkout
      // time — skip the full catalog re-fetch to avoid the ~500-800 ms round-trip.
      const fromPendingOrder = (req.body as any).fromPendingOrder === true;
      const pendingOrderId =
        typeof (req.body as any).pendingOrderId === "number"
          ? ((req.body as any).pendingOrderId as number)
          : null;
      const isCatalogCart =
        !fromPendingOrder &&
        rawItems.length > 0 &&
        rawItems.every((item) => item?.product?.id != null);

      const saleUser = req.user;
      let requestedDiscount = parseFloat(input.discount || "0");
      const requestedLoyalty = parseFloat((input as any).loyaltyDiscount || "0");

      let overrides: Partial<typeof input> = {};

      if (isCatalogCart) {
        const [catalogProducts, settings] = await Promise.all([
          storage.getProducts(uid),
          storage.getSettings(uid),
        ]);
        const productMap = new Map(catalogProducts.map((p) => [p.id, p]));
        const globalTaxRate = parseFloat(settings?.taxRate || "0");
        const isScPwd = !!input.scPwdId;

        let recomputedSubtotal = 0;
        let missingProduct = false;
        const perItem: { itemSubtotal: number; rate: number }[] = [];
        for (const item of rawItems) {
          const canonicalProduct = productMap.get(Number(item.product.id));
          if (!canonicalProduct) {
            missingProduct = true;
            break;
          }
          let unitPrice = parseFloat(canonicalProduct.price || "0");
          if (item?.size?.name) {
            const canonicalSize = (canonicalProduct.sizes || []).find(
              (s: any) => s.name === item.size.name,
            );
            if (!canonicalSize) {
              missingProduct = true;
              break;
            }
            unitPrice = parseFloat(canonicalSize.price || "0");
          }
          let modsPrice = 0;
          for (const mod of item?.modifiers ?? []) {
            const canonicalMod = (canonicalProduct.modifiers || []).find(
              (m: any) => m.name === mod.name,
            );
            if (!canonicalMod) {
              missingProduct = true;
              break;
            }
            modsPrice += parseFloat(canonicalMod.price || "0");
          }
          if (missingProduct) break;
          const quantity = Number(item?.quantity) || 0;
          const itemSubtotal = (unitPrice + modsPrice) * quantity;
          recomputedSubtotal += itemSubtotal;
          const rate =
            canonicalProduct.taxRate != null && canonicalProduct.taxRate !== ""
              ? parseFloat(canonicalProduct.taxRate)
              : globalTaxRate;
          perItem.push({ itemSubtotal, rate });
        }

        if (missingProduct) {
          return res.status(400).json({
            message: "One or more items could not be verified against the catalog. Please refresh and try again.",
          });
        }

        if (saleUser?.tenantId && saleUser.role !== "owner") {
          const perm = await getRolePermCached(saleUser.tenantId, saleUser.role);
          if (perm && perm.maxDiscountPercent != null && perm.maxDiscountPercent < 100) {
            const discountAmt = requestedDiscount + requestedLoyalty;
            if (recomputedSubtotal > 0 && (discountAmt / recomputedSubtotal) * 100 > perm.maxDiscountPercent) {
              return res
                .status(403)
                .json({
                  message: `Discount exceeds your allowed maximum of ${perm.maxDiscountPercent}%`,
                });
            }
          }
        }

        const effectiveDiscount = isScPwd
          ? recomputedSubtotal * 0.2
          : Math.min(Math.max(requestedDiscount, 0), recomputedSubtotal);
        const discountedSubtotal = Math.max(0, recomputedSubtotal - effectiveDiscount);
        const discountRatio = recomputedSubtotal > 0 ? discountedSubtotal / recomputedSubtotal : 1;
        const recomputedTax = isScPwd
          ? 0
          : perItem.reduce((acc, { itemSubtotal, rate }) => acc + itemSubtotal * discountRatio * (rate / 100), 0);
        const clampedLoyalty = Math.min(Math.max(requestedLoyalty, 0), discountedSubtotal + recomputedTax);
        const recomputedTotal = Math.max(0, discountedSubtotal + recomputedTax - clampedLoyalty);

        const round2 = (n: number) => Math.round(n * 100) / 100;

        overrides = {
          subtotal: round2(recomputedSubtotal).toFixed(2),
          tax: round2(recomputedTax).toFixed(2),
          discount: round2(effectiveDiscount).toFixed(2),
          loyaltyDiscount: round2(clampedLoyalty).toFixed(2),
          total: round2(recomputedTotal).toFixed(2),
        } as Partial<typeof input>;
      } else {
        // Non-catalog flow (appointments, pending-order completion, etc.) — keep
        // the existing permission check against the client-supplied discount.
        if (saleUser?.tenantId && saleUser.role !== "owner") {
          const perm = await getRolePermCached(saleUser.tenantId, saleUser.role);
          if (perm && perm.maxDiscountPercent != null && perm.maxDiscountPercent < 100) {
            const discountAmt = requestedDiscount + requestedLoyalty;
            const subtotalAmt = parseFloat(input.subtotal || "0");
            if (subtotalAmt > 0 && (discountAmt / subtotalAmt) * 100 > perm.maxDiscountPercent) {
              return res
                .status(403)
                .json({
                  message: `Discount exceeds your allowed maximum of ${perm.maxDiscountPercent}%`,
                });
            }
          }
        }
      }

      if (input.discountCode) {
        const dc = await storage.getDiscountCodeByCode(input.discountCode, uid);
        if (dc) {
          const incremented = await storage.incrementDiscountCodeUsage(dc.id);
          if (!incremented && dc.maxUses != null) {
            return res.status(400).json({ message: "Discount code has reached its usage limit" });
          }
        }
      }

      const enforcedBranch = await resolveBranchId(req);
      const sale = await storage.createSale(uid, {
        ...input,
        ...overrides,
        cashierId: input.cashierId ?? uid,
        branchId: enforcedBranch,
      });

      // If this sale completes a pending order, delete it inline — saves one
      // full HTTP round-trip vs. the client calling DELETE /api/pending-orders/:id
      // as a follow-up. Do it before responding so the queue is already cleared
      // by the time the client re-fetches.
      if (pendingOrderId) {
        storage.deletePendingOrder(pendingOrderId, uid).catch((e) =>
          console.error(`[sale] inline pending-order delete failed for ${pendingOrderId}:`, e),
        );
      }

      cache.del(dashboardCacheKey(uid, getActiveBranchId(req)));
      cache.delByPrefix(`sales:${uid}`);

      // Store idempotency result so a sync-queue replay returns the same sale
      if (rawIdemKey && idemTid) {
        cache.set(`idem:sale:${idemTid}:${rawIdemKey}`, sale, IDEM_TTL_MS);
      }

      // Send the response first — everything below is post-response background work.
      res.status(201).json(sale);

      // Stock deduction and audit log are fire-and-forget after the response is sent.
      runAsAdmin(pool, async () => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await storage.deductProductStockForSale(uid, input.items as any[]);
            break;
          } catch (e) {
            if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
            else console.error(`[stock] deduction failed after 3 attempts for sale ${sale.id}:`, e);
          }
        }
      }).catch((e) => console.error(`[stock] runAsAdmin failed for sale ${sale.id}:`, e));

      auditLog(req, "create", "sale", String(sale.id), {
        total: sale.total,
        itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
        paymentMethod: sale.paymentMethod,
        receiptNumber: (sale as any).receiptNumber ?? null,
        orNumber: (sale as any).orNumber ?? null,
        invoiceNumber: (sale as any).invoiceNumber ?? null,
        discountCode: sale.discountCode,
      }).catch(() => {});

      const tid = req.user?.tenantId ?? null;
      if (tid) emitTenantEvent(tid, { type: "stats-update", saleId: sale.id, total: sale.total });

      if (input.customerId) {
        runAsAdmin(pool, async () => {
          try {
            const { sendReceiptEmail } = await import("../email");
            const customer = await storage.getCustomer(Number(input.customerId), uid);
            if (customer?.email) {
              const storeSettings = await storage.getSettings(uid);
              await sendReceiptEmail(
                customer.email,
                {
                  total: sale.total,
                  subtotal: (sale as any).subtotal ?? sale.total,
                  tax: (sale as any).tax,
                  discount: sale.discount,
                  paymentMethod: sale.paymentMethod ?? "cash",
                  customerName: sale.customerName,
                  items: sale.items,
                  orNumber: (sale as any).orNumber,
                  receiptNumber: (sale as any).receiptNumber,
                  createdAt: (sale as any).createdAt ?? new Date().toISOString(),
                },
                {
                  name: (storeSettings as any)?.storeName ?? "Store",
                  currency: storeSettings?.currency ?? "₱",
                  address: (storeSettings as any)?.address,
                  phone: (storeSettings as any)?.phone,
                  receiptFooter: (storeSettings as any)?.receiptFooter,
                },
              );
            }
          } catch {}
        }).catch((e) => console.error(`[receipt] runAsAdmin failed for sale ${sale.id}:`, e));
      }
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.delete("/api/sales/:id", requireAuth, requireManagerOrAbove, async (req, res) => {
    const saleUser = req.user;
    if (saleUser?.tenantId && saleUser.role !== "owner") {
      const perm = await getRolePermissionForRole(saleUser.tenantId, saleUser.role);
      if (perm && perm.canDeleteSale === false) {
        return res.status(403).json({ message: "You don't have permission to void sales" });
      }
    }
    const voidReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : undefined;
    if (!voidReason) {
      return res.status(400).json({
        message: "A void reason is required to keep the BIR audit trail complete. Please state why this transaction is being voided.",
      });
    }
    const id = Number(req.params.id);
    const uid = getUserId(req);

    const saleTimestamp = await getSaleTimestamp(id);

    if (saleTimestamp) {
      const saleMs      = new Date(saleTimestamp).getTime();
      const closedShifts = await getClosedShiftsForUser(uid);
      const lockedByShift = closedShifts.some(
        (s) => s.openedAt && s.closedAt &&
          saleMs >= new Date(s.openedAt).getTime() && saleMs <= new Date(s.closedAt).getTime(),
      );
      if (lockedByShift) {
        return res.status(409).json({
          message:
            "This sale is locked inside a closed shift (Z-report already generated). It cannot be voided to preserve BIR audit integrity.",
        });
      }
    }

    const deleted = await storage.softDeleteSale(id, uid, uid, voidReason);
    if (!deleted) return res.status(404).json({ message: "Sale not found" });
    await auditLog(req, "void", "sale", String(id), { softDelete: true, voidReason });
    cache.del(dashboardCacheKey(uid, getActiveBranchId(req)));
    cache.delByPrefix(`sales:${uid}`);
    res.status(204).end();
  });
}
