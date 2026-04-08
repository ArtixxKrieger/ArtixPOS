import { ReactNode, useEffect, useState, startTransition } from "react";
import { useLocation } from "wouter";
import { AiFloatButton } from "@/components/ai-float-button";
import {
  Home, ShoppingCart, Clock, Package,
  Settings, BarChart3, WifiOff, RefreshCw, ScrollText, LogOut,
  ShieldCheck, Building2, Users, UserCircle2, Wallet, AlarmClock, Tag, RotateCcw, Sparkles,
  LayoutGrid, ChefHat, Truck, ShoppingBag, Timer, CalendarDays, UserCheck, BadgeCheck, DoorOpen, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster, sileo } from "sileo";

function ThemeToggle({ isDark, onToggle, size = "md" }: { isDark: boolean; onToggle: () => void; size?: "sm" | "md" }) {
  const isSmall = size === "sm";
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: isSmall ? 44 : 52,
        height: isSmall ? 24 : 28,
        borderRadius: 999,
        padding: 3,
        cursor: "pointer",
        border: "none",
        outline: "none",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.4s ease",
        background: isDark
          ? "linear-gradient(135deg, #1a1f3c 0%, #2d3561 100%)"
          : "linear-gradient(135deg, #ffd93d 0%, #ff9a3c 100%)",
        boxShadow: isDark
          ? "0 0 0 1px rgba(99,120,255,0.3), inset 0 1px 2px rgba(0,0,0,0.4)"
          : "0 0 0 1px rgba(255,150,0,0.3), inset 0 1px 2px rgba(0,0,0,0.1)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Stars (dark mode) */}
      {isDark && (
        <>
          <span style={{ position: "absolute", top: 4, left: 8, width: 2, height: 2, borderRadius: "50%", background: "white", opacity: 0.8 }} />
          <span style={{ position: "absolute", top: 7, left: 14, width: 1.5, height: 1.5, borderRadius: "50%", background: "white", opacity: 0.6 }} />
          <span style={{ position: "absolute", top: 3, left: 20, width: 1.5, height: 1.5, borderRadius: "50%", background: "white", opacity: 0.7 }} />
        </>
      )}
      {/* Sun rays (light mode) */}
      {!isDark && (
        <>
          <span style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", width: isSmall ? 14 : 16, height: isSmall ? 14 : 16, borderRadius: "50%", background: "rgba(255,255,255,0.3)", boxShadow: "0 0 6px 3px rgba(255,220,80,0.5)" }} />
        </>
      )}
      {/* Slider */}
      <span
        style={{
          position: "absolute",
          top: 3,
          left: isDark ? `calc(100% - ${isSmall ? 18 : 22}px - 3px)` : 3,
          width: isSmall ? 18 : 22,
          height: isSmall ? 18 : 22,
          borderRadius: "50%",
          transition: "left 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark
            ? "linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%)"
            : "linear-gradient(135deg, #fff9c4 0%, #fff176 100%)",
          boxShadow: isDark
            ? "0 1px 4px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)"
            : "0 1px 4px rgba(0,0,0,0.2), 0 0 8px 2px rgba(255,230,50,0.6)",
        }}
      >
        {isDark ? (
          <svg width={isSmall ? 10 : 12} height={isSmall ? 10 : 12} viewBox="0 0 24 24" fill="none">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#5c6bc0" />
          </svg>
        ) : (
          <svg width={isSmall ? 10 : 12} height={isSmall ? 10 : 12} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="5" fill="#f57f17" />
            <line x1="12" y1="2" x2="12" y2="5" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="12" y1="19" x2="12" y2="22" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="2" y1="12" x2="5" y2="12" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="19" y1="12" x2="22" y2="12" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" stroke="#f57f17" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </button>
  );
}
import { useSettings } from "@/hooks/use-settings";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { BottomNav } from "./bottom-nav";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useAuth } from "@/hooks/use-auth";
import { getBusinessFeatures } from "@/lib/business-features";

const NAV_ITEMS = [
  { label: "Dashboard", url: "/", icon: Home },
  { label: "POS", url: "/pos", icon: ShoppingCart },
  { label: "Pending", url: "/pending", icon: Clock },
  { label: "Kitchen", url: "/kitchen", icon: ChefHat },
  { label: "Tables", url: "/tables", icon: LayoutGrid },
  { label: "Appointments", url: "/appointments", icon: CalendarDays },
  { label: "Staff", url: "/staff", icon: UserCheck, managerOnly: true },
  { label: "Rooms", url: "/rooms", icon: DoorOpen },
  { label: "Memberships", url: "/memberships", icon: BadgeCheck },
  { label: "Products", url: "/products", icon: Package },
  { label: "Customers", url: "/customers", icon: UserCircle2, managerOnly: true },
  { label: "Transactions", url: "/transactions", icon: ScrollText },
  { label: "Analytics", url: "/analytics", icon: BarChart3 },
  { label: "Expenses", url: "/expenses", icon: Wallet, managerOnly: true },
  { label: "Suppliers", url: "/suppliers", icon: Truck, managerOnly: true },
  { label: "Purchases", url: "/purchases", icon: ShoppingBag, managerOnly: true },
  { label: "Shifts", url: "/shifts", icon: AlarmClock },
  { label: "Time Clock", url: "/timeclock", icon: Timer },
  { label: "Discounts", url: "/discount-codes", icon: Tag, managerOnly: true },
  { label: "Refunds", url: "/refunds", icon: RotateCcw, managerOnly: true },
  { label: "AI Assistant", url: "/ai", icon: Sparkles },
  { label: "Billing", url: "/billing", icon: CreditCard, ownerOnly: true },
  { label: "Settings", url: "/settings", icon: Settings },
] as const;

const ADMIN_NAV_ITEMS = [
  { label: "Overview", url: "/admin", icon: ShieldCheck },
  { label: "Branches", url: "/admin/branches", icon: Building2 },
  { label: "Team", url: "/admin/users", icon: Users },
  { label: "Analytics", url: "/admin/analytics", icon: BarChart3 },
  { label: "Audit Log", url: "/admin/audit-logs", icon: ScrollText, ownerOnly: true },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/pos": "Point of Sale",
  "/pending": "Pending Orders",
  "/kitchen": "Kitchen Display",
  "/tables": "Table Management",
  "/appointments": "Appointments",
  "/staff": "Staff",
  "/rooms": "Rooms & Stations",
  "/memberships": "Memberships",
  "/products": "Products",
  "/customers": "Customers",
  "/transactions": "Transactions",
  "/analytics": "Analytics",
  "/expenses": "Expenses",
  "/suppliers": "Suppliers",
  "/purchases": "Purchase Orders",
  "/shifts": "Shifts",
  "/timeclock": "Time Clock",
  "/discount-codes": "Discount Codes",
  "/refunds": "Refunds",
  "/ai": "AI Assistant",
  "/billing": "Billing",
  "/settings": "Settings",
  "/admin": "Admin Panel",
  "/admin/branches": "Branches",
  "/admin/users": "Team",
  "/admin/analytics": "Analytics",
  "/admin/audit-logs": "Audit Log",
};

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("theme");
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useSettings();
  const { data: pendingOrders = [] } = usePendingOrders();
  const [isDark, setIsDark] = useState(getInitialDark);
  const { isOnline, isSyncing, salesQueueCount } = useOnlineStatus();
  const { user, logout } = useAuth();
  const role = user?.role ?? "cashier";
  const isCashier = role === "cashier";
  const isOwner = role === "owner";
  const isAdminOrAbove = role === "owner" || role === "manager" || role === "admin";
  const isAdminSection = location.startsWith("/admin");

  const { hiddenUrls: businessHiddenUrls, labels: businessLabels, sidebarOrder } = getBusinessFeatures(
    (settings as any)?.businessType,
    (settings as any)?.businessSubType,
  );

  const pendingCount = (pendingOrders as any[]).filter((o: any) => o.status !== "paid").length;
  const storeName = settings?.storeName || "ArtixPOS";
  const storeInitial = storeName[0].toUpperCase();

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    // Only follow system preference if the user hasn't manually chosen one
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) setIsDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        sileo.clear();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <div className="min-h-screen w-full bg-background flex">
      <Toaster
        position="top-left"
        theme={isDark ? "dark" : "light"}
        offset={{ top: 16, left: 16 }}
        options={{ duration: 3500, roundness: 16 }}
      />

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 z-40 bg-card border-r border-border" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Brand */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-[10px] bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <span className="text-white text-sm font-bold">{storeInitial}</span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{storeName}</p>
              <p className="text-[10px] text-muted-foreground tracking-wide uppercase mt-0.5">POS System</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {[...NAV_ITEMS]
            .filter((item) => {
              if (businessHiddenUrls.has(item.url)) return false;
              if (isCashier) return ["Dashboard", "POS", "Pending", "Kitchen", "Tables", "Shifts", "Time Clock", "AI Assistant", "Settings"].includes(item.label);
              const isManagerOrAbove = role === "owner" || role === "manager";
              if ((item as any).managerOnly && !isManagerOrAbove) return false;
              return true;
            })
            .sort((a, b) => {
              const aIdx = sidebarOrder.indexOf(a.url);
              const bIdx = sidebarOrder.indexOf(b.url);
              if (aIdx === -1 && bIdx === -1) return 0;
              if (aIdx === -1) return 1;
              if (bIdx === -1) return -1;
              return aIdx - bIdx;
            })
            .map((item) => {
            const Icon = item.icon;
            const isActive = location === item.url;
            const displayLabel = businessLabels[item.url] ?? item.label;
            const badge = item.url === "/pending" && pendingCount > 0 ? pendingCount : null;

            return (
              <button
                key={item.url}
                onClick={() => startTransition(() => setLocation(item.url))}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-[color,background-color] duration-150",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{displayLabel}</span>
                {badge ? (
                  <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm shadow-rose-500/40">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* Admin section */}
          {isAdminOrAbove && (
            <>
              <div className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Admin</p>
              </div>
              {ADMIN_NAV_ITEMS.map((item) => {
                if ((item as any).ownerOnly && !isOwner) return null;
                const Icon = item.icon;
                const isActive = location === item.url;
                return (
                  <button
                    key={item.url}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => startTransition(() => setLocation(item.url))}
                    className={[
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-[color,background-color] duration-150",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </nav>

        {/* Bottom: user + theme */}
        <div className="p-3 border-t border-border space-y-1">
          {user && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 mb-1">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name ?? ""} className="h-7 w-7 rounded-full shrink-0 object-cover" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">{(user.name ?? "?")[0].toUpperCase()}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate text-foreground">{user.name ?? "User"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email ?? user.provider}</p>
              </div>
              <div data-testid="button-toggle-theme" className="mr-1">
                <ThemeToggle isDark={isDark} onToggle={toggleTheme} size="sm" />
              </div>
              <button onClick={() => logout()} aria-label="Logout" className="text-muted-foreground hover:text-destructive transition-colors shrink-0" title="Logout">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-56">

        {/* Mobile header */}
        <header
          className="md:hidden sticky top-0 z-40 glass-header"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
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
                <p className="text-[10px] text-muted-foreground leading-none mt-[3px] tracking-wide uppercase">
                  {businessLabels[location] ?? PAGE_TITLES[location] ?? "POS"}
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
                  style={{/* no blur — perf */}}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Syncing {salesQueueCount > 0 ? `${salesQueueCount} sale${salesQueueCount !== 1 ? "s" : ""}` : "changes"}…</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                      <WifiOff className="h-3 w-3 shrink-0" />
                      <span>Offline</span>
                      {salesQueueCount > 0 && (
                        <span className="ml-0.5 bg-foreground/10 rounded-full px-1.5 py-0.5 text-[10px]">
                          {salesQueueCount} sale{salesQueueCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <div data-testid="button-toggle-theme-mobile">
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} size="md" />
            </div>

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
                {businessLabels[location] ?? PAGE_TITLES[location] ?? "POS"}
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
                  style={{/* no blur — perf */}}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Syncing {salesQueueCount > 0 ? `${salesQueueCount} sale${salesQueueCount !== 1 ? "s" : ""}` : "changes"}…</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                      <WifiOff className="h-3 w-3 shrink-0" />
                      <span>Offline</span>
                      {salesQueueCount > 0 && (
                        <span className="ml-0.5 bg-foreground/10 rounded-full px-1.5 py-0.5 text-[10px]">
                          {salesQueueCount} sale{salesQueueCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <div data-testid="button-toggle-theme-desktop">
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} size="md" />
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
      <AiFloatButton />
    </div>
  );
}
