import type { TimeLog, StaffSchedule, InsertStaffSchedule } from "@shared/schema";

export interface ITimeClockRepository {
  getTimeLogs(userId: string, opts?: { limit?: number; offset?: number }): Promise<TimeLog[]>;
  getActiveTimeLog(userId: string): Promise<TimeLog | undefined>;
  clockIn(userId: string, notes?: string): Promise<TimeLog>;
  clockOut(userId: string, notes?: string): Promise<TimeLog | undefined>;
  startBreak(userId: string): Promise<TimeLog | undefined>;
  endBreak(userId: string): Promise<TimeLog | undefined>;
  getTeamTimeLogs(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<{
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
  }[]>;
  editTimeLog(
    managerId: string,
    logId: number,
    data: {
      clockIn?: string;
      clockOut?: string | null;
      breakMinutes?: number;
      notes?: string | null;
      clockOutNotes?: string | null;
    },
  ): Promise<TimeLog | undefined>;
  deleteTimeLog(managerId: string, logId: number): Promise<boolean>;
  createManualTimeLog(
    managerId: string,
    data: {
      userId: string;
      branchId?: number;
      clockIn: string;
      clockOut?: string | null;
      breakMinutes?: number;
      notes?: string | null;
      clockOutNotes?: string | null;
    },
  ): Promise<TimeLog>;

  getStaffSchedules(
    managerId: string,
    targetUserId?: string,
  ): Promise<(StaffSchedule & { userName: string | null; userEmail: string | null })[]>;
  getScheduleEmployees(
    managerId: string,
  ): Promise<{ id: string; name: string | null; email: string | null; role: string | null }[]>;
  createStaffSchedule(managerId: string, data: Omit<InsertStaffSchedule, "tenantId">): Promise<StaffSchedule>;
  updateStaffSchedule(
    id: number,
    managerId: string,
    data: Partial<InsertStaffSchedule>,
  ): Promise<StaffSchedule | undefined>;
  deleteStaffSchedule(id: number, managerId: string): Promise<boolean>;
}
