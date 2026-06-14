import { db } from "../db";
import {
  timeLogs,
  staffSchedules,
  users,
  type TimeLog,
  type StaffSchedule,
  type InsertStaffSchedule,
} from "@shared/schema";
import { eq, and, isNull, isNotNull, inArray, desc, lte, gte, or } from "drizzle-orm";
import { getTenantUserIds, SCHEDULE_GRACE_MINS, _timeToMinutes } from "./base";

export async function getTimeLogs(userId: string): Promise<TimeLog[]> {
  try {
    return await db.select().from(timeLogs).where(and(eq(timeLogs.userId, userId), isNull(timeLogs.deletedAt))).orderBy(desc(timeLogs.clockIn)).limit(200);
  } catch (error) {
    console.error("Error fetching time logs:", error);
    return [];
  }
}

export async function getActiveTimeLog(userId: string): Promise<TimeLog | undefined> {
  try {
    const [log] = await db.select().from(timeLogs).where(and(eq(timeLogs.userId, userId), isNull(timeLogs.clockOut), isNull(timeLogs.deletedAt))).limit(1);
    return log;
  } catch (error) {
    console.error("Error fetching active time log:", error);
    return undefined;
  }
}

export async function clockIn(userId: string, notes?: string): Promise<TimeLog> {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const today = now.toISOString().slice(0, 10);

    const [schedule] = await db.select().from(staffSchedules).where(
      and(
        eq(staffSchedules.userId, userId),
        eq(staffSchedules.dayOfWeek, dayOfWeek),
        lte(staffSchedules.effectiveFrom, today),
        or(isNull(staffSchedules.effectiveTo), gte(staffSchedules.effectiveTo, today))
      )
    ).limit(1);

    let scheduledStart: string | null = null;
    let scheduledEnd: string | null = null;
    let lateMinutes: number | null = null;

    if (schedule) {
      scheduledStart = schedule.startTime;
      scheduledEnd = schedule.endTime;
      const scheduledStartMins = _timeToMinutes(schedule.startTime);
      const clockInMins = now.getHours() * 60 + now.getMinutes();
      const late = clockInMins - scheduledStartMins - SCHEDULE_GRACE_MINS;
      lateMinutes = late > 0 ? late : 0;
    }

    const [created] = await db.insert(timeLogs).values({
      userId,
      clockIn: now.toISOString(),
      notes: notes ?? null,
      scheduledStart,
      scheduledEnd,
      lateMinutes,
    } as any).returning();
    return created;
  } catch (error) {
    console.error("Error clocking in:", error);
    throw error;
  }
}

export async function clockOut(userId: string, notes?: string): Promise<TimeLog | undefined> {
  try {
    const active = await getActiveTimeLog(userId);
    if (!active) return undefined;
    const now = new Date();
    let finalBreakMinutes = active.breakMinutes ?? 0;
    if (active.breakStart) {
      const breakMs = now.getTime() - new Date(active.breakStart).getTime();
      finalBreakMinutes += Math.max(0, Math.floor(breakMs / 60000));
    }

    let earlyDepartureMinutes: number | null = null;
    const scheduledEnd = (active as any).scheduledEnd as string | null;
    if (scheduledEnd) {
      const scheduledEndMins = _timeToMinutes(scheduledEnd);
      const clockOutMins = now.getHours() * 60 + now.getMinutes();
      const early = scheduledEndMins - SCHEDULE_GRACE_MINS - clockOutMins;
      earlyDepartureMinutes = early > 0 ? early : 0;
    }

    const [updated] = await db.update(timeLogs).set({
      clockOut: now.toISOString(),
      clockOutNotes: notes ?? null,
      breakStart: null,
      breakMinutes: finalBreakMinutes,
      earlyDepartureMinutes,
    } as any).where(eq(timeLogs.id, active.id)).returning();
    return updated;
  } catch (error) {
    console.error("Error clocking out:", error);
    return undefined;
  }
}

export async function startBreak(userId: string): Promise<TimeLog | undefined> {
  try {
    const active = await getActiveTimeLog(userId);
    if (!active || active.breakStart) return active ?? undefined;
    const [updated] = await db.update(timeLogs).set({
      breakStart: new Date().toISOString(),
    } as any).where(eq(timeLogs.id, active.id)).returning();
    return updated;
  } catch (error) {
    console.error("Error starting break:", error);
    return undefined;
  }
}

export async function endBreak(userId: string): Promise<TimeLog | undefined> {
  try {
    const active = await getActiveTimeLog(userId);
    if (!active || !active.breakStart) return active ?? undefined;
    const breakMs = Date.now() - new Date(active.breakStart).getTime();
    const addedMins = Math.max(0, Math.floor(breakMs / 60000));
    const totalBreakMins = (active.breakMinutes ?? 0) + addedMins;
    const [updated] = await db.update(timeLogs).set({
      breakStart: null,
      breakMinutes: totalBreakMins,
    } as any).where(eq(timeLogs.id, active.id)).returning();
    return updated;
  } catch (error) {
    console.error("Error ending break:", error);
    return undefined;
  }
}

export async function getTeamTimeLogs(userId: string): Promise<{
  id: number;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  notes: string | null;
  clockOutNotes: string | null;
  breakStart: string | null;
  breakMinutes: number | null;
  createdAt: string | null;
  userName: string | null;
  userEmail: string | null;
}[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    if (userIds.length === 0) return [];
    const condition = userIds.length === 1
      ? and(eq(timeLogs.userId, userIds[0]), isNull(timeLogs.deletedAt))
      : and(inArray(timeLogs.userId, userIds), isNull(timeLogs.deletedAt));
    const rows = await db.select({
      id: timeLogs.id,
      userId: timeLogs.userId,
      clockIn: timeLogs.clockIn,
      clockOut: timeLogs.clockOut,
      notes: timeLogs.notes,
      clockOutNotes: timeLogs.clockOutNotes,
      breakStart: timeLogs.breakStart,
      breakMinutes: timeLogs.breakMinutes,
      createdAt: timeLogs.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
      .from(timeLogs)
      .leftJoin(users, eq(timeLogs.userId, users.id))
      .where(condition)
      .orderBy(desc(timeLogs.clockIn))
      .limit(500);
    return rows;
  } catch (error) {
    console.error("Error fetching team time logs:", error);
    return [];
  }
}

export async function editTimeLog(managerId: string, logId: number, data: { clockIn?: string; clockOut?: string | null; breakMinutes?: number; notes?: string | null; clockOutNotes?: string | null }): Promise<TimeLog | undefined> {
  try {
    const userIds = await getTenantUserIds(managerId);
    if (userIds.length === 0) return undefined;
    const condition = userIds.length === 1
      ? and(eq(timeLogs.id, logId), eq(timeLogs.userId, userIds[0]), isNull(timeLogs.deletedAt))
      : and(eq(timeLogs.id, logId), inArray(timeLogs.userId, userIds), isNull(timeLogs.deletedAt));
    const [existing] = await db.select({ id: timeLogs.id }).from(timeLogs).where(condition);
    if (!existing) return undefined;
    const [updated] = await db.update(timeLogs).set(data as any).where(eq(timeLogs.id, logId)).returning();
    return updated;
  } catch (error) {
    console.error("Error editing time log:", error);
    return undefined;
  }
}

export async function deleteTimeLog(managerId: string, logId: number): Promise<boolean> {
  try {
    const userIds = await getTenantUserIds(managerId);
    if (userIds.length === 0) return false;
    const condition = userIds.length === 1
      ? and(eq(timeLogs.id, logId), eq(timeLogs.userId, userIds[0]), isNull(timeLogs.deletedAt))
      : and(eq(timeLogs.id, logId), inArray(timeLogs.userId, userIds), isNull(timeLogs.deletedAt));
    const [existing] = await db.select({ id: timeLogs.id }).from(timeLogs).where(condition);
    if (!existing) return false;
    await db.update(timeLogs).set({ deletedAt: new Date().toISOString() } as any).where(eq(timeLogs.id, logId));
    return true;
  } catch (error) {
    console.error("Error deleting time log:", error);
    return false;
  }
}

export async function createManualTimeLog(managerId: string, data: { userId: string; branchId?: number; clockIn: string; clockOut?: string | null; breakMinutes?: number; notes?: string | null; clockOutNotes?: string | null }): Promise<TimeLog> {
  const userIds = await getTenantUserIds(managerId);
  if (!userIds.includes(data.userId)) throw new Error("User not in tenant");
  const [created] = await db.insert(timeLogs).values({
    userId: data.userId,
    branchId: data.branchId ?? null,
    clockIn: data.clockIn,
    clockOut: data.clockOut ?? null,
    breakMinutes: data.breakMinutes ?? 0,
    notes: data.notes ?? null,
    clockOutNotes: data.clockOutNotes ?? null,
  } as any).returning();
  return created;
}

export async function getStaffSchedules(managerId: string, targetUserId?: string): Promise<(StaffSchedule & { userName: string | null; userEmail: string | null })[]> {
  try {
    const userIds = await getTenantUserIds(managerId);
    if (userIds.length === 0) return [];
    const baseCondition = userIds.length === 1
      ? eq(staffSchedules.userId, userIds[0])
      : inArray(staffSchedules.userId, userIds);
    const condition = targetUserId
      ? and(baseCondition, eq(staffSchedules.userId, targetUserId))
      : baseCondition;
    const rows = await db.select({
      id: staffSchedules.id,
      tenantId: staffSchedules.tenantId,
      userId: staffSchedules.userId,
      branchId: staffSchedules.branchId,
      dayOfWeek: staffSchedules.dayOfWeek,
      startTime: staffSchedules.startTime,
      endTime: staffSchedules.endTime,
      effectiveFrom: staffSchedules.effectiveFrom,
      effectiveTo: staffSchedules.effectiveTo,
      createdAt: staffSchedules.createdAt,
      userName: users.name,
      userEmail: users.email,
    }).from(staffSchedules)
      .leftJoin(users, eq(staffSchedules.userId, users.id))
      .where(condition)
      .orderBy(staffSchedules.userId, staffSchedules.dayOfWeek);
    return rows as any;
  } catch (error) {
    console.error("Error fetching staff schedules:", error);
    return [];
  }
}

export async function getScheduleEmployees(managerId: string): Promise<{ id: string; name: string | null; email: string | null; role: string | null }[]> {
  try {
    const userIds = await getTenantUserIds(managerId);
    if (userIds.length === 0) return [];
    const cond = userIds.length === 1
      ? eq(users.id, userIds[0])
      : inArray(users.id, userIds);
    return await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(cond)
      .orderBy(users.name);
  } catch (error) {
    console.error("Error fetching schedule employees:", error);
    return [];
  }
}

export async function createStaffSchedule(managerId: string, data: Omit<InsertStaffSchedule, "tenantId">): Promise<StaffSchedule> {
  const userIds = await getTenantUserIds(managerId);
  if (!userIds.includes(data.userId)) throw new Error("User not in tenant");
  const [managerRow] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, managerId));
  const tenantId = managerRow?.tenantId ?? managerId;
  const [created] = await db.insert(staffSchedules).values({ ...data, tenantId } as any).returning();
  return created;
}

export async function updateStaffSchedule(id: number, managerId: string, data: Partial<InsertStaffSchedule>): Promise<StaffSchedule | undefined> {
  try {
    const userIds = await getTenantUserIds(managerId);
    if (userIds.length === 0) return undefined;
    const cond = userIds.length === 1
      ? and(eq(staffSchedules.id, id), eq(staffSchedules.userId, userIds[0]))
      : and(eq(staffSchedules.id, id), inArray(staffSchedules.userId, userIds));
    const [existing] = await db.select({ id: staffSchedules.id }).from(staffSchedules).where(cond);
    if (!existing) return undefined;
    const [updated] = await db.update(staffSchedules).set(data as any).where(eq(staffSchedules.id, id)).returning();
    return updated;
  } catch (error) {
    console.error("Error updating staff schedule:", error);
    return undefined;
  }
}

export async function deleteStaffSchedule(id: number, managerId: string): Promise<boolean> {
  try {
    const userIds = await getTenantUserIds(managerId);
    if (userIds.length === 0) return false;
    const cond = userIds.length === 1
      ? and(eq(staffSchedules.id, id), eq(staffSchedules.userId, userIds[0]))
      : and(eq(staffSchedules.id, id), inArray(staffSchedules.userId, userIds));
    const [existing] = await db.select({ id: staffSchedules.id }).from(staffSchedules).where(cond);
    if (!existing) return false;
    await db.delete(staffSchedules).where(eq(staffSchedules.id, id));
    return true;
  } catch (error) {
    console.error("Error deleting staff schedule:", error);
    return false;
  }
}
