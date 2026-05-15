import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireProOrBusinessFeature } from "../middleware";
import { insertAppointmentSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

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
      const appt = await storage.createAppointment(getUserId(req), input);
      await auditLog(req, "create", "appointment", String(appt.id), { title: appt.title, customerId: appt.customerId });
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
