import { pool } from "../../db";
import { runAsAdmin } from "../../tenant-context";
import {
  userSettings,
  type UserSetting,
  type InsertUserSetting,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export async function getSettings(userId: string): Promise<UserSetting | undefined> {
  try {
    const [setting] = await runAsAdmin(pool, (adminDb) =>
      adminDb.select().from(userSettings).where(eq(userSettings.userId, userId))
    );
    return setting;
  } catch (error) {
    console.error("Error fetching settings:", error);
    return undefined;
  }
}

export async function updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting> {
  const doUpsert = async () => {
    const [result] = await runAsAdmin(pool, (adminDb) =>
      adminDb.insert(userSettings)
        .values({ userId, ...settings } as any)
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: settings as any,
        })
        .returning()
    );
    return result;
  };

  try {
    return await doUpsert();
  } catch (error: any) {
    if (error?.code === "25P02") {
      console.warn("[storage] updateSettings hit 25P02 — retrying after 50 ms");
      await new Promise(r => setTimeout(r, 50));
      return await doUpsert();
    }
    console.error("Error updating settings:", error);
    throw error;
  }
}
