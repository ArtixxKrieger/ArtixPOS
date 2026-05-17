import type { Express, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
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
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.json({ plan: "free", status: "active", billingCycle: null, currentPeriodEnd: null });

      let sub = await getOrCreateSubscription(tenantId);
      if (!sub) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(tenantSubscriptions).values({ tenantId, plan: "free", status: "active" } as any);
        sub = await getOrCreateSubscription(tenantId);
      }

      // auto-expire if period ended
      if (sub && sub.plan === "pro" && sub.currentPeriodEnd) {
        const expired = new Date(sub.currentPeriodEnd) < new Date();
        if (expired && sub.status === "active") {
          await db
            .update(tenantSubscriptions)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set({ plan: "free", status: "expired", billingCycle: null, currentPeriodEnd: null, updatedAt: new Date().toISOString() } as any)
            .where(eq(tenantSubscriptions.tenantId, tenantId));
          sub = await getOrCreateSubscription(tenantId);
        }
      }

      return res.json(sub);
    } catch (err: unknown) {
      console.error("[subscription] GET error:", err);
      return res.status(500).json({ message: "Failed to load subscription" });
    }
  });

  // GET /api/subscription/payments — payment history
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

  // POST /api/subscription/checkout — create a PayMongo checkout session
  app.post("/api/subscription/checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    } catch (err: unknown) {
      console.error("[subscription] checkout error:", err);
      return res.status(500).json({ message: (err as Error).message ?? "Failed to create checkout session" });
    }
  });

  // POST /api/subscription/verify — verify payment after return from PayMongo
  app.post("/api/subscription/verify", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      const { checkoutId } = req.body as { checkoutId?: string };

      // Fetch ALL payments for this tenant so we can cross-reference the
      // client-supplied checkoutId against records we own — this prevents
      // cross-tenant payment theft where an attacker supplies another
      // tenant's paid checkout session ID to upgrade their own account.
      const payments = await db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.tenantId, tenantId));

      // If client supplies a checkoutId it MUST match a record owned by this
      // tenant; otherwise it is silently ignored and we fall back to the most
      // recent pending record. We NEVER call PayMongo with an id the client
      // provides that we cannot confirm belongs to this tenant.
      const pendingPayments = payments
        .filter((p) => p.status === "pending")
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

      let pending = pendingPayments[0] ?? null;
      if (checkoutId) {
        const ownedMatch = payments.find((p) => p.paymongoCheckoutId === checkoutId);
        if (!ownedMatch) {
          // Client provided a checkout ID that does not belong to this tenant
          console.warn(`[subscription/verify] Tenant ${tenantId} supplied foreign checkoutId ${checkoutId} — rejected`);
          return res.status(403).json({ message: "Checkout session not found for this account." });
        }
        if (ownedMatch.status === "pending") {
          pending = ownedMatch;
        } else if (ownedMatch.status === "paid") {
          // Already verified — idempotent success response
          return res.json({ success: true, plan: "pro", alreadyVerified: true });
        }
      }

      if (!pending) return res.status(404).json({ message: "No pending payment found" });

      // Always use the checkout session ID from the DB record — never the raw client input
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({ status: "paid", paidAt: now.toISOString() } as any)
          .where(eq(subscriptionPayments.id, pending.id));

        const existing = await getOrCreateSubscription(tenantId);
        if (existing) {
          await db
            .update(tenantSubscriptions)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    } catch (err: unknown) {
      console.error("[subscription] verify error:", err);
      return res.status(500).json({ message: (err as Error).message ?? "Verification failed" });
    }
  });

  // POST /api/subscription/redeem-voucher — activate Pro from a configured voucher code
  app.post("/api/subscription/redeem-voucher", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    } catch (err: unknown) {
      console.error("[subscription] voucher error:", err);
      return res.status(500).json({ message: "Failed to apply voucher code" });
    }
  });

  // POST /api/subscription/cancel — cancel at period end
  app.post("/api/subscription/cancel", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      await db
        .update(tenantSubscriptions)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date().toISOString() } as any)
        .where(eq(tenantSubscriptions.tenantId, tenantId));

      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // POST /api/subscription/reactivate — undo cancel
  app.post("/api/subscription/reactivate", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const tenantId = user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant" });

      await db
        .update(tenantSubscriptions)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ cancelAtPeriodEnd: false, updatedAt: new Date().toISOString() } as any)
        .where(eq(tenantSubscriptions.tenantId, tenantId));

      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to reactivate subscription" });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PayMongo Webhook
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/paymongo
//
// PayMongo calls this endpoint server-to-server whenever a payment event
// occurs. This is the authoritative upgrade path — it fires even if the user
// closes the browser before being redirected back to the app.
//
// Setup (one-time in your PayMongo dashboard):
//   URL:    https://<your-domain>/api/webhooks/paymongo
//   Events: checkout_session.payment.paid
//   Then copy the webhook secret into PAYMONGO_WEBHOOK_SECRET.
//
// Signature verification (PayMongo docs):
//   Header: x-paymongo-signature
//   Format: t=<timestamp>,te=<test_sig>,li=<live_sig>
//   Signed payload: "<timestamp>.<raw_body_string>"
//   Algorithm: HMAC-SHA256(signed_payload, webhook_secret) → hex
// ─────────────────────────────────────────────────────────────────────────────

function verifyPayMongoSignature(rawBody: Buffer, signatureHeader: string): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — skip verification only in development so the
    // webhook can be tested locally without a real secret.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[webhook/paymongo] PAYMONGO_WEBHOOK_SECRET not set — skipping signature check (dev only)");
      return true;
    }
    console.error("[webhook/paymongo] PAYMONGO_WEBHOOK_SECRET is required in production");
    return false;
  }

  // Parse t=...,te=...,li=... header
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }

  const timestamp = parts["t"];
  // PayMongo sends either li (live) or te (test) depending on key mode
  const receivedSig = parts["li"] ?? parts["te"];
  if (!timestamp || !receivedSig) return false;

  // Reject payloads older than 5 minutes to prevent replay attacks
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

  return periodEnd;
}

export function registerPaymentWebhookRoutes(app: Express) {

  // PayMongo calls this after every successful payment — no auth cookie/token
  // needed, but the HMAC signature on the raw body must be valid.
  app.post("/api/webhooks/paymongo", async (req: Request, res: Response) => {
    // req.body is a raw Buffer here because of the express.raw() middleware
    // mounted on /api/webhooks in index.ts — before express.json() runs.
    const rawBody: Buffer = req.body;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      return res.status(400).json({ message: "Empty or non-raw body" });
    }

    // ── 1. Verify signature ─────────────────────────────────────────────────
    const sigHeader = String(req.headers["x-paymongo-signature"] ?? "");
    if (!verifyPayMongoSignature(rawBody, sigHeader)) {
      console.warn("[webhook/paymongo] Invalid signature — rejecting");
      return res.status(401).json({ message: "Invalid signature" });
    }

    // ── 2. Parse event ──────────────────────────────────────────────────────
    let event: any;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Invalid JSON body" });
    }

    const eventType: string = event?.data?.attributes?.type ?? "";
    console.log(`[webhook/paymongo] Received event: ${eventType}`);

    // ── 3. Handle checkout_session.payment.paid ─────────────────────────────
    if (eventType === "checkout_session.payment.paid") {
      try {
        const checkoutId: string = event?.data?.attributes?.data?.id ?? "";
        if (!checkoutId) {
          console.error("[webhook/paymongo] No checkout session ID in event payload");
          return res.status(422).json({ message: "Missing checkout session ID" });
        }

        // Look up which tenant owns this checkout session
        const allPayments = await db.select().from(subscriptionPayments);
        const match = allPayments.find((p) => p.paymongoCheckoutId === checkoutId);

        if (!match) {
          // Could be a test payment or from a different environment — log and
          // acknowledge so PayMongo doesn't retry indefinitely.
          console.warn(`[webhook/paymongo] No payment record for checkoutId ${checkoutId} — ignoring`);
          return res.status(200).json({ received: true, note: "No matching payment record" });
        }

        if (match.status === "paid") {
          // Idempotent — already processed, just acknowledge
          console.log(`[webhook/paymongo] Payment ${checkoutId} already marked paid — skipping`);
          return res.status(200).json({ received: true, note: "Already processed" });
        }

        const tenantId = match.tenantId!;
        const billingCycle = (match.billingCycle as "monthly" | "annual") ?? "monthly";

        // Mark payment as paid
        await db.update(subscriptionPayments)
          .set({ status: "paid", paidAt: new Date().toISOString() } as any)
          .where(eq(subscriptionPayments.id, match.id));

        // Activate Pro subscription
        const periodEnd = await activateProForTenant(tenantId, billingCycle);

        console.log(`[webhook/paymongo] ✓ Tenant ${tenantId} upgraded to Pro until ${periodEnd.toISOString()}`);
        return res.status(200).json({ received: true, tenantId, plan: "pro", periodEnd: periodEnd.toISOString() });

      } catch (err) {
        console.error("[webhook/paymongo] Error processing checkout_session.payment.paid:", err);
        // Return 500 so PayMongo retries — better to retry than silently drop
        return res.status(500).json({ message: "Internal error processing payment" });
      }
    }

    // Acknowledge all other event types without processing them
    return res.status(200).json({ received: true, note: `Unhandled event type: ${eventType}` });
  });
}
