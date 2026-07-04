import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { emit as emitTenantEvent } from "../events";
import { getRolePermissionForRole } from "../admin-storage";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { sales as salesTable, shifts as shiftsTable } from "@shared/schema";
import { cache, dashboardCacheKey, salesCacheKey } from "../cache";
import {
  getUserId,
  getActiveBranchId,
  resolveBranchId,
  auditLog,
  isValidDate,
  handleZodError,
} from "../lib/route-utils";

export function registerSaleRoutes(app: Express): void {
  app.get(api.sales.list.path, requireAuth, async (req, res) => {
    const { limit, offset, before, startDate, endDate, includeVoided, status } =
      req.query as Record<string, string>;
    if (startDate && !isValidDate(startDate))
      return res.status(400).json({ message: "Invalid startDate format" });
    if (endDate && !isValidDate(endDate))
      return res.status(400).json({ message: "Invalid endDate format" });
    const uid = getUserId(req);
    const bid = getActiveBranchId(req);

    // B-pattern: ?status=void is an alias for ?includeVoided=1
    const showVoided = includeVoided === "1" || status === "void";
    const beforeIdRaw = Number(before);
    const beforeId = before && Number.isFinite(beforeIdRaw) ? beforeIdRaw : undefined;
    const pageLimit = Math.min(Number(limit) || 200, 1000);

    const tag = `${pageLimit}:${beforeId ?? ""}:${offset || ""}:${startDate || ""}:${endDate || ""}:${showVoided ? "1" : "0"}`;
    const ck = salesCacheKey(uid, bid, tag);
    const salesList = await cache.getOrFetch(
      ck,
      () =>
        storage.getSales(uid, {
          branchId: bid ?? undefined,
          limit: pageLimit,
          beforeId: beforeId,
          offset: beforeId == null ? Math.max(Number(offset) || 0, 0) : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          includeVoided: showVoided,
        }),
      15_000,
    );

    if (salesList.length > 0) {
      const minId = salesList[salesList.length - 1].id;
      res.setHeader("X-Next-Cursor", String(minId));
    }
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

      // Never trust client-computed money fields: re-derive subtotal/tax/total
      // from canonical DB product prices to close a client-side tampering vector
      // (product/size/modifier prices are echoed back from the client cart and
      // are trivially editable via devtools/network interception).
      const rawItems = Array.isArray(input.items) ? (input.items as any[]) : [];
      const catalogProducts = await storage.getProducts(uid);
      const productMap = new Map(catalogProducts.map((p) => [p.id, p]));
      const settings = await storage.getSettings(uid);
      const globalTaxRate = parseFloat(settings?.taxRate || "0");

      const isScPwd = !!input.scPwdId;

      let recomputedSubtotal = 0;
      let missingProduct = false;
      const perItem: { itemSubtotal: number; rate: number }[] = [];
      for (const item of rawItems) {
        const productId = item?.product?.id;
        const canonicalProduct = productId != null ? productMap.get(Number(productId)) : undefined;
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

      if (missingProduct || rawItems.length === 0) {
        return res.status(400).json({
          message: "One or more items could not be verified against the catalog. Please refresh and try again.",
        });
      }

      const saleUser = req.user;
      let requestedDiscount = parseFloat(input.discount || "0");
      const requestedLoyalty = parseFloat((input as any).loyaltyDiscount || "0");
      if (saleUser?.tenantId && saleUser.role !== "owner") {
        const perm = await getRolePermissionForRole(saleUser.tenantId, saleUser.role);
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

      if (input.discountCode) {
        const dc = await storage.getDiscountCodeByCode(input.discountCode, uid);
        if (dc) {
          const incremented = await storage.incrementDiscountCodeUsage(dc.id);
          if (!incremented && dc.maxUses != null) {
            return res.status(400).json({ message: "Discount code has reached its usage limit" });
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

      const enforcedBranch = await resolveBranchId(req);
      const sale = await storage.createSale(uid, {
        ...input,
        subtotal: round2(recomputedSubtotal).toFixed(2),
        tax: round2(recomputedTax).toFixed(2),
        discount: round2(effectiveDiscount).toFixed(2),
        loyaltyDiscount: round2(clampedLoyalty).toFixed(2),
        total: round2(recomputedTotal).toFixed(2),
        cashierId: input.cashierId ?? uid,
        branchId: enforcedBranch,
      });

      (async () => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await storage.deductProductStockForSale(uid, input.items as any[]);
            break;
          } catch (e) {
            if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
            else console.error(`[stock] deduction failed after 3 attempts for sale ${sale.id}:`, e);
          }
        }
      })();

      await auditLog(req, "create", "sale", String(sale.id), {
        total: sale.total,
        itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
        paymentMethod: sale.paymentMethod,
        receiptNumber: (sale as any).receiptNumber ?? null,
        orNumber: (sale as any).orNumber ?? null,
        invoiceNumber: (sale as any).invoiceNumber ?? null,
        discountCode: sale.discountCode,
      });

      cache.del(dashboardCacheKey(uid, getActiveBranchId(req)));
      cache.delByPrefix(`sales:${uid}`);
      res.status(201).json(sale);

      const tid = req.user?.tenantId ?? null;
      if (tid) emitTenantEvent(tid, { type: "stats-update", saleId: sale.id, total: sale.total });

      if (input.customerId) {
        setImmediate(async () => {
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
        });
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

    const [saleRow] = await db
      .select({ id: salesTable.id, createdAt: salesTable.createdAt })
      .from(salesTable)
      .where(eq(salesTable.id, id));

    if (saleRow?.createdAt) {
      const closedShifts = await db
        .select({ openedAt: shiftsTable.openedAt, closedAt: shiftsTable.closedAt })
        .from(shiftsTable)
        .where(and(eq(shiftsTable.userId, uid), eq(shiftsTable.status, "closed")));

      const saleTime = saleRow.createdAt;
      const lockedByShift = closedShifts.some(
        (s) => s.openedAt && s.closedAt && saleTime >= s.openedAt && saleTime <= s.closedAt,
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
