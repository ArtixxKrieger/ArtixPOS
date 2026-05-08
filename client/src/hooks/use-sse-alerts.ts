import { useEffect, useRef, useState } from "react";
import { queryClient, NATIVE_TOKEN_KEY } from "@/lib/queryClient";

function getToken(): string {
  return localStorage.getItem(NATIVE_TOKEN_KEY) ?? "";
}

export function useSseAlerts(): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(3000);

  useEffect(() => {
    let dead = false;

    function connect() {
      if (dead) return;

      const token = getToken();
      const url = token
        ? `/api/sse/alerts?token=${encodeURIComponent(token)}`
        : `/api/sse/alerts`;

      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        setConnected(true);
        retryDelay.current = 3000;
      });

      es.addEventListener("low-stock", () => {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      });

      es.addEventListener("new-order", () => {
        queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] });
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

    // Reconnect immediately when the tab regains network
    function onOnline() {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      retryDelay.current = 3000;
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
