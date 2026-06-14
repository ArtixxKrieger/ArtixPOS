import { db } from "../db";
import {
  notifications,
  type Notification,
} from "@shared/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getNotifications(userId: string): Promise<Notification[]> {
  try {
    const ownerIds = await getTenantUserIds(userId);
    const ownerId = ownerIds[0];
    return await db.select().from(notifications)
      .where(eq(notifications.userId, ownerId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  } catch (e) {
    console.error("getNotifications error:", e);
    return [];
  }
}

export async function createNotification(userId: string, data: { type: string; title: string; message?: string; productId?: number }): Promise<void> {
  try {
    const ownerIds = await getTenantUserIds(userId);
    const ownerId = ownerIds[0];
    await db.insert(notifications).values({ userId: ownerId, ...data } as any);
  } catch (e) {
    console.error("createNotification error:", e);
  }
}

export async function markNotificationRead(id: number, userId: string): Promise<void> {
  try {
    const ownerIds = await getTenantUserIds(userId);
    const ownerId = ownerIds[0];
    await (db.update(notifications) as any)
      .set({ readAt: new Date().toISOString() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, ownerId)));
  } catch (e) {
    console.error("markNotificationRead error:", e);
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  try {
    const ownerIds = await getTenantUserIds(userId);
    const ownerId = ownerIds[0];
    await (db.update(notifications) as any)
      .set({ readAt: new Date().toISOString() })
      .where(and(eq(notifications.userId, ownerId), isNull(notifications.readAt)));
  } catch (e) {
    console.error("markAllNotificationsRead error:", e);
  }
}
