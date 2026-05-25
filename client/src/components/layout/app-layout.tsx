import { ReactNode, memo, useEffect, useState, startTransition } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AiFloatButton } from "@/components/ai-float-button";
import {
  type LucideIcon,
  Home, ShoppingCart, Clock, Package,
  Settings, BarChart3, ScrollText, LogOut,
  ShieldCheck, Building2, Users, UserCircle2, Wallet, AlarmClock, Tag, RotateCcw, Sparkles,
  LayoutGrid, ChefHat, Truck, ShoppingBag, Timer, CalendarDays, UserCheck, BadgeCheck, DoorOpen, CreditCard, Warehouse,
  ReceiptText, Gift, Banknote, FileCheck, CalendarClock, BookLock, Cpu, Wifi,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { BranchSwitcher } from "./branch-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { OfflineSyncBanner } from "./offline-sync-banner";
import { Toaster, sileo } from "sileo";
import { useSettings } from "@/hooks/use-settings";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { BottomNav } from "./bottom-nav";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { getBusinessFeatures } from "@/lib/business-features";
import { useBranchBusiness } from "@/hooks/use-branch-business";

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
      { label: "Payroll", url: "/payroll", icon: Banknote, ownerOnly: true, proOnly: true },
    ],
  },
  {
    id: "management",
    label: "Management",
    items: [
      { label: "Products", url: "/products", icon: Package },
      { label: "Inventory Hub", url: "/inventory", icon: Warehouse },
      { label: "Expiry Tracker", url: "/expiry", icon: CalendarClock },
      { label: "Customers", url: "/customers", icon: UserCircle2, managerOnly: true, proOnly: true },
      { label: "Transactions", url: "/transactions", icon: ScrollText },
      { label: "Discounts", url: "/discount-codes", icon: Tag, managerOnly: true, proOnly: true },
      { label: "Loyalty", url: "/loyalty", icon: Gift, proOnly: true },
      { label: "WiFi Vouchers", url: "/wifi-vouchers", icon: Wifi, proOnly: true },
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
      { label: "BIR Compliance", url: "/bir", icon: FileCheck, ownerOnly: true, proOnly: true },
      { label: "Void Audit Log", url: "/bir-audit-log", icon: BookLock, ownerOnly: true, proOnly: true },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      { label: "AI Assistant", url: "/ai", icon: Sparkles, proOnly: true },
      { label: "Hardware", url: "/hardware-settings", icon: Cpu },
      { label: "Print Settings", url: "/print-settings", icon: ReceiptText, ownerOnly: true },
      { label: "Billing", url: "/billing", icon: CreditCard, ownerOnly: true },
      { label: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

const ADMIN_NAV_ITEMS = [
  { label: "Overview", url: "/admin", icon: ShieldCheck, i18nKey: "nav.admin.overview" },
  { label: "Branches", url: "/admin/branches", icon: Building2, i18nKey: "nav.admin.branches" },
  { label: "Team", url: "/admin/users", icon: Users, i18nKey: "nav.admin.team" },
  { label: "Analytics", url: "/admin/analytics", icon: BarChart3, i18nKey: "nav.admin.analytics" },
  { label: "Audit Log", url: "/admin/audit-logs", icon: ScrollText, ownerOnly: true, i18nKey: "nav.admin.auditLog" },
] as const;

const URL_TO_I18N_KEY: Record<string, string> = {
  "/": "nav.dashboard",
  "/pos": "nav.pos",
  "/pending": "nav.pending",
  "/kitchen": "nav.kitchen",
  "/tables": "nav.tables",
  "/appointments": "nav.appointments",
  "/staff": "nav.staff",
  "/rooms": "nav.rooms",
  "/memberships": "nav.memberships",
  "/shifts": "nav.shifts",
  "/timeclock": "nav.timeclock",
  "/payroll": "nav.payroll",
  "/products": "nav.products",
  "/expiry": "nav.expiry",
  "/customers": "nav.customers",
  "/transactions": "nav.transactions",
  "/discount-codes": "nav.discounts",
  "/loyalty": "nav.loyalty",
  "/wifi-vouchers": "nav.wifiVoucher",
  "/refunds": "nav.refunds",
  "/analytics": "nav.analytics",
  "/expenses": "nav.expenses",
  "/suppliers": "nav.suppliers",
  "/purchases": "nav.purchases",
  "/bir": "nav.bir",
  "/bir-audit-log": "nav.birAuditLog",
  "/ai": "nav.ai",
  "/hardware-settings": "nav.hardwareSettings",
  "/print-settings": "nav.printSettings",
  "/billing": "nav.billing",
  "/settings": "nav.settings",
  "/admin": "nav.admin.overview",
  "/admin/branches": "nav.admin.branches",
  "/admin/users": "nav.admin.team",
  "/admin/analytics": "nav.admin.analytics",
  "/admin/audit-logs": "nav.admin.auditLog",
};

const SECTION_ID_TO_I18N_KEY: Record<string, string> = {
  operations: "nav.sections.operations",
  management: "nav.sections.management",
  finance: "nav.sections.financeAnalytics",
  tools: "nav.sections.tools",
};

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
  "/loyalty": "Loyalty Program",
  "/wifi-vouchers": "WiFi Vouchers",
  "/payroll": "Payroll",
  "/bir": "BIR Compliance",
  "/bir-audit-log": "Void Audit Log",
  "/billing": "Billing",
  "/expiry": "Expiry Tracker",
  "/settings": "Settings",
  "/admin": "Admin Panel",
  "/admin/branches": "Branches",
  "/admin/users": "Team",
  "/admin/analytics": "Analytics",
  "/admin/audit-logs": "Audit Log",
};

// ── Stable module-level NavItem ──────────────────────────────────────────────
// MUST be defined outside AppLayout. If defined inside the component body,
// React sees a new function reference on every render (location change) and
// fully unmounts + remounts every nav button — causing a visible flash and
// wasting layout/paint work on every navigation.
interface NavItemProps {
  url: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  displayLabel: string;
  badge: number | null;
  onNavigate: (url: string) => void;
  collapsed?: boolean;
}

const NavItem = memo(function NavItem({
  url,
  icon: Icon,
  label,
  isActive,
  displayLabel,
  badge,
  onNavigate,
  collapsed,
}: NavItemProps) {
  return (
    <button
      onClick={() => startTransition(() => onNavigate(url))}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
      data-tour={`tour-nav-${url === "/" ? "home" : url.slice(1)}`}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? displayLabel : undefined}
      className={[
        "w-full flex items-center rounded-xl text-[12.5px] font-medium transition-all duration-150 group relative",
        collapsed ? "justify-center px-0 py-[9px]" : "gap-2.5 px-3 py-[7px]",
        isActive
          ? "nav-item-active"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent",
      ].join(" ")}
    >
      <Icon
        className={[
          "h-[15px] w-[15px] shrink-0 transition-all duration-150",
          isActive ? "stroke-[2.3px]" : "stroke-[1.7px] opacity-70 group-hover:opacity-100",
        ].join(" ")}
      />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{displayLabel}</span>
          {badge ? (
            <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center shadow-sm tabular-nums">
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </>
      )}
      {collapsed && badge ? (
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-rose-500" />
      ) : null}
    </button>
  );
});

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("theme");
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getInitialSidebarCollapsed(): boolean {
  try { return localStorage.getItem("artixpos_sidebar_collapsed") === "1"; } catch { return false; }
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useSettings();
  const { data: pendingOrders = [] } = usePendingOrders();
  const [isDark, setIsDark] = useState(getInitialDark);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const onlineStatus = useOnlineStatus();
  const { t } = useTranslation();
  const { user, logout, isLoggingOut } = useAuth();
  const { isFree } = useSubscription();

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("artixpos_sidebar_collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  }
  const role = user?.role ?? "cashier";
  const isCashier = role === "cashier";
  const isOwner = role === "owner";
  const isAdminOrAbove = role === "owner" || role === "manager" || role === "admin";
  const isManagerOrAbove = role === "owner" || role === "manager";

  const { businessType: branchBusinessType, businessSubType: branchBusinessSubType } = useBranchBusiness();
  const { hiddenUrls: businessHiddenUrls, essentialUrls: businessEssentialUrls, labels: businessLabels } = getBusinessFeatures(
    branchBusinessType,
    branchBusinessSubType,
  );

  const pendingCount = pendingOrders.filter(o => o.status !== "paid").length;
  const tenantStoreName = settings?.storeName || "ArtixPOS";
  const activeBranchName = user?.activeBranch?.name ?? null;
  const storeName = activeBranchName ?? tenantStoreName;
  const storeInitial = storeName[0].toUpperCase();


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

  // ── Per-page document title ───────────────────────────────────────────────
  useEffect(() => {
    const pageTitle = businessLabels[location] ?? PAGE_TITLES[location];
    document.title = pageTitle ? `${pageTitle} — ${storeName}` : storeName;
  }, [location, storeName, businessLabels]);

  function shouldShowNavItem(item: { url: string; managerOnly?: boolean; ownerOnly?: boolean; proOnly?: boolean }) {
    if (businessHiddenUrls.has(item.url)) return false;
    if (item.proOnly && isFree && !businessEssentialUrls.has(item.url)) return false;
    if (isCashier) {
      const cashierUrls = ["/", "/pos", "/pending", "/settings", ...businessEssentialUrls];
      return cashierUrls.includes(item.url);
    }
    if (item.managerOnly && !isManagerOrAbove) return false;
    if (item.ownerOnly && !isOwner) return false;
    return true;
  }

  return (
    <div className="h-screen w-full bg-background flex overflow-hidden">
      <Toaster
        position="top-left"
        theme={isDark ? "dark" : "light"}
        offset={{ top: 16, left: 16 }}
        options={{ duration: 3500, roundness: 16 }}
      />

      {/* ── Desktop Sidebar ──────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-40 glass-sidebar overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{
          width: sidebarCollapsed ? "56px" : "220px",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        {/* Brand */}
        <div className={["border-b border-border/50 flex-shrink-0", sidebarCollapsed ? "px-2 pt-4 pb-3" : "px-4 pt-5 pb-3"].join(" ")}>
          <div className={["flex items-center", sidebarCollapsed ? "justify-center" : "gap-2.5"].join(" ")}>
            <div
              className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                boxShadow: "0 0 16px rgba(124,58,237,0.4)",
              }}
            >
              <span className="text-white text-sm font-black">{storeInitial}</span>
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="font-bold text-[13px] text-foreground truncate leading-tight">{storeName}</p>
                <p className="text-[9.5px] text-muted-foreground tracking-widest uppercase mt-0.5 font-semibold">{t("common.posSystem")}</p>
              </div>
            )}
          </div>
          {isOwner && !sidebarCollapsed && (
            <div className="mt-3">
              <BranchSwitcher />
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={["flex-1 py-2 overflow-y-auto space-y-0 scrollbar-hide", sidebarCollapsed ? "px-1.5" : "px-2.5"].join(" ")}>
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(item => shouldShowNavItem(item));
            if (visibleItems.length === 0) return null;
            const sectionI18nKey = SECTION_ID_TO_I18N_KEY[section.id];
            const sectionLabel = sectionI18nKey ? t(sectionI18nKey) : section.label;
            return (
              <div key={section.id}>
                {section.label && !sidebarCollapsed && (
                  <p className="nav-section-label">{sectionLabel}</p>
                )}
                {section.label && sidebarCollapsed && (
                  <div className="h-px bg-border/40 my-1.5 mx-1" />
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const i18nKey = URL_TO_I18N_KEY[item.url];
                    const translatedLabel = i18nKey ? t(i18nKey) : item.label;
                    return (
                      <NavItem
                        key={item.url}
                        url={item.url}
                        icon={item.icon}
                        label={item.label}
                        isActive={location === item.url}
                        displayLabel={businessLabels[item.url] ?? translatedLabel}
                        badge={item.url === "/pending" && pendingCount > 0 ? pendingCount : null}
                        onNavigate={setLocation}
                        collapsed={sidebarCollapsed}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {isAdminOrAbove && (
            <div>
              {!sidebarCollapsed && <p className="nav-section-label">{t("nav.sections.admin")}</p>}
              {sidebarCollapsed && <div className="h-px bg-border/40 my-1.5 mx-1" />}
              <div className="space-y-0.5">
                {ADMIN_NAV_ITEMS.map((item) => {
                  if ('ownerOnly' in item && item.ownerOnly && !isOwner) return null;
                  const Icon = item.icon;
                  const isActive = location === item.url;
                  return (
                    <button
                      key={item.url}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                      aria-current={isActive ? "page" : undefined}
                      title={sidebarCollapsed ? t(item.i18nKey) : undefined}
                      onClick={() => startTransition(() => setLocation(item.url))}
                      className={[
                        "w-full flex items-center rounded-xl text-[12.5px] font-medium transition-all duration-150 group",
                        sidebarCollapsed ? "justify-center px-0 py-[9px]" : "gap-2.5 px-3 py-[7px]",
                        isActive
                          ? "nav-item-active"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent",
                      ].join(" ")}
                    >
                      <Icon className={["h-[15px] w-[15px] shrink-0", isActive ? "stroke-[2.3px]" : "stroke-[1.7px] opacity-70 group-hover:opacity-100"].join(" ")} />
                      {!sidebarCollapsed && <span className="flex-1 text-left truncate">{t(item.i18nKey)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* User profile footer */}
        <div className={["pb-4 pt-2 border-t border-border/50 flex-shrink-0", sidebarCollapsed ? "px-1.5" : "px-2.5"].join(" ")}>
          {user && (
            sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name ?? ""} title={user.name ?? ""} className="h-7 w-7 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    title={user.name ?? ""}
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                    {(user.name ?? "?")[0].toUpperCase()}
                  </div>
                )}
                <NotificationBell />
                <button
                  onClick={() => { if (!isLoggingOut) logout(); }}
                  disabled={isLoggingOut}
                  aria-label="Logout"
                  data-testid="button-logout"
                  title={isLoggingOut ? t("common.loggingOut") : t("common.logout")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut className={`h-3.5 w-3.5 ${isLoggingOut ? "animate-pulse" : ""}`} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-muted/30 border border-border/40">
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
                  <NotificationBell />
                  <button
                    onClick={() => { if (!isLoggingOut) logout(); }}
                    disabled={isLoggingOut}
                    aria-label="Logout"
                    data-testid="button-logout"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isLoggingOut ? t("common.loggingOut") : t("common.logout")}
                  >
                    <LogOut className={`h-3.5 w-3.5 ${isLoggingOut ? "animate-pulse" : ""}`} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div
        id="app-scroll"
        className={[
          "flex-1 flex flex-col min-w-0 overflow-y-auto transition-[margin-left] duration-200 ease-in-out",
          sidebarCollapsed ? "md:ml-[56px]" : "md:ml-[220px]",
        ].join(" ")}
        style={{ overscrollBehavior: "none" }}
      >

        {/* Mobile header — theme toggle here only (no sidebar on mobile) */}
        <header
          className="md:hidden sticky top-0 z-[1000] glass-header"
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

            <OfflineSyncBanner status={onlineStatus} />

            <NotificationBell />
          </div>
        </header>

        {/* Desktop top bar — NO theme toggle here (it's in sidebar) */}
        <header className="hidden md:flex sticky top-0 z-30 glass-header">
          <div className="w-full px-4 flex items-center gap-3" style={{ height: "52px" }}>
            <button
              onClick={toggleSidebar}
              data-testid="btn-toggle-sidebar"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent hover:border-border/40 transition-all duration-150 shrink-0"
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="h-4 w-4" />
                : <PanelLeftClose className="h-4 w-4" />
              }
            </button>
            <p className="text-[13px] font-semibold text-foreground flex-1 truncate">
              {businessLabels[location] ?? PAGE_TITLES[location] ?? ""}
            </p>
            <OfflineSyncBanner status={onlineStatus} />
          </div>
        </header>

        {/* Main content */}
        <main className="pb-[calc(104px+env(safe-area-inset-bottom,0px))] md:pb-10">
          <div className="max-w-7xl mx-auto px-4 lg:px-6 py-5">
            {children}
          </div>
        </main>
      </div>

      <BottomNav />
      {isOwner && <AiFloatButton />}
    </div>
  );
}
