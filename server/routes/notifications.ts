import type { Express } from "express";
import { requireAuth } from "../middleware";
import { storage } from "../storage";
import { cache, notificationsCacheKey } from "../cache";
import { getUserId } from "../lib/route-utils";

export function registerNotificationRoutes(app: Express): void {

  // ── List notifications ─────────────────────────────────────────────────────
  app.get("/api/notifications", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const ck = notificationsCacheKey(uid);
    const cached = cache.get<object[]>(ck);
    if (cached) return res.json(cached);
    const list = await storage.getNotifications(uid);
    cache.set(ck, list, 30_000); // 30 s — notifications are near-real-time
    res.json(list);
  });

  // ── Mark all notifications as read ────────────────────────────────────────
  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    await storage.markAllNotificationsRead(uid);
    cache.del(notificationsCacheKey(uid));
    res.json({ ok: true });
  });

  // ── Mark single notification as read ──────────────────────────────────────
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    await storage.markNotificationRead(Number(req.params.id), uid);
    cache.del(notificationsCacheKey(uid));
    res.json({ ok: true });
  });
}
