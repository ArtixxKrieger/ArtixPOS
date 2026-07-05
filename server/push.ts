import webpush from "web-push";
import { db } from "./db";
import { pushSubscriptions, users, userSettings, type NotificationPreferences } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL   = process.env.VAPID_EMAIL       ?? "mailto:admin@artixpos.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

export const pushConfigured = !!(VAPID_PUBLIC && VAPID_PRIVATE);

export interface PushPayload {
  title: string;
  body:  string;
  icon?: string;
  tag?:  string;
  url?:  string;
}

/**
 * Filters userIds down to those who have NOT disabled the given
 * notification preference. Users with no row / no preferences set default
 * to enabled (opt-out model).
 */
async function filterByPreference(
  userIds: string[],
  prefKey: keyof NotificationPreferences,
): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  const rows = await db
    .select({ userId: userSettings.userId, notificationPreferences: userSettings.notificationPreferences })
    .from(userSettings)
    .where(inArray(userSettings.userId, userIds));
  const prefsByUser = new Map(rows.map((r) => [r.userId, r.notificationPreferences]));
  return userIds.filter((id) => {
    const prefs = prefsByUser.get(id);
    return prefs?.[prefKey] !== false;
  });
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  prefKey?: keyof NotificationPreferences,
): Promise<void> {
  if (!pushConfigured || userIds.length === 0) return;

  const allowedUserIds = prefKey ? await filterByPreference(userIds, prefKey) : userIds;
  if (allowedUserIds.length === 0) return;

  const subs = await db.select().from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, allowedUserIds));
  if (subs.length === 0) return;

  const message = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    icon:  payload.icon ?? "/logo192.png",
    badge: "/logo192.png",
    tag:   payload.tag  ?? "artixpos",
    url:   payload.url  ?? "/",
  });

  await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        )
        .catch(async (err: any) => {

          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id))
              .catch(() => {});
          }
        })
    )
  );
}

export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload,
  prefKey?: keyof NotificationPreferences,
): Promise<void> {
  if (!pushConfigured) return;
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId));
  await sendPushToUsers(rows.map((r) => r.id), payload, prefKey);
}
