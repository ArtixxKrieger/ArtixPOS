import { useEffect, useRef } from "react";
import { queryClient, NATIVE_TOKEN_KEY } from "@/lib/queryClient";

function getToken(): string {
  return localStorage.getItem(NATIVE_TOKEN_KEY) ?? "";
}

export function useDashboardSse() {
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(2000);

  useEffect(() => {
    let dead = false;

    function connect() {
      if (dead) return;

      const token = getToken();
      const url = token
        ? `/api/sse/dashboard?token=${encodeURIComponent(token)}`
        : `/api/sse/dashboard`;

      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        retryDelay.current = 2000;
      });

      es.addEventListener("stats-update", () => {
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
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
}
