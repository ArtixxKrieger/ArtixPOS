import { db } from "../../db";
import { pushSubscriptions } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function upsertPushSubscription(
  userId: string,
  data: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null },
): Promise<void> {
  // Delete any existing sub for this endpoint first (upsert pattern)
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, data.endpoint)));
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: data.endpoint,
    p256dh: data.p256dh,
    auth: data.auth,
    userAgent: data.userAgent ?? null,
  });
}

export async function deletePushSubscription(userId: string, endpoint?: string): Promise<void> {
  if (endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  } else {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }
}
