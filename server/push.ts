/**
 * Web Push notification service.
 *
 * Reads VAPID credentials from env, exposes helpers to send push
 * notifications to individual users or every user in a tenant.
 * Each helper is fire-and-forget safe — expired/invalid subscriptions
 * are automatically pruned from the database.
 */

import webpush from "web-push";
import { db } from "./db";
import { pushSubscriptions, users } from "@shared/schema";
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

/** Send a push notification to every subscription belonging to the given user IDs. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushConfigured || userIds.length === 0) return;

  const subs = await db.select().from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
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
          // 404 / 410 = subscription no longer valid — remove it
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id))
              .catch(() => {});
          }
        })
    )
  );
}

/** Send a push notification to all users in a tenant. */
export async function sendPushToTenant(tenantId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured) return;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  await sendPushToUsers(rows.map((r) => r.id), payload);
}
