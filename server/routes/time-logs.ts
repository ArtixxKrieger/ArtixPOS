import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requirePro, requireManagerOrAbove } from "../middleware";
import { getUserId, handleZodError } from "../lib/route-utils";

export function registerTimeLogRoutes(app: Express): void {

  // ── List time logs for current user ───────────────────────────────────────
  app.get("/api/time-logs", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getTimeLogs(getUserId(req));
    res.json(list);
  });

  // ── Get the currently active (open) time log ───────────────────────────────
  app.get("/api/time-logs/active", requireAuth, requirePro, async (req, res) => {
    const log = await storage.getActiveTimeLog(getUserId(req));
    res.json(log ?? null);
  });

  // ── Clock in ───────────────────────────────────────────────────────────────
  app.post("/api/time-logs/clock-in", requireAuth, requirePro, async (req, res) => {
    try {
      const uid = getUserId(req);
      const active = await storage.getActiveTimeLog(uid);
      if (active) return res.status(400).json({ message: "Already clocked in" });
      const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
      const log = await storage.clockIn(uid, notes);
      res.status(201).json(log);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Clock out ──────────────────────────────────────────────────────────────
  app.post("/api/time-logs/clock-out", requireAuth, requirePro, async (req, res) => {
    try {
      const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
      const log = await storage.clockOut(getUserId(req), notes);
      if (!log) return res.status(409).json({ message: "Not clocked in" });
      res.json(log);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Start break ────────────────────────────────────────────────────────────
  app.post("/api/time-logs/break-start", requireAuth, requirePro, async (req, res) => {
    const log = await storage.startBreak(getUserId(req));
    if (!log) return res.status(409).json({ message: "Not clocked in or already on break" });
    res.json(log);
  });

  // ── End break ──────────────────────────────────────────────────────────────
  app.post("/api/time-logs/break-end", requireAuth, requirePro, async (req, res) => {
    const log = await storage.endBreak(getUserId(req));
    if (!log) return res.status(409).json({ message: "Not on break" });
    res.json(log);
  });

  // ── Team time logs (manager+ only) ────────────────────────────────────────
  app.get("/api/time-logs/team", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const logs = await storage.getTeamTimeLogs(getUserId(req));
    res.json(logs);
  });
}
