import type { ITimeClockRepository } from "../../../domain/repositories/ITimeClockRepository";
import type { TimeLog } from "@shared/schema";

/**
 * Use case: Clock out a staff member.
 *
 * Business rules:
 * - Returns undefined if the user is not currently clocked in.
 * - Any open break is automatically ended before recording the clock-out time.
 * - Early-departure minutes correctly handle overnight shifts (scheduledEnd < scheduledStart
 *   means the end is on the following calendar day).
 */
export class ClockOutUseCase {
  constructor(private readonly timeClock: ITimeClockRepository) {}

  async execute(userId: string, notes?: string): Promise<TimeLog | undefined> {
    return this.timeClock.clockOut(userId, notes);
  }
}
