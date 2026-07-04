import { useState, useEffect, useCallback } from "react";
import { apiRequest, nativeFetch } from "@/lib/queryClient";

const SUBSCRIBED_KEY = "artix_push_subscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export interface UsePushNotifications {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: PushPermission;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotifications {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(SUBSCRIBED_KEY) === "1";
  });
  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!isSupported) return "unsupported";
    return Notification.permission as PushPermission;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync permission on mount
  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission as PushPermission);
  }, [isSupported]);

  // If we think we're subscribed but the push subscription is gone
  // (e.g. user cleared site data, SW updated), reset the flag.
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

  // Auto-detect: if permission was already granted before (e.g. user
  // enabled notifications, cleared cache, and came back), check for an
  // existing push subscription and reconcile without re-prompting.
  useEffect(() => {
    if (!isSupported || isSubscribed || isLoading) return;
    if (permission !== "granted") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) {
          setIsSubscribed(true);
          localStorage.setItem(SUBSCRIBED_KEY, "1");
        }
      })
      .catch(() => {});
  }, [isSupported, isSubscribed, permission, isLoading]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || isLoading) return false;
    setIsLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        if (perm === "denied") {
          setError(
            "Notifications are blocked by your browser. Update your site settings to enable them.",
          );
        }
        return false;
      }

      const keyRes = await nativeFetch("/api/push/vapid-key");
      if (!keyRes.ok) {
        setError("Push notifications are not configured on the server yet.");
        return false;
      }
      const { key } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as Uint8Array<ArrayBuffer>,
      });

      const json = pushSub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await apiRequest("POST", "/api/push/subscribe", { endpoint: json.endpoint, keys: json.keys });

      setIsSubscribed(true);
      localStorage.setItem(SUBSCRIBED_KEY, "1");
      setError(null);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to enable push notifications";
      setError(msg);
      console.error("[push] subscribe error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
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

  return { isSupported, isSubscribed, permission, isLoading, error, subscribe, unsubscribe };
}
