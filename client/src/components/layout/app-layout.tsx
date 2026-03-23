import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Moon, Sun, Home, ShoppingCart, Clock, Package,
  Settings, BarChart3, WifiOff, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "sileo";
import { useSettings } from "@/hooks/use-settings";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { BottomNav } from "./bottom-nav";
import { useOnlineStatus } from "@/hooks/use-online-status";

const NAV_ITEMS = [
  { label: "Dashboard", url: "/", icon: Home },
  { label: "POS", url: "/pos", icon: ShoppingCart },
  { label: "Pending", url: "/pending", icon: Clock },
  { label: "Products", url: "/products", icon: Package },
  { label: "Analytics", url: "/analytics", icon: BarChart3 },
  { label: "Settings", url: "/settings", icon: Settings },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/pos": "Point of Sale",
  "/pending": "Pending Orders",
  "/products": "Products",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useSettings();
  const { data: pendingOrders = [] } = usePendingOrders();
  const [isDark, setIsDark] = useState(getInitialDark);
  const { isOnline, isSyncing, queueCount } = useOnlineStatus();

  const pendingCount = (pendingOrders as any[]).filter((o: any) => o.status !== "paid").length;
  const storeName = settings?.storeName || "Café Bara";
  const storeInitial = storeName[0].toUpperCase();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const dark = getInitialDark();
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return (
    <div className="min-h-screen w-full bg-background flex">
      <Toaster
        position="bottom-center"
        theme={isDark ? "dark" : "light"}
        offset={{ bottom: 96 }}
        options={{ duration: 3500, roundness: 16 }}
      />

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 z-40 bg-card border-r border-border">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-[10px] bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <span className="text-white text-sm font-bold">{storeInitial}</span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{storeName}</p>
              <p className="text-[10px] text-muted-foreground/70 tracking-wide uppercase mt-0.5">POS System</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.url;
            const badge = item.label === "Pending" && pendingCount > 0 ? pendingCount : null;

            return (
              <button
                key={item.url}
                onClick={() => setLocation(item.url)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {badge ? (
                  <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm shadow-rose-500/40">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Bottom: theme toggle */}
        <div className="p-3 border-t border-border">
          <button
            onClick={() => setIsDark(!isDark)}
            data-testid="button-theme-toggle"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 border border-transparent"
          >
            {isDark
              ? <Sun className="h-4 w-4 text-amber-400 shrink-0" />
              : <Moon className="h-4 w-4 shrink-0" />}
            <span>{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-56">

        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-40 glass-header">
          <div
            className="max-w-7xl mx-auto px-4 flex items-center gap-3"
            style={{ height: "56px" }}
          >
            {/* Brand */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 shrink-0 rounded-[10px] bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <span className="text-white text-sm font-bold">{storeInitial}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-none truncate">{storeName}</p>
                <p className="text-[10px] text-muted-foreground/70 leading-none mt-[3px] tracking-wide uppercase">
                  {PAGE_TITLES[location] || "POS"}
                </p>
              </div>
            </div>

            {/* Offline / syncing pill */}
            <div className="flex-1 flex justify-center pointer-events-none">
              {(!isOnline || isSyncing) && (
                <div
                  data-testid="banner-offline-status"
                  className={[
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all duration-300",
                    isSyncing
                      ? "bg-primary/10 dark:bg-primary/15 text-primary border-primary/20"
                      : "bg-foreground/5 dark:bg-white/5 text-muted-foreground border-border/50",
                  ].join(" ")}
                  style={{ backdropFilter: "blur(8px)" }}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Syncing {queueCount > 0 ? `${queueCount} ` : ""}changes…</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                      <WifiOff className="h-3 w-3 shrink-0" />
                      <span>Offline</span>
                      {queueCount > 0 && (
                        <span className="ml-0.5 bg-foreground/10 rounded-full px-1.5 py-0.5 text-[10px]">
                          {queueCount}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <Button
              variant="glass"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              className="h-8 w-8 rounded-full shrink-0"
              data-testid="button-theme-toggle"
            >
              {isDark
                ? <Sun className="h-[15px] w-[15px] text-amber-400" />
                : <Moon className="h-[15px] w-[15px] text-slate-500" />}
            </Button>
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden md:flex sticky top-0 z-30 glass-header">
          <div
            className="w-full px-6 flex items-center gap-4"
            style={{ height: "56px" }}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none">
                {PAGE_TITLES[location] || "POS"}
              </p>
            </div>

            <div className="flex-1 flex justify-center pointer-events-none">
              {(!isOnline || isSyncing) && (
                <div
                  data-testid="banner-offline-status"
                  className={[
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all duration-300",
                    isSyncing
                      ? "bg-primary/10 dark:bg-primary/15 text-primary border-primary/20"
                      : "bg-foreground/5 dark:bg-white/5 text-muted-foreground border-border/50",
                  ].join(" ")}
                  style={{ backdropFilter: "blur(8px)" }}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Syncing {queueCount > 0 ? `${queueCount} ` : ""}changes…</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                      <WifiOff className="h-3 w-3 shrink-0" />
                      <span>Offline</span>
                      {queueCount > 0 && (
                        <span className="ml-0.5 bg-foreground/10 rounded-full px-1.5 py-0.5 text-[10px]">
                          {queueCount}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="pb-[calc(80px+env(safe-area-inset-bottom,0px))] md:pb-10 flex-1">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
            {children}
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
