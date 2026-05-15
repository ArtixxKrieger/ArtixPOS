import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireProOrBusinessFeature } from "../middleware";
import { insertServiceStaffSchema, insertServiceRoomSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

export function registerServiceStaffRoutes(app: Express): void {

  // ── List service staff ─────────────────────────────────────────────────────
  app.get("/api/service-staff", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    const staff = await storage.getServiceStaff(getUserId(req));
    res.json(staff);
  });

  // ── Get single staff member ────────────────────────────────────────────────
  app.get("/api/service-staff/:id", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    const member = await storage.getServiceStaffMember(Number(req.params.id), getUserId(req));
    if (!member) return res.status(404).json({ message: "Staff member not found" });
    res.json(member);
  });

  // ── Create staff member ────────────────────────────────────────────────────
  app.post("/api/service-staff", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    try {
      const input = insertServiceStaffSchema.parse(req.body);
      const member = await storage.createServiceStaff(getUserId(req), input);
      await auditLog(req, "create", "service_staff", String(member.id), { name: member.name });
      res.status(201).json(member);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update staff member ────────────────────────────────────────────────────
  app.put("/api/service-staff/:id", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    try {
      const input = insertServiceStaffSchema.partial().parse(req.body);
      const member = await storage.updateServiceStaff(Number(req.params.id), getUserId(req), input);
      if (!member) return res.status(404).json({ message: "Staff member not found" });
      await auditLog(req, "update", "service_staff", String(member.id), { name: member.name });
      res.json(member);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Delete staff member ────────────────────────────────────────────────────
  app.delete("/api/service-staff/:id", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const uid = getUserId(req);
      const existing = await storage.getServiceStaffMember(id, uid);
      await storage.deleteServiceStaff(id, uid);
      await auditLog(req, "delete", "service_staff", String(id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });
}

export function registerServiceRoomRoutes(app: Express): void {

  // ── List service rooms ─────────────────────────────────────────────────────
  app.get("/api/service-rooms", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res) => {
    const rooms = await storage.getServiceRooms(getUserId(req));
    res.json(rooms);
  });

  // ── Create service room ────────────────────────────────────────────────────
  app.post("/api/service-rooms", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res) => {
    try {
      const input = insertServiceRoomSchema.parse(req.body);
      const room = await storage.createServiceRoom(getUserId(req), input);
      await auditLog(req, "create", "service_room", String(room.id), { name: room.name });
      res.status(201).json(room);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update service room ────────────────────────────────────────────────────
  app.put("/api/service-rooms/:id", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res) => {
    try {
      const input = insertServiceRoomSchema.partial().parse(req.body);
      const room = await storage.updateServiceRoom(Number(req.params.id), getUserId(req), input);
      if (!room) return res.status(404).json({ message: "Room not found" });
      await auditLog(req, "update", "service_room", String(room.id), { name: room.name });
      res.json(room);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Delete service room ────────────────────────────────────────────────────
  app.delete("/api/service-rooms/:id", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const uid = getUserId(req);
      const existing = await storage.getServiceRooms(uid).then(list => list.find(r => r.id === id));
      await storage.deleteServiceRoom(id, uid);
      await auditLog(req, "delete", "service_room", String(id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });
}
