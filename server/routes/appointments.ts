import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireProOrBusinessFeature } from "../middleware";
import { insertAppointmentSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";
import { checkAppointmentConflict } from "../infrastructure/persistence/appointments";

export function registerAppointmentRoutes(app: Express): void {

  app.get("/api/appointments", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const { date, staffId, status } = req.query as Record<string, string>;
    const appts = await storage.getAppointments(getUserId(req), {
      date: date || undefined,
      staffId: staffId ? Number(staffId) : undefined,
      status: status || undefined,
    });
    res.json(appts);
  });

  app.get("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const appt = await storage.getAppointment(Number(req.params.id), getUserId(req));
    if (!appt) return res.status(404).json({ message: "Appointment not found" });
    res.json(appt);
  });

  app.post("/api/appointments", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    try {
      const input = insertAppointmentSchema.parse(req.body);

      if (input.startTime && input.endTime) {
        const { roomConflict, staffConflict } = await checkAppointmentConflict({
          roomId:    input.roomId   ?? null,
          staffId:   input.staffId  ?? null,
          startTime: input.startTime,
          endTime:   input.endTime,
        });
        if (roomConflict) {
          return res.status(409).json({ message: "This room is already booked for the selected time slot." });
        }
        if (staffConflict) {
          return res.status(409).json({ message: "This staff member already has an appointment at the selected time." });
        }
      }

      const uid  = getUserId(req);
      const appt = await storage.createAppointment(uid, input);
      await auditLog(req, "create", "appointment", String(appt.id), { title: appt.title, customerId: appt.customerId });

      // Push notifications for every new appointment were removed — too
      // noisy for the owner. Appointments still show up live in the
      // appointments list.

      res.status(201).json(appt);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

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

  app.delete("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const id  = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getAppointment(id, uid);
    await storage.deleteAppointment(id, uid);
    await auditLog(req, "delete", "appointment", String(id), { title: existing?.title, customerId: existing?.customerId });
    res.status(204).end();
  });
}
