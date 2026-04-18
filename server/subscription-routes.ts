import type { Express, Request, Response } from "express";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { tenantSubscriptions, subscriptionPayments } from "@shared/schema";
import { requireAuth } from "./middleware";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";

const PLANS = {
  pro: {
    monthly: { amount: 3000, label: "ArtixPOS Pro — Monthly", description: "Full access to all features, billed monthly." },
    annual:  { amount: 499900, label: "ArtixPOS Pro — Annual",  description: "Full access to all features, billed annually. Save ~30%!" },
  },
};

function getSecretKey() {
  return process.env.PAYMONGO_SECRET_KEY ?? process.env.PAYMONGO_LIVE_SECRET_KEY ?? "";
}

function pmAuth() {
  return "Basic " + Buffer.from(getSecretKey() + ":").toString("base64");
}

async function createCheckoutSession(opts: {
  amount: number;
  description: string;
  label: string;
  successUrl: string;
  cancelUrl: string;
  referenceNumber: string;
}) {
  const body = {
    data: {
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        line_items: [
          {
            currency: "PHP",
            amount: opts.amount,
            name: opts.label,
            description: opts.description,
            quantity: 1,
          },
        ],
        payment_method_types: ["card", "gcash", "grab_pay", "paymaya"],
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        reference_number: opts.referenceNumber,
        description: opts.description,
      },
    },
  };

  const res = await fetch(`${PAYMONGO_BASE}/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: pmAuth(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayMongo error: ${err}`);
  }

  return res.json() as Promise<any>;
}

async function retrieveCheckoutSession(id: string) {
  const res = await fetch(`${PAYMONGO_BASE}/checkout_sessions/${id}`, {
    headers: { Authorization: pmAuth() },
  });
  if (!res.ok) throw new Error(`PayMongo retrieve error: ${await res.text()}`);
  return res.json() as Promise<any>;
}

async function getOrCreateSubscription(tenantId: string) {
  const rows = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId));
  return rows[0] ?? null;
}

function getVoucherDurationDays(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const rawCodes = [
    process.env.PRO_VOUCHER_CODE,
    process.env.PRO_VOUCHER_CODES,
  ].filter(Boolean).join(",");

  const entries = rawCodes
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const [rawCode, rawDays] = entry.split(":").map((part) => part.trim());
    if (rawCode?.toUpperCase() === normalized) {
      const days = Number(rawDays || 30);
      return Number.isFinite(days) && days > 0 ? days : 30;
    }
  }

  return null;
}

export function registerSubscriptionRoutes(app: Express) {

  // GET /api/subscription — current subscription for authenticated tenant
  app.get("/api/subscription", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.json({ plan: "free", status: "active", billingCycle: null, currentPeriodEnd: null });

      let sub = await getOrCreateSubscription(tenantId);
      if (!sub) {
        await db.insert(tenantSubscriptions).values({ tenantId, plan: "free", status: "active" } as any);
        sub = await getOrCreateSubscription(tenantId);
      }

      // auto-expire if period ended
      if (sub && sub.plan === "pro" && sub.currentPeriodEnd) {
        const expired = new Date(sub.currentPeriodEnd) < new Date();
        if (expired && sub.status === "active") {
          await db
            .update(tenantSubscriptions)
            .set({ plan: "free", status: "expired", billingCycle: null, currentPeriodEnd: null, updatedAt: new Date().toISOString() } as any)
            .where(eq(tenantSubscriptions.tenantId, tenantId));
          sub = await getOrCreateSubscription(tenantId);
        }
      }

      return res.json(sub);
    } catch (err: any) {
      console.error("[subscription] GET error:", err);
      return res.status(500).json({ message: "Failed to load subscription" });
    }
  });

  // GET /api/subscription/payments — payment history
  app.get("/api/subscription/payments", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.json([]);

      const payments = await db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.tenantId, tenantId))
        .orderBy(subscriptionPayments.createdAt);

      return res.json(payments.reverse());
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load payment history" });
    }
  });

  // POST /api/subscription/checkout — create a PayMongo checkout session
  app.post("/api/subscription/checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant found. Complete onboarding first." });

      const { billingCycle } = req.body as { billingCycle: "monthly" | "annual" };
      if (!billingCycle || !["monthly", "annual"].includes(billingCycle)) {
        return res.status(400).json({ message: "Invalid billing cycle" });
      }

      const planInfo = PLANS.pro[billingCycle];
      const referenceNumber = `artixpos-${tenantId.slice(0, 8)}-${Date.now()}`;

      const baseUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost:5000"}`;
      const successUrl = `${baseUrl}/billing?status=success&ref=${referenceNumber}`;
      const cancelUrl  = `${baseUrl}/billing?status=cancel`;

      const session = await createCheckoutSession({
        amount: planInfo.amount,
        label: planInfo.label,
        description: planInfo.description,
        successUrl,
        cancelUrl,
        referenceNumber,
      });

      const checkoutId  = session.data.id;
      const checkoutUrl = session.data.attributes.checkout_url;

      await db.insert(subscriptionPayments).values({
        tenantId,
        plan: "pro",
        billingCycle,
        amount: planInfo.amount,
        status: "pending",
        paymongoCheckoutId: checkoutId,
        checkoutUrl,
      } as any);

      return res.json({ checkoutUrl, checkoutId });
    } catch (err: any) {
      console.error("[subscription] checkout error:", err);
      return res.status(500).json({ message: err.message ?? "Failed to create checkout session" });
    }
  });

  // POST /api/subscription/verify — verify payment after return from PayMongo
  app.post("/api/subscription/verify", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      const { checkoutId } = req.body as { checkoutId?: string };

      // Find the most recent pending payment for this tenant
      const payments = await db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.tenantId, tenantId));

      const pending = payments
        .filter((p) => p.status === "pending")
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];

      if (!pending) return res.status(404).json({ message: "No pending payment found" });

      const sessionId = checkoutId ?? pending.paymongoCheckoutId;
      if (!sessionId) return res.status(400).json({ message: "No checkout session ID" });

      const session = await retrieveCheckoutSession(sessionId);
      const attrs = session.data.attributes;
      const paymentStatus: string = attrs.payment_intent?.attributes?.status ?? attrs.status ?? "";

      const isPaid = paymentStatus === "succeeded" || attrs.payments?.some((p: any) => p.attributes?.status === "paid");

      if (isPaid) {
        const billingCycle = pending.billingCycle as "monthly" | "annual";
        const now = new Date();
        const periodEnd = new Date(now);
        if (billingCycle === "monthly") {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        await db
          .update(subscriptionPayments)
          .set({ status: "paid", paidAt: now.toISOString() } as any)
          .where(eq(subscriptionPayments.id, pending.id));

        const existing = await getOrCreateSubscription(tenantId);
        if (existing) {
          await db
            .update(tenantSubscriptions)
            .set({
              plan: "pro",
              billingCycle,
              status: "active",
              currentPeriodStart: now.toISOString(),
              currentPeriodEnd: periodEnd.toISOString(),
              cancelAtPeriodEnd: false,
              updatedAt: now.toISOString(),
            } as any)
            .where(eq(tenantSubscriptions.tenantId, tenantId));
        } else {
          await db.insert(tenantSubscriptions).values({
            tenantId,
            plan: "pro",
            billingCycle,
            status: "active",
            currentPeriodStart: now.toISOString(),
            currentPeriodEnd: periodEnd.toISOString(),
          } as any);
        }

        return res.json({ success: true, plan: "pro", periodEnd: periodEnd.toISOString() });
      }

      return res.json({ success: false, status: paymentStatus });
    } catch (err: any) {
      console.error("[subscription] verify error:", err);
      return res.status(500).json({ message: err.message ?? "Verification failed" });
    }
  });

  // POST /api/subscription/redeem-voucher — activate Pro from a configured voucher code
  app.post("/api/subscription/redeem-voucher", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant found. Complete onboarding first." });

      const code = String((req.body as any)?.code || "").trim();
      const durationDays = getVoucherDurationDays(code);
      if (!durationDays) {
        return res.status(400).json({ message: "That voucher code is not valid or has not been enabled yet." });
      }

      const now = new Date();
      const existing = await getOrCreateSubscription(tenantId);
      const currentEnd = existing?.currentPeriodEnd ? new Date(existing.currentPeriodEnd) : null;
      const startFrom = currentEnd && currentEnd > now ? currentEnd : now;
      const periodEnd = new Date(startFrom);
      periodEnd.setDate(periodEnd.getDate() + durationDays);

      await db.insert(subscriptionPayments).values({
        tenantId,
        plan: "pro",
        billingCycle: "voucher",
        amount: 0,
        status: "paid",
        paymongoCheckoutId: `voucher-${code.toUpperCase()}`,
        paidAt: now.toISOString(),
      } as any);

      if (existing) {
        await db
          .update(tenantSubscriptions)
          .set({
            plan: "pro",
            billingCycle: "voucher",
            status: "active",
            currentPeriodStart: now.toISOString(),
            currentPeriodEnd: periodEnd.toISOString(),
            cancelAtPeriodEnd: false,
            updatedAt: now.toISOString(),
          } as any)
          .where(eq(tenantSubscriptions.tenantId, tenantId));
      } else {
        await db.insert(tenantSubscriptions).values({
          tenantId,
          plan: "pro",
          billingCycle: "voucher",
          status: "active",
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
        } as any);
      }

      return res.json({ success: true, plan: "pro", periodEnd: periodEnd.toISOString() });
    } catch (err: any) {
      console.error("[subscription] voucher error:", err);
      return res.status(500).json({ message: "Failed to apply voucher code" });
    }
  });

  // POST /api/subscription/cancel — cancel at period end
  app.post("/api/subscription/cancel", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      await db
        .update(tenantSubscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date().toISOString() } as any)
        .where(eq(tenantSubscriptions.tenantId, tenantId));

      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // POST /api/subscription/reactivate — undo cancel
  app.post("/api/subscription/reactivate", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      await db
        .update(tenantSubscriptions)
        .set({ cancelAtPeriodEnd: false, updatedAt: new Date().toISOString() } as any)
        .where(eq(tenantSubscriptions.tenantId, tenantId));

      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to reactivate subscription" });
    }
  });
}
