

import type { Express } from "express";
import type { Server } from "http";
import { rateLimit } from "express-rate-limit";
import { registerAdminRoutes } from "./admin-routes";
import { registerSubscriptionRoutes, registerPaymentWebhookRoutes, registerRevenueCatWebhookRoutes } from "./subscription-routes";
import { registerPayrollRoutes } from "./payroll-routes";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { branches as branchesTable, tenants } from "@shared/schema";

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
import { registerSeoRoutes } from "./routes/seo";
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
import { registerInventoryAdvancedRoutes } from "./routes/inventory-advanced";
import { registerPushRoutes } from "./routes/push";
import { registerStaffPinRoutes } from "./routes/staff-pin";
import { registerScheduleRoutes } from "./routes/schedules";
import { registerClientErrorRoutes } from "./client-errors";

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

if (process.env.NODE_ENV !== "production") {
    app.get("/api/dev/email-preview/:type", async (req, res) => {
      const {
        buildVerificationEmailHtml,
        buildPasswordResetEmailHtml,
        buildReceiptEmailHtml,
      } = await import("./email");
      const type = req.params.type;

      let html = "";
      if (type === "verify") {
        html = buildVerificationEmailHtml("https://artixpos.com/verify-email?token=abc123preview");
      } else if (type === "reset") {
        html = buildPasswordResetEmailHtml("https://artixpos.com/reset-password?token=abc123preview");
      } else if (type === "receipt") {
        html = buildReceiptEmailHtml(
          {
            total: "485.00",
            subtotal: "433.93",
            tax: "51.07",
            discount: "50.00",
            paymentMethod: "GCash",
            customerName: "Maria Santos",
            orNumber: "2024-00142",
            createdAt: new Date().toISOString(),
            items: [
              { product: { name: "Caramel Macchiato", price: "175.00" }, size: { name: "Large", price: "195.00" }, quantity: 1, modifiers: [{ name: "Extra Shot", price: "30.00" }] },
              { product: { name: "Cheesecake Slice", price: "165.00" }, quantity: 1, modifiers: [] },
              { product: { name: "Mineral Water", price: "45.00" }, quantity: 3, modifiers: [] },
            ],
          },
          {
            name: "Bean & Brew Café",
            currency: "₱",
            address: "123 Ayala Ave, Makati City",
            phone: "+63 917 555 1234",
            receiptFooter: "Thank you for visiting! See you again soon ☕",
          }
        );
      } else {
        return res.status(404).send("Unknown type. Use: verify | reset | receipt");
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    });

app.post("/api/dev/email-send", async (req, res) => {
      const { to, type } = req.body ?? {};
      if (!to || !type) return res.status(400).json({ ok: false, message: "body must contain { to, type }" });

      const { sendVerificationEmail, sendPasswordResetEmail, sendReceiptEmail, resetTransporter } = await import("./email");
      resetTransporter();

      let ok = false;
      if (type === "verify") {
        ok = await sendVerificationEmail(to, "https://artixpos.com/verify-email?token=TEST_TOKEN_PREVIEW");
      } else if (type === "reset") {
        ok = await sendPasswordResetEmail(to, "https://artixpos.com/reset-password?token=TEST_TOKEN_PREVIEW");
      } else if (type === "receipt") {
        ok = await sendReceiptEmail(to, {
          total: "485.00", subtotal: "433.93", tax: "51.07", discount: "50.00",
          paymentMethod: "GCash", customerName: "Maria Santos",
          orNumber: "2024-00142", createdAt: new Date().toISOString(),
          items: [
            { product: { name: "Caramel Macchiato", price: "175.00" }, size: { name: "Large", price: "195.00" }, quantity: 1, modifiers: [{ name: "Extra Shot", price: "30.00" }] },
            { product: { name: "Cheesecake Slice", price: "165.00" }, quantity: 1, modifiers: [] },
            { product: { name: "Mineral Water", price: "45.00" }, quantity: 3, modifiers: [] },
          ],
        }, { name: "Bean & Brew Café", currency: "₱", address: "123 Ayala Ave, Makati City", phone: "+63 917 555 1234", receiptFooter: "Thank you for visiting!" });
      } else {
        return res.status(400).json({ ok: false, message: "type must be: verify | reset | receipt" });
      }

      if (!ok) {
        return res.status(500).json({ ok: false, message: "Send failed — check server logs. SMTP credentials may be missing or wrong." });
      }
      res.json({ ok: true, message: `${type} email sent to ${to}` });
    });
  }

registerAdminRoutes(app);
  registerSubscriptionRoutes(app);
  registerPaymentWebhookRoutes(app);
  registerRevenueCatWebhookRoutes(app);
  registerPayrollRoutes(app);

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
  registerSeoRoutes(app);
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
  registerInventoryAdvancedRoutes(app);
  registerPushRoutes(app);
  registerStaffPinRoutes(app);
  registerScheduleRoutes(app);
  registerClientErrorRoutes(app);

  return httpServer;
}
