import type { Express } from "express";
import { requireAuth } from "../middleware";
import { getUserId } from "../lib/route-utils";
import { db } from "../db";
import { pushSubscriptions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { pushConfigured } from "../push";

export function registerPushRoutes(app: Express): void {

  app.get("/api/push/vapid-key", (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY ?? "";
    if (!key || !pushConfigured) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }
    res.json({ key });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const uid = getUserId(req);
      const { endpoint, keys } = req.body as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription payload" });
      }

      await db.delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, uid), eq(pushSubscriptions.endpoint, endpoint)));
      await db.insert(pushSubscriptions).values({
        userId: uid,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 255) || null,
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("[push] subscribe error:", err);
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.delete("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const uid = getUserId(req);
      const { endpoint } = req.body as { endpoint?: string };
      if (endpoint) {
        await db.delete(pushSubscriptions)
          .where(and(eq(pushSubscriptions.userId, uid), eq(pushSubscriptions.endpoint, endpoint)));
      } else {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, uid));
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[push] unsubscribe error:", err);
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });
}
