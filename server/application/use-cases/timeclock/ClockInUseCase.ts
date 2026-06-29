import type { ITimeClockRepository } from "../../../domain/repositories/ITimeClockRepository";
import type { TimeLog } from "@shared/schema";

/**
 * Use case: Clock in a staff member.
 *
 * Business rules:
 * - A staff member cannot have two open clock-in entries simultaneously.
 *   (Enforced at DB level; the repository throws if a duplicate is attempted.)
 * - Late-minute calculation uses full ISO datetime comparison so cross-midnight
 *   shifts and UTC-offset schedules are handled correctly.
 * - The grace period (5 minutes) is configured in the persistence layer.
 */
export class ClockInUseCase {
  constructor(private readonly timeClock: ITimeClockRepository) {}

  async execute(userId: string, notes?: string): Promise<TimeLog> {
    const active = await this.timeClock.getActiveTimeLog(userId);
    if (active) {
      throw new Error("Already clocked in — clock out first");
    }
    return this.timeClock.clockIn(userId, notes);
  }
}
