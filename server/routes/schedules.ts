import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requirePro, requireManagerOrAbove } from "../middleware";
import { getUserId, handleZodError } from "../lib/route-utils";

const scheduleBody = z.object({
  userId: z.string(),
  branchId: z.number().int().positive().nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export function registerScheduleRoutes(app: Express): void {

  app.get("/api/staff-schedules/employees", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const employees = await storage.getScheduleEmployees(getUserId(req));
    res.json(employees);
  });

  app.get("/api/staff-schedules", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const targetUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const schedules = await storage.getStaffSchedules(getUserId(req), targetUserId);
    res.json(schedules);
  });

  app.post("/api/staff-schedules", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const data = scheduleBody.parse(req.body);
      if (_timeToMinutes(data.startTime) >= _timeToMinutes(data.endTime))
        return res.status(400).json({ message: "End time must be after start time" });
      if (data.effectiveTo && data.effectiveTo < data.effectiveFrom)
        return res.status(400).json({ message: "Effective-to must be on or after effective-from" });
      const created = await storage.createStaffSchedule(getUserId(req), data as any);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.message === "User not in tenant")
        return res.status(403).json({ message: "Employee not found in your business" });
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.put("/api/staff-schedules/:id", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0)
        return res.status(400).json({ message: "Invalid schedule ID" });
      const data = scheduleBody.partial().parse(req.body);
      if (data.startTime && data.endTime && _timeToMinutes(data.startTime) >= _timeToMinutes(data.endTime))
        return res.status(400).json({ message: "End time must be after start time" });
      const updated = await storage.updateStaffSchedule(id, getUserId(req), data as any);
      if (!updated) return res.status(404).json({ message: "Schedule not found" });
      res.json(updated);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.delete("/api/staff-schedules/:id", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ message: "Invalid schedule ID" });
    const ok = await storage.deleteStaffSchedule(id, getUserId(req));
    if (!ok) return res.status(404).json({ message: "Schedule not found" });
    res.json({ message: "Deleted" });
  });
}

function _timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
