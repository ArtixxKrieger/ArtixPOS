import { useEffect, useRef, useState } from "react";
import { queryClient, NATIVE_TOKEN_KEY } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function getToken(): string {
  return localStorage.getItem(NATIVE_TOKEN_KEY) ?? "";
}

export function useKitchenSse() {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(2000);
  const { toast } = useToast();

  useEffect(() => {
    let dead = false;

    function connect() {
      if (dead) return;

      const token = getToken();
      const url = token
        ? `/api/sse/kitchen?token=${encodeURIComponent(token)}`
        : `/api/sse/kitchen`;

      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        setConnected(true);
        retryDelay.current = 2000;
      });

      es.addEventListener("order-update", () => {
        queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] });
      });

      es.addEventListener("new-order", (e) => {
        queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] });
        try {
          const data = JSON.parse((e as MessageEvent).data ?? "{}");
          if (data.orderNumber) {
            toast({ title: `New order #${data.orderNumber} arrived`, duration: 4000 });
          }
        } catch { /* ignore parse errors */ }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;
        if (!dead) {
          retryRef.current = setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, 60_000);
            connect();
          }, retryDelay.current);
        }
      };
    }

    // Reconnect immediately when the tab regains network access
    function onOnline() {
      esRef.current?.close();
      esRef.current = null;
      retryDelay.current = 2000;
      connect();
    }

    window.addEventListener("online", onOnline);
    connect();

    return () => {
      dead = true;
      window.removeEventListener("online", onOnline);
      if (retryRef.current) clearTimeout(retryRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  return { connected };
}
