import type { Express, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { and, eq } from "drizzle-orm";
import { tenantSubscriptions, subscriptionPayments } from "@shared/schema";
import { requireAuth, invalidateSubscriptionCache } from "./middleware";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";

const PLANS = {
  pro: {
    monthly: { amount: 49900,  label: "ArtixPOS Pro — Monthly",      description: "Single-location powerhouse. All modules, loyalty & more." },
    annual:  { amount: 499900, label: "ArtixPOS Pro — Annual",        description: "Single-location powerhouse, billed annually. Save 17%!" },
  },
  business: {
    monthly: { amount: 99900,  label: "ArtixPOS Business — Monthly",  description: "Multi-branch, BIR compliance, advanced payroll & priority support." },
    annual:  { amount: 999900, label: "ArtixPOS Business — Annual",   description: "Multi-branch, BIR compliance & advanced payroll. Save 17%!" },
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

export function registerSubscriptionRoutes(app: Express) {

app.get("/api/subscription", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.json({ plan: "free", status: "active", billingCycle: null, currentPeriodEnd: null });

      let sub = await getOrCreateSubscription(tenantId);
      if (!sub) {

        await db.insert(tenantSubscriptions).values({ tenantId, plan: "free", status: "active" } as any);
        invalidateSubscriptionCache(tenantId);
        sub = await getOrCreateSubscription(tenantId);
      }

if (sub && (sub.plan === "pro" || sub.plan === "business") && sub.currentPeriodEnd) {
        const expired = new Date(sub.currentPeriodEnd) < new Date();
        if (expired && sub.status === "active") {
          await db
            .update(tenantSubscriptions)

            .set({ plan: "free", status: "expired", billingCycle: null, currentPeriodEnd: null, updatedAt: new Date().toISOString() } as any)
            .where(eq(tenantSubscriptions.tenantId, tenantId));
          invalidateSubscriptionCache(tenantId);
          sub = await getOrCreateSubscription(tenantId);
        }
      }

      return res.json(sub);
    } catch (err: unknown) {
      console.error("[subscription] GET error:", err);
      return res.status(500).json({ message: "Failed to load subscription" });
    }
  });

app.get("/api/subscription/payments", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.json([]);

      const payments = await db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.tenantId, tenantId))
        .orderBy(subscriptionPayments.createdAt);

      return res.json(payments.reverse());
    } catch {
      return res.status(500).json({ message: "Failed to load payment history" });
    }
  });

app.post("/api/subscription/checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant found. Complete onboarding first." });

      const { billingCycle, plan: planKey = "pro" } = req.body as { billingCycle: "monthly" | "annual"; plan?: "pro" | "business" };
      if (!billingCycle || !["monthly", "annual"].includes(billingCycle)) {
        return res.status(400).json({ message: "Invalid billing cycle" });
      }
      if (!["pro", "business"].includes(planKey)) {
        return res.status(400).json({ message: "Invalid plan" });
      }

const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const recentPending = await db
        .select({
          id: subscriptionPayments.id,
          checkoutUrl: subscriptionPayments.checkoutUrl,
          paymongoCheckoutId: subscriptionPayments.paymongoCheckoutId,
          createdAt: subscriptionPayments.createdAt,
        })
        .from(subscriptionPayments)
        .where(and(
          eq(subscriptionPayments.tenantId, tenantId),
          eq(subscriptionPayments.status, "pending"),
        ))
        .limit(5);
      const activePending = recentPending.filter(
        (p) => p.createdAt && p.createdAt > staleCutoff,
      );
      if (activePending.length > 0) {
        const newest = activePending.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];

if (newest.checkoutUrl && newest.paymongoCheckoutId) {
          return res.json({ checkoutUrl: newest.checkoutUrl, checkoutId: newest.paymongoCheckoutId, reused: true });
        }
      }

      const planInfo = PLANS[planKey][billingCycle];
      const referenceNumber = `artixpos-${tenantId.slice(0, 8)}-${Date.now()}`;

      const baseUrl = process.env.APP_URL ?? "http://localhost:5000";
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
        plan: planKey,
        billingCycle,
        amount: planInfo.amount,
        status: "pending",
        paymongoCheckoutId: checkoutId,
        checkoutUrl,
      } as any);

      return res.json({ checkoutUrl, checkoutId });
    } catch (err: unknown) {
      console.error("[subscription] checkout error:", err);
      return res.status(500).json({ message: (err as Error).message ?? "Failed to create checkout session" });
    }
  });

app.post("/api/subscription/verify", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      const { checkoutId } = req.body as { checkoutId?: string };

const payments = await db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.tenantId, tenantId));

const pendingPayments = payments
        .filter((p) => p.status === "pending")
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

      let pending = pendingPayments[0] ?? null;
      if (checkoutId) {
        const ownedMatch = payments.find((p) => p.paymongoCheckoutId === checkoutId);
        if (!ownedMatch) {

          console.warn(`[subscription/verify] Tenant ${tenantId} supplied foreign checkoutId ${checkoutId} — rejected`);
          return res.status(403).json({ message: "Checkout session not found for this account." });
        }
        if (ownedMatch.status === "pending") {
          pending = ownedMatch;
        } else if (ownedMatch.status === "paid") {

          return res.json({ success: true, plan: ownedMatch.plan ?? "pro", alreadyVerified: true });
        }
      }

      if (!pending) return res.status(404).json({ message: "No pending payment found" });

const sessionId = pending.paymongoCheckoutId;
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
              plan: pending.plan ?? "pro",
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
            plan: pending.plan ?? "pro",
            billingCycle,
            status: "active",
            currentPeriodStart: now.toISOString(),
            currentPeriodEnd: periodEnd.toISOString(),
          } as any);
        }
        invalidateSubscriptionCache(tenantId);

        return res.json({ success: true, plan: pending.plan ?? "pro", periodEnd: periodEnd.toISOString() });
      }

      return res.json({ success: false, status: paymentStatus });
    } catch (err: unknown) {
      console.error("[subscription] verify error:", err);
      return res.status(500).json({ message: (err as Error).message ?? "Verification failed" });
    }
  });

app.post("/api/subscription/cancel", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      await db
        .update(tenantSubscriptions)

        .set({ cancelAtPeriodEnd: true, updatedAt: new Date().toISOString() } as any)
        .where(eq(tenantSubscriptions.tenantId, tenantId));
      invalidateSubscriptionCache(tenantId);

      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

app.post("/api/subscription/reactivate", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      await db
        .update(tenantSubscriptions)

        .set({ cancelAtPeriodEnd: false, updatedAt: new Date().toISOString() } as any)
        .where(eq(tenantSubscriptions.tenantId, tenantId));
      invalidateSubscriptionCache(tenantId);

      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to reactivate subscription" });
    }
  });
}

function verifyPayMongoSignature(rawBody: Buffer, signatureHeader: string): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {

if (process.env.NODE_ENV !== "production") {
      console.warn("[webhook/paymongo] PAYMONGO_WEBHOOK_SECRET not set — skipping signature check (dev only)");
      return true;
    }
    console.error("[webhook/paymongo] PAYMONGO_WEBHOOK_SECRET is required in production");
    return false;
  }

const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }

  const timestamp = parts["t"];

  const receivedSig = parts["li"] ?? parts["te"];
  if (!timestamp || !receivedSig) return false;

const age = Date.now() - Number(timestamp) * 1000;
  if (age > 5 * 60 * 1000) {
    console.warn(`[webhook/paymongo] Signature timestamp too old: ${age}ms`);
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(receivedSig, "utf8"));
  } catch {
    return false;
  }
}

async function activateProForTenant(tenantId: string, billingCycle: "monthly" | "annual" | "voucher") {
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === "annual") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else if (billingCycle === "voucher") {
    periodEnd.setDate(periodEnd.getDate() + 30);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const existing = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));

  if (existing[0]) {
    await db.update(tenantSubscriptions)
      .set({
        plan: "pro", billingCycle, status: "active",
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        cancelAtPeriodEnd: false,
        updatedAt: now.toISOString(),
      } as any)
      .where(eq(tenantSubscriptions.tenantId, tenantId));
  } else {
    await db.insert(tenantSubscriptions).values({
      tenantId, plan: "pro", billingCycle, status: "active",
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    } as any);
  }
  invalidateSubscriptionCache(tenantId);

  return periodEnd;
}

const RC_PRO_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "TRANSFER",
]);

const RC_REVOKE_EVENTS = new Set([
  "CANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
]);

async function activateRevenueCatPro(tenantId: string, expirationAtMs: number | null) {
  const now = new Date();
  const periodEnd = expirationAtMs
    ? new Date(expirationAtMs)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

  const existing = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId));

  if (existing[0]) {
    await db
      .update(tenantSubscriptions)
      .set({
        plan: "pro",
        billingCycle: "monthly",
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
      billingCycle: "monthly",
      status: "active",
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    } as any);
  }
  invalidateSubscriptionCache(tenantId);
}

async function revokeRevenueCatPro(tenantId: string) {
  const now = new Date();
  await db
    .update(tenantSubscriptions)
    .set({
      plan: "free",
      status: "expired",
      billingCycle: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: now.toISOString(),
    } as any)
    .where(eq(tenantSubscriptions.tenantId, tenantId));
  invalidateSubscriptionCache(tenantId);
}

export function registerRevenueCatWebhookRoutes(app: Express) {
  app.post("/api/webhooks/revenuecat", async (req: Request, res: Response) => {
    const rawBody: Buffer = req.body;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      return res.status(400).json({ message: "Empty or non-raw body" });
    }

    const secret = process.env.REVENUECAT_WEBHOOK_SECRET || process.env.REVENUECAT_SECRET_KEY;
    if (secret) {
      const auth = String(req.headers["authorization"] ?? "");
      if (auth !== secret) {
        console.warn("[webhook/revenuecat] Invalid authorization header — rejecting");
        return res.status(401).json({ message: "Unauthorized" });
      }
    } else if (process.env.NODE_ENV === "production") {
      console.error("[webhook/revenuecat] REVENUECAT_WEBHOOK_SECRET or REVENUECAT_SECRET_KEY required in production");
      return res.status(500).json({ message: "Webhook secret not configured" });
    } else {
      console.warn("[webhook/revenuecat] No webhook secret set — skipping auth check (dev only)");
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Invalid JSON body" });
    }

    const event = payload?.event;
    const eventType: string = event?.type ?? "";
    const tenantId: string = event?.app_user_id ?? "";
    const expirationAtMs: number | null = event?.expiration_at_ms ?? null;
    const productId: string = event?.product_id ?? "";

    console.log(`[webhook/revenuecat] Event: ${eventType} | tenant: ${tenantId} | product: ${productId}`);

    if (!tenantId) {
      console.warn("[webhook/revenuecat] No app_user_id in event payload");
      return res.status(422).json({ message: "Missing app_user_id" });
    }

    try {
      if (RC_PRO_EVENTS.has(eventType)) {
        await activateRevenueCatPro(tenantId, expirationAtMs);
        console.log(`[webhook/revenuecat] Activated Pro for tenant ${tenantId} until ${expirationAtMs ? new Date(expirationAtMs).toISOString() : "unknown"}`);
      } else if (RC_REVOKE_EVENTS.has(eventType)) {
        await revokeRevenueCatPro(tenantId);
        console.log(`[webhook/revenuecat] Revoked Pro for tenant ${tenantId}`);
      } else {
        console.log(`[webhook/revenuecat] Unhandled event type: ${eventType} — acknowledged`);
      }
      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[webhook/revenuecat] DB error:", err?.message);
      return res.status(500).json({ message: "Internal error processing webhook" });
    }
  });
}

export function registerPaymentWebhookRoutes(app: Express) {

app.post("/api/webhooks/paymongo", async (req: Request, res: Response) => {

const rawBody: Buffer = req.body;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      return res.status(400).json({ message: "Empty or non-raw body" });
    }

    const sigHeader = String(req.headers["x-paymongo-signature"] ?? "");
    if (!verifyPayMongoSignature(rawBody, sigHeader)) {
      console.warn("[webhook/paymongo] Invalid signature — rejecting");
      return res.status(401).json({ message: "Invalid signature" });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Invalid JSON body" });
    }

    const eventType: string = event?.data?.attributes?.type ?? "";
    console.log(`[webhook/paymongo] Received event: ${eventType}`);

    if (eventType === "checkout_session.payment.paid") {
      try {
        const checkoutId: string = event?.data?.attributes?.data?.id ?? "";
        if (!checkoutId) {
          console.error("[webhook/paymongo] No checkout session ID in event payload");
          return res.status(422).json({ message: "Missing checkout session ID" });
        }

const [claimed] = await db
          .update(subscriptionPayments)
          .set({ status: "paid", paidAt: new Date().toISOString() } as any)
          .where(and(
            eq(subscriptionPayments.paymongoCheckoutId, checkoutId),
            eq(subscriptionPayments.status, "pending"),
          ))
          .returning();

        if (!claimed) {

          const [existing] = await db
            .select({ status: subscriptionPayments.status })
            .from(subscriptionPayments)
            .where(eq(subscriptionPayments.paymongoCheckoutId, checkoutId))
            .limit(1);
          if (!existing) {
            console.warn(`[webhook/paymongo] No payment record for checkoutId ${checkoutId} — ignoring`);
            return res.status(200).json({ received: true, note: "No matching payment record" });
          }
          console.log(`[webhook/paymongo] Payment ${checkoutId} already processed (status: ${existing.status}) — skipping`);
          return res.status(200).json({ received: true, note: "Already processed" });
        }

        const tenantId = claimed.tenantId!;
        const billingCycle = (claimed.billingCycle as "monthly" | "annual") ?? "monthly";

let periodEnd: Date;
        try {
          periodEnd = await activateProForTenant(tenantId, billingCycle);
        } catch (activateErr) {
          console.error("[webhook/paymongo] activateProForTenant failed — reverting payment to pending for retry:", activateErr);
          await db
            .update(subscriptionPayments)
            .set({ status: "pending", paidAt: null } as any)
            .where(and(
              eq(subscriptionPayments.paymongoCheckoutId, checkoutId),
              eq(subscriptionPayments.status, "paid"),
            ));
          return res.status(500).json({ message: "Subscription activation failed — will retry" });
        }

        console.log(`[webhook/paymongo] ✓ Tenant ${tenantId} upgraded to Pro until ${periodEnd.toISOString()}`);
        return res.status(200).json({ received: true, tenantId, plan: "pro", periodEnd: periodEnd.toISOString() });

      } catch (err) {
        console.error("[webhook/paymongo] Error processing checkout_session.payment.paid:", err);

        return res.status(500).json({ message: "Internal error processing payment" });
      }
    }

return res.status(200).json({ received: true, note: `Unhandled event type: ${eventType}` });
  });
}
