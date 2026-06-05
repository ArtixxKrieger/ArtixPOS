import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

const SUBSCRIBED_KEY = "artix_push_subscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export interface UsePushNotifications {
  isSupported:  boolean;
  isSubscribed: boolean;
  permission:   PushPermission;
  isLoading:    boolean;
  subscribe:    () => Promise<void>;
  unsubscribe:  () => Promise<void>;
}

export function usePushNotifications(): UsePushNotifications {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager"   in window &&
    "Notification"  in window;

  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(SUBSCRIBED_KEY) === "1";
  });
  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!isSupported) return "unsupported";
    return Notification.permission as PushPermission;
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission as PushPermission);
  }, [isSupported]);

  // Verify stored subscription is still active in the browser
  useEffect(() => {
    if (!isSupported || !isSubscribed) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) {
          setIsSubscribed(false);
          localStorage.removeItem(SUBSCRIBED_KEY);
        }
      })
      .catch(() => {});
  }, [isSupported, isSubscribed]);

  const subscribe = useCallback(async () => {
    if (!isSupported || isLoading) return;
    setIsLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") return;

      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) throw new Error("Push not configured on server");
      const { key } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(key) as Uint8Array<ArrayBuffer>,
      });

      const json = pushSub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await apiRequest("POST", "/api/push/subscribe", { endpoint: json.endpoint, keys: json.keys });

      setIsSubscribed(true);
      localStorage.setItem(SUBSCRIBED_KEY, "1");
    } catch (err) {
      console.error("[push] subscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return;
    setIsLoading(true);
    try {
      const reg     = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();
      const endpoint = pushSub?.endpoint;
      if (pushSub) await pushSub.unsubscribe();
      await apiRequest("DELETE", "/api/push/unsubscribe", endpoint ? { endpoint } : {});
      setIsSubscribed(false);
      localStorage.removeItem(SUBSCRIBED_KEY);
    } catch (err) {
      console.error("[push] unsubscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  return { isSupported, isSubscribed, permission, isLoading, subscribe, unsubscribe };
}
