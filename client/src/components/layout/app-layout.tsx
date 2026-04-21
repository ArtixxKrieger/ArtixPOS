import { ReactNode, useEffect, useState, startTransition } from "react";
import { useLocation } from "wouter";
import { AiFloatButton } from "@/components/ai-float-button";
import {
  Home, ShoppingCart, Clock, Package,
  Settings, BarChart3, WifiOff, RefreshCw, ScrollText, LogOut,
  ShieldCheck, Building2, Users, UserCircle2, Wallet, AlarmClock, Tag, RotateCcw, Sparkles,
  LayoutGrid, ChefHat, Truck, ShoppingBag, Timer, CalendarDays, UserCheck, BadgeCheck, DoorOpen, CreditCard,
  Sun, Moon, ReceiptText,
} from "lucide-react";
import { Toaster, sileo } from "sileo";
import { useSettings } from "@/hooks/use-settings";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { BottomNav } from "./bottom-nav";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { getBusinessFeatures } from "@/lib/business-features";

function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="button-toggle-theme"
      className={[
        "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0",
        isDark
          ? "text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 border border-violet-500/20"
          : "text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 border border-amber-400/30",
      ].join(" ")}
    >
      {isDark
        ? <Sun className="h-4 w-4" strokeWidth={2} />
        : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}

const NAV_SECTIONS = [
  {
    id: "main",
    label: null,
    items: [
      { label: "Dashboard", url: "/", icon: Home },
      { label: "POS", url: "/pos", icon: ShoppingCart },
      { label: "Pending", url: "/pending", icon: Clock },
      { label: "Kitchen", url: "/kitchen", icon: ChefHat, proOnly: true },
      { label: "Tables", url: "/tables", icon: LayoutGrid, proOnly: true },
      { label: "Appointments", url: "/appointments", icon: CalendarDays, proOnly: true },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { label: "Staff", url: "/staff", icon: UserCheck, managerOnly: true },
      { label: "Rooms", url: "/rooms", icon: DoorOpen, proOnly: true },
      { label: "Memberships", url: "/memberships", icon: BadgeCheck, proOnly: true },
      { label: "Shifts", url: "/shifts", icon: AlarmClock, proOnly: true },
      { label: "Time Clock", url: "/timeclock", icon: Timer, proOnly: true },
    ],
  },
  {
    id: "management",
    label: "Management",
    items: [
      { label: "Products", url: "/products", icon: Package },
      { label: "Customers", url: "/customers", icon: UserCircle2, managerOnly: true, proOnly: true },
      { label: "Transactions", url: "/transactions", icon: ScrollText },
      { label: "Discounts", url: "/discount-codes", icon: Tag, managerOnly: true, proOnly: true },
      { label: "Refunds", url: "/refunds", icon: RotateCcw, managerOnly: true },
    ],
  },
  {
    id: "finance",
    label: "Finance & Analytics",
    items: [
      { label: "Analytics", url: "/analytics", icon: BarChart3 },
      { label: "Expenses", url: "/expenses", icon: Wallet, managerOnly: true, proOnly: true },
      { label: "Suppliers", url: "/suppliers", icon: Truck, managerOnly: true, proOnly: true },
      { label: "Purchases", url: "/purchases", icon: ShoppingBag, managerOnly: true, proOnly: true },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      { label: "AI Assistant", url: "/ai", icon: Sparkles, proOnly: true },
      { label: "Print Settings", url: "/print-settings", icon: ReceiptText, ownerOnly: true },
      { label: "Billing", url: "/billing", icon: CreditCard, ownerOnly: true },
      { label: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

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
  "/print-settings": "Print Settings",
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
  const { isFree } = useSubscription();
  const role = user?.role ?? "cashier";
  const isCashier = role === "cashier";
  const isOwner = role === "owner";
  const isAdminOrAbove = role === "owner" || role === "manager" || role === "admin";
  const isManagerOrAbove = role === "owner" || role === "manager";

  const { hiddenUrls: businessHiddenUrls, essentialUrls: businessEssentialUrls, labels: businessLabels } = getBusinessFeatures(
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
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) setIsDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) sileo.clear();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  function shouldShowNavItem(item: { url: string; managerOnly?: boolean; ownerOnly?: boolean; proOnly?: boolean }) {
    if (businessHiddenUrls.has(item.url as any)) return false;
    if ((item as any).proOnly && isFree && !businessEssentialUrls.has(item.url)) return false;
    if (isCashier) {
      const cashierUrls = ["/", "/pos", "/pending", "/settings", ...businessEssentialUrls];
      return cashierUrls.includes(item.url);
    }
    if ((item as any).managerOnly && !isManagerOrAbove) return false;
    if ((item as any).ownerOnly && !isOwner) return false;
    return true;
  }

  const NavItem = ({ item }: { item: { label: string; url: string; icon: any; managerOnly?: boolean; ownerOnly?: boolean } }) => {
    if (!shouldShowNavItem(item)) return null;
    const Icon = item.icon;
    const isActive = location === item.url;
    const displayLabel = businessLabels[item.url] ?? item.label;
    const badge = item.url === "/pending" && pendingCount > 0 ? pendingCount : null;

    return (
      <button
        onClick={() => startTransition(() => setLocation(item.url))}
        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
        className={[
          "w-full flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[12.5px] font-medium transition-all duration-150 group",
          isActive
            ? "nav-item-active"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent",
        ].join(" ")}
      >
        <Icon className={["h-[14px] w-[14px] shrink-0 transition-all duration-150", isActive ? "stroke-[2.3px]" : "stroke-[1.7px] opacity-70 group-hover:opacity-100"].join(" ")} />
        <span className="flex-1 text-left truncate">{displayLabel}</span>
        {badge ? (
          <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center shadow-sm tabular-nums">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="min-h-screen w-full bg-transparent flex">
      <Toaster
        position="top-left"
        theme={isDark ? "dark" : "light"}
        offset={{ top: 16, left: 16 }}
        options={{ duration: 3500, roundness: 16 }}
      />

      {/* ── Desktop Sidebar ──────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[220px] z-40 glass-sidebar"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {/* Brand */}
        <div className="px-4 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div
              className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                boxShadow: "0 0 16px rgba(124,58,237,0.4)",
              }}
            >
              <span className="text-white text-sm font-black">{storeInitial}</span>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[13px] text-foreground truncate leading-tight">{storeName}</p>
              <p className="text-[9.5px] text-muted-foreground tracking-widest uppercase mt-0.5 font-semibold">POS System</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-2 overflow-y-auto space-y-0 scrollbar-hide">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(item => shouldShowNavItem(item));
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.id}>
                {section.label && (
                  <p className="nav-section-label">{section.label}</p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavItem key={item.url} item={item as any} />
                  ))}
                </div>
              </div>
            );
          })}

          {isAdminOrAbove && (
            <div>
              <p className="nav-section-label">Admin</p>
              <div className="space-y-0.5">
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
                        "w-full flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[12.5px] font-medium transition-all duration-150 group",
                        isActive
                          ? "nav-item-active"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent",
                      ].join(" ")}
                    >
                      <Icon className={["h-[14px] w-[14px] shrink-0", isActive ? "stroke-[2.3px]" : "stroke-[1.7px] opacity-70 group-hover:opacity-100"].join(" ")} />
                      <span className="flex-1 text-left truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* User profile footer — theme toggle lives HERE only */}
        <div className="px-2.5 pb-4 pt-2 border-t border-border/40">
          {user && (
            <div className="flex items-center gap-2 px-2 py-2 rounded-xl glass-btn border">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name ?? ""} className="h-7 w-7 rounded-full shrink-0 object-cover" />
              ) : (
                <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  {(user.name ?? "?")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-semibold truncate text-foreground leading-tight">{user.name ?? "User"}</p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight">{user.email ?? user.provider}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
                <button
                  onClick={() => logout()}
                  aria-label="Logout"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all duration-200"
                  title="Logout"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[220px]">

        {/* Mobile header — theme toggle here only (no sidebar on mobile) */}
        <header
          className="md:hidden sticky top-0 z-40 glass-header"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="px-4 flex items-center gap-3" style={{ height: "52px" }}>
            <div
              className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 12px rgba(124,58,237,0.35)" }}
            >
              <span className="text-white text-xs font-black">{storeInitial}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold leading-tight truncate">{storeName}</p>
              <p className="text-[9px] text-muted-foreground leading-tight tracking-widest uppercase font-semibold">
                {businessLabels[location] ?? PAGE_TITLES[location] ?? "POS"}
              </p>
            </div>

            {(!isOnline || isSyncing) && (
              <div className={["flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border", isSyncing ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border/50"].join(" ")}>
                {isSyncing ? <><RefreshCw className="h-2.5 w-2.5 animate-spin" /><span>Syncing</span></> : <><WifiOff className="h-2.5 w-2.5" /><span>Offline</span></>}
              </div>
            )}

            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          </div>
        </header>

        {/* Desktop top bar — NO theme toggle here (it's in sidebar) */}
        <header className="hidden md:flex sticky top-0 z-30 glass-header">
          <div className="w-full px-6 flex items-center gap-4" style={{ height: "52px" }}>
            <p className="text-[13px] font-semibold text-foreground">
              {businessLabels[location] ?? PAGE_TITLES[location] ?? ""}
            </p>

            {(!isOnline || isSyncing) && (
              <div className={["flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-300", isSyncing ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border/50"].join(" ")}>
                {isSyncing ? (
                  <><RefreshCw className="h-3 w-3 animate-spin" /><span>Syncing {salesQueueCount > 0 ? `${salesQueueCount} sale${salesQueueCount !== 1 ? "s" : ""}` : "changes"}…</span></>
                ) : (
                  <><WifiOff className="h-3 w-3" /><span>Offline</span>{salesQueueCount > 0 && <span className="ml-0.5 bg-muted-foreground/10 rounded-full px-1.5 py-0.5 text-[10px]">{salesQueueCount}</span>}</>
                )}
              </div>
            )}
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
