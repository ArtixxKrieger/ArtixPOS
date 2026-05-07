import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

const NATIVE_TOKEN_KEY = "artixpos_token";

function getToken(): string {
  return localStorage.getItem(NATIVE_TOKEN_KEY) ?? "";
}

export function useSseAlerts() {
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

      es.addEventListener("low-stock", () => {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      });

      es.addEventListener("new-order", () => {
        queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] });
      });

      es.addEventListener("connected", () => {
        retryDelay.current = 3000;
      });

      es.onerror = () => {
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

    connect();

    return () => {
      dead = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);
}
