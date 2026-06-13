import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requirePro, requireManagerOrAbove } from "../middleware";
import { getUserId, handleZodError } from "../lib/route-utils";

export function registerTimeLogRoutes(app: Express): void {

app.get("/api/time-logs", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getTimeLogs(getUserId(req));
    res.json(list);
  });

app.get("/api/time-logs/active", requireAuth, requirePro, async (req, res) => {
    const log = await storage.getActiveTimeLog(getUserId(req));
    res.json(log ?? null);
  });

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

app.post("/api/time-logs/break-start", requireAuth, requirePro, async (req, res) => {
    const log = await storage.startBreak(getUserId(req));
    if (!log) return res.status(409).json({ message: "Not clocked in or already on break" });
    res.json(log);
  });

app.post("/api/time-logs/break-end", requireAuth, requirePro, async (req, res) => {
    const log = await storage.endBreak(getUserId(req));
    if (!log) return res.status(409).json({ message: "Not on break" });
    res.json(log);
  });

app.get("/api/time-logs/team", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const logs = await storage.getTeamTimeLogs(getUserId(req));
    res.json(logs);
  });

app.put("/api/time-logs/:id", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const logId = Number(req.params.id);
      if (!Number.isInteger(logId) || logId <= 0)
        return res.status(400).json({ message: "Invalid log ID" });

      const body = z.object({
        clockIn:       z.string().optional(),
        clockOut:      z.string().nullable().optional(),
        breakMinutes:  z.number().int().min(0).optional(),
        notes:         z.string().nullable().optional(),
        clockOutNotes: z.string().nullable().optional(),
      }).parse(req.body);

if (body.clockIn && body.clockOut) {
        if (new Date(body.clockOut) <= new Date(body.clockIn))
          return res.status(400).json({ message: "Clock-out must be after clock-in" });
      }

      const updated = await storage.editTimeLog(getUserId(req), logId, body);
      if (!updated) return res.status(404).json({ message: "Time log not found" });
      res.json(updated);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.delete("/api/time-logs/:id", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const logId = Number(req.params.id);
    if (!Number.isInteger(logId) || logId <= 0)
      return res.status(400).json({ message: "Invalid log ID" });
    const ok = await storage.deleteTimeLog(getUserId(req), logId);
    if (!ok) return res.status(404).json({ message: "Time log not found" });
    res.json({ message: "Deleted" });
  });

app.post("/api/time-logs/manual", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const body = z.object({
        userId:        z.string(),
        branchId:      z.number().int().positive().optional(),
        clockIn:       z.string(),
        clockOut:      z.string().nullable().optional(),
        breakMinutes:  z.number().int().min(0).optional(),
        notes:         z.string().nullable().optional(),
        clockOutNotes: z.string().nullable().optional(),
      }).parse(req.body);

      if (body.clockOut && new Date(body.clockOut) <= new Date(body.clockIn))
        return res.status(400).json({ message: "Clock-out must be after clock-in" });

      const log = await storage.createManualTimeLog(getUserId(req), body);
      res.status(201).json(log);
    } catch (err: any) {
      if (err?.message === "User not in tenant")
        return res.status(403).json({ message: "Employee not found in your business" });
      if (!handleZodError(err, res)) throw err;
    }
  });
}
