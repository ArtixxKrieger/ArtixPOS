import { db } from "../../db";
import {
  serviceStaff,
  serviceRooms,
  appointments,
  type ServiceStaff,
  type InsertServiceStaff,
  type ServiceRoom,
  type InsertServiceRoom,
  type Appointment,
  type InsertAppointment,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, lte, gte } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getServiceStaff(userId: string, branchId?: number | null): Promise<ServiceStaff[]> {
  const userIds = await getTenantUserIds(userId);
  const userCondition = userIds.length === 1
    ? eq(serviceStaff.userId, userIds[0])
    : inArray(serviceStaff.userId, userIds);
  const condition = branchId != null
    ? and(userCondition, eq((serviceStaff as any).branchId, branchId))
    : userCondition;
  return db.select().from(serviceStaff).where(condition).orderBy(desc(serviceStaff.createdAt));
}

export async function getServiceStaffMember(id: number, userId: string): Promise<ServiceStaff | undefined> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(serviceStaff.id, id), eq(serviceStaff.userId, userIds[0]))
    : and(eq(serviceStaff.id, id), inArray(serviceStaff.userId, userIds));
  const [member] = await db.select().from(serviceStaff).where(condition);
  return member;
}

export async function createServiceStaff(userId: string, staff: InsertServiceStaff): Promise<ServiceStaff> {
  const [created] = await db.insert(serviceStaff).values({ ...staff, userId } as any).returning();
  return created;
}

export async function updateServiceStaff(id: number, userId: string, staff: Partial<InsertServiceStaff>): Promise<ServiceStaff | undefined> {
  const existing = await getServiceStaffMember(id, userId);
  if (!existing) return undefined;
  const [updated] = await db.update(serviceStaff).set(staff as any).where(eq(serviceStaff.id, id)).returning();
  return updated;
}

export async function deleteServiceStaff(id: number, userId: string): Promise<void> {
  const existing = await getServiceStaffMember(id, userId);
  if (!existing) return;
  await db.update(serviceStaff).set({ deletedAt: new Date().toISOString() } as any).where(eq(serviceStaff.id, id));
}

export async function getServiceRooms(userId: string, branchId?: number | null): Promise<ServiceRoom[]> {
  const userIds = await getTenantUserIds(userId);
  const userCondition = userIds.length === 1
    ? and(eq(serviceRooms.userId, userIds[0]), isNull(serviceRooms.deletedAt))
    : and(inArray(serviceRooms.userId, userIds), isNull(serviceRooms.deletedAt));
  const condition = branchId != null
    ? and(userCondition, eq((serviceRooms as any).branchId, branchId))
    : userCondition;
  return db.select().from(serviceRooms).where(condition).orderBy(desc(serviceRooms.createdAt));
}

export async function createServiceRoom(userId: string, room: InsertServiceRoom): Promise<ServiceRoom> {
  const [created] = await db.insert(serviceRooms).values({ ...room, userId } as any).returning();
  return created;
}

export async function updateServiceRoom(id: number, userId: string, room: Partial<InsertServiceRoom>): Promise<ServiceRoom | undefined> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(serviceRooms.id, id), eq(serviceRooms.userId, userIds[0]), isNull(serviceRooms.deletedAt))
    : and(eq(serviceRooms.id, id), inArray(serviceRooms.userId, userIds), isNull(serviceRooms.deletedAt));
  const [existing] = await db.select().from(serviceRooms).where(condition);
  if (!existing) return undefined;
  const [updated] = await db.update(serviceRooms).set(room as any).where(eq(serviceRooms.id, id)).returning();
  return updated;
}

export async function deleteServiceRoom(id: number, userId: string): Promise<void> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(serviceRooms.id, id), eq(serviceRooms.userId, userIds[0]), isNull(serviceRooms.deletedAt))
    : and(eq(serviceRooms.id, id), inArray(serviceRooms.userId, userIds), isNull(serviceRooms.deletedAt));
  const [existing] = await db.select().from(serviceRooms).where(condition);
  if (!existing) return;
  await db.update(serviceRooms).set({ deletedAt: new Date().toISOString() } as any).where(eq(serviceRooms.id, id));
}

export async function getAppointments(userId: string, opts?: { date?: string; staffId?: number; status?: string }): Promise<Appointment[]> {
  const userIds = await getTenantUserIds(userId);
  let condition = userIds.length === 1
    ? and(eq(appointments.userId, userIds[0]), isNull(appointments.deletedAt))
    : and(inArray(appointments.userId, userIds), isNull(appointments.deletedAt));
  if (opts?.date) {
    condition = and(condition, eq(appointments.date, opts.date)) as any;
  }
  if (opts?.staffId) {
    condition = and(condition, eq(appointments.staffId, opts.staffId)) as any;
  }
  if (opts?.status) {
    condition = and(condition, eq(appointments.status, opts.status)) as any;
  }
  return db.select().from(appointments).where(condition).orderBy(appointments.date, appointments.startTime);
}

export async function getAppointment(id: number, userId: string): Promise<Appointment | undefined> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(appointments.id, id), eq(appointments.userId, userIds[0]), isNull(appointments.deletedAt))
    : and(eq(appointments.id, id), inArray(appointments.userId, userIds), isNull(appointments.deletedAt));
  const [appt] = await db.select().from(appointments).where(condition);
  return appt;
}

export async function createAppointment(userId: string, appt: InsertAppointment): Promise<Appointment> {
  const [created] = await db.insert(appointments).values({ ...appt, userId } as any).returning();
  return created;
}

export async function updateAppointment(id: number, userId: string, appt: Partial<InsertAppointment>): Promise<Appointment | undefined> {
  const existing = await getAppointment(id, userId);
  if (!existing) return undefined;
  const [updated] = await db.update(appointments).set(appt as any).where(eq(appointments.id, id)).returning();
  return updated;
}

/**
 * Checks whether a room or staff member is already booked within the given time window.
 * Returns flags for each conflict type so the route can give a specific error message.
 */
export async function checkAppointmentConflict(opts: {
  roomId?: number | null;
  staffId?: number | null;
  startTime: string;
  endTime: string;
}): Promise<{ roomConflict: boolean; staffConflict: boolean }> {
  const { roomId, staffId, startTime, endTime } = opts;
  const baseConditions = [
    isNull((appointments as any).deletedAt),
    lte((appointments as any).startTime, endTime),
    gte((appointments as any).endTime, startTime),
  ];

  let roomConflict  = false;
  let staffConflict = false;

  if (roomId) {
    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq((appointments as any).roomId, roomId), ...baseConditions))
      .limit(1);
    roomConflict = rows.length > 0;
  }

  if (staffId) {
    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq((appointments as any).staffId, staffId), ...baseConditions))
      .limit(1);
    staffConflict = rows.length > 0;
  }

  return { roomConflict, staffConflict };
}

export async function deleteAppointment(id: number, userId: string): Promise<void> {
  const existing = await getAppointment(id, userId);
  if (!existing) return;
  await db.update(appointments).set({ deletedAt: new Date().toISOString() } as any).where(eq(appointments.id, id));
}
