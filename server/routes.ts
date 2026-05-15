/**
 * Route registration — thin orchestrator.
 *
 * Each domain is handled by its own file under server/routes/.
 * This file's only job is to:
 *   1. Call the existing special-purpose route registrars (admin, AI, subscription, payroll).
 *   2. Register the public branch-profile endpoint (no auth, rate-limited).
 *   3. Delegate every other domain to its dedicated registerXxxRoutes() function.
 *
 * Adding a new domain:
 *   a. Create server/routes/<domain>.ts and export registerXxxRoutes(app).
 *   b. Import + call it below — that's all.
 */
import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { rateLimit } from "express-rate-limit";
import { registerAdminRoutes } from "./admin-routes";
import { registerAiRoutes } from "./ai-routes";
import { registerSubscriptionRoutes } from "./subscription-routes";
import { registerPayrollRoutes } from "./payroll-routes";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { branches as branchesTable, tenants } from "@shared/schema";

// ── Domain route registrars ────────────────────────────────────────────────
import { registerProductRoutes } from "./routes/products";
import { registerPendingOrderRoutes } from "./routes/pending-orders";
import { registerSaleRoutes } from "./routes/sales";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerSettingsRoutes } from "./routes/settings";
import { registerCustomerRoutes } from "./routes/customers";
import { registerExpenseRoutes } from "./routes/expenses";
import { registerShiftRoutes } from "./routes/shifts";
import { registerBirRoutes } from "./routes/bir";
import { registerDiscountCodeRoutes } from "./routes/discount-codes";
import { registerRefundRoutes } from "./routes/refunds";
import { registerTableRoutes } from "./routes/tables";
import { registerSupplierRoutes, registerPurchaseOrderRoutes } from "./routes/suppliers";
import { registerTimeLogRoutes } from "./routes/time-logs";
import { registerLoyaltyRoutes } from "./routes/loyalty";
import { registerSseRoutes } from "./routes/sse";
import { registerServiceStaffRoutes, registerServiceRoomRoutes } from "./routes/service-staff";
import { registerAppointmentRoutes } from "./routes/appointments";
import { registerMembershipRoutes } from "./routes/memberships";
import { registerIngredientRoutes, registerRecipeRoutes, registerWifiVoucherRoutes } from "./routes/ingredients";

// Public-profile rate limiter — prevents enumeration of all branch IDs
const publicBranchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Third-party / special-purpose route registrars ─────────────────────────
  registerAdminRoutes(app);
  registerAiRoutes(app);
  registerSubscriptionRoutes(app);
  registerPayrollRoutes(app);

  // ── Public branch profile (no auth) ───────────────────────────────────────
  app.get("/api/public/branch/:id", publicBranchLimiter, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid branch id" });
      const [row] = await db
        .select({
          id: branchesTable.id,
          name: branchesTable.name,
          address: branchesTable.address,
          phone: branchesTable.phone,
          email: (branchesTable as any).email,
          website: (branchesTable as any).website,
          description: (branchesTable as any).description,
          color: (branchesTable as any).color,
          timezone: (branchesTable as any).timezone,
          openingHours: (branchesTable as any).openingHours,
          businessType: branchesTable.businessType,
          businessSubType: branchesTable.businessSubType,
          isActive: branchesTable.isActive,
          tenantName: tenants.name,
        })
        .from(branchesTable)
        .leftJoin(tenants, eq(tenants.id, branchesTable.tenantId))
        .where(and(eq(branchesTable.id, id), eq(branchesTable.isActive, true)));
      if (!row) return res.status(404).json({ message: "Branch not found" });
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── Domain routes ──────────────────────────────────────────────────────────
  registerProductRoutes(app);
  registerPendingOrderRoutes(app);
  registerSaleRoutes(app);
  registerDashboardRoutes(app);
  registerNotificationRoutes(app);
  registerSettingsRoutes(app);
  registerCustomerRoutes(app);
  registerExpenseRoutes(app);
  registerShiftRoutes(app);
  registerBirRoutes(app);
  registerDiscountCodeRoutes(app);
  registerRefundRoutes(app);
  registerTableRoutes(app);
  registerSupplierRoutes(app);
  registerPurchaseOrderRoutes(app);
  registerTimeLogRoutes(app);
  registerLoyaltyRoutes(app);
  registerSseRoutes(app);
  registerServiceStaffRoutes(app);
  registerServiceRoomRoutes(app);
  registerAppointmentRoutes(app);
  registerMembershipRoutes(app);
  registerIngredientRoutes(app);
  registerRecipeRoutes(app);
  registerWifiVoucherRoutes(app);

  return httpServer;
}
