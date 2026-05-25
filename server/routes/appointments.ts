import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireProOrBusinessFeature } from "../middleware";
import { insertAppointmentSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";
import { db } from "../db";
import { appointments as appointmentsTable } from "@shared/schema";
import { and, eq, isNull, lte, gte } from "drizzle-orm";

export function registerAppointmentRoutes(app: Express): void {

  // ── List appointments (filterable by date, staff, status) ─────────────────
  app.get("/api/appointments", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const { date, staffId, status } = req.query as Record<string, string>;
    const appts = await storage.getAppointments(getUserId(req), {
      date: date || undefined,
      staffId: staffId ? Number(staffId) : undefined,
      status: status || undefined,
    });
    res.json(appts);
  });

  // ── Get single appointment ─────────────────────────────────────────────────
  app.get("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const appt = await storage.getAppointment(Number(req.params.id), getUserId(req));
    if (!appt) return res.status(404).json({ message: "Appointment not found" });
    res.json(appt);
  });

  // ── Create appointment ─────────────────────────────────────────────────────
  app.post("/api/appointments", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    try {
      const input = insertAppointmentSchema.parse(req.body);

      // Server-side overlap check — prevents double-booking the same room or
      // staff member even if the request bypasses the frontend UI guard.
      if (input.startTime && input.endTime) {
        const conflictConditions = [
          isNull((appointmentsTable as any).deletedAt),
          lte((appointmentsTable as any).startTime, input.endTime),
          gte((appointmentsTable as any).endTime, input.startTime),
        ];
        if (input.roomId) {
          const roomConflict = await db.select({ id: appointmentsTable.id })
            .from(appointmentsTable)
            .where(and(eq((appointmentsTable as any).roomId, input.roomId), ...conflictConditions))
            .limit(1);
          if (roomConflict.length > 0) {
            return res.status(409).json({ message: "This room is already booked for the selected time slot." });
          }
        }
        if (input.staffId) {
          const staffConflict = await db.select({ id: appointmentsTable.id })
            .from(appointmentsTable)
            .where(and(eq((appointmentsTable as any).staffId, input.staffId), ...conflictConditions))
            .limit(1);
          if (staffConflict.length > 0) {
            return res.status(409).json({ message: "This staff member already has an appointment at the selected time." });
          }
        }
      }

      const uid  = getUserId(req);
      const appt = await storage.createAppointment(uid, input);
      await auditLog(req, "create", "appointment", String(appt.id), { title: appt.title, customerId: appt.customerId });

      // Push notification — fire-and-forget so it never delays the response
      setImmediate(async () => {
        try {
          const { sendPushToUsers } = await import("../push");
          const { db: _db } = await import("../db");
          const { users } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          const [owner] = await _db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, uid));
          if (!owner?.tenantId) return;
          const tenantUsers = await _db.select({ id: users.id }).from(users).where(eq(users.tenantId, owner.tenantId));
          const timeStr = appt.startTime
            ? new Date(appt.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";
          await sendPushToUsers(tenantUsers.map(u => u.id), {
            title: `📅 New Appointment: ${appt.title ?? "Untitled"}`,
            body:  timeStr ? `Scheduled for ${timeStr}` : "A new appointment has been booked.",
            tag:   `appt-${appt.id}`,
            url:   "/appointments",
          });
        } catch {}
      });

      res.status(201).json(appt);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update appointment ─────────────────────────────────────────────────────
  app.put("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    try {
      const input = insertAppointmentSchema.partial().parse(req.body);
      const appt = await storage.updateAppointment(Number(req.params.id), getUserId(req), input);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      await auditLog(req, "update", "appointment", String(appt.id), { title: appt.title, customerId: appt.customerId });
      res.json(appt);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Delete appointment ─────────────────────────────────────────────────────
  app.delete("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getAppointment(id, uid);
    await storage.deleteAppointment(id, uid);
    await auditLog(req, "delete", "appointment", String(id), { title: existing?.title, customerId: existing?.customerId });
    res.status(204).end();
  });
}
