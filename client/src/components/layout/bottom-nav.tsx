import { useState, startTransition, useEffect, useMemo, useCallback, memo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Home, ShoppingCart, Clock, Package, Settings, BarChart3,
  MoreHorizontal, ScrollText, ShieldCheck, Building2, Users,
  UserCircle2, Wallet, AlarmClock, Tag, RotateCcw,
  LayoutGrid, ChefHat, Truck, ShoppingBag, Timer, CalendarDays, UserCheck, BadgeCheck, DoorOpen, CreditCard,
  ReceiptText, Gift, Banknote, FileCheck, Cpu, Warehouse, CalendarClock, BookLock, Wifi, Maximize, Minimize,
  FlaskConical, Lock,
} from "lucide-react";
import { BranchSwitcher } from "./branch-switcher";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getBusinessFeatures } from "@/lib/business-features";
import { useBranchBusiness } from "@/hooks/use-branch-business";

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
  "/products": "nav.products",
  "/ingredients": "",
  "/inventory": "nav.inventory",
  "/expiry": "nav.expiry",
  "/customers": "nav.customers",
  "/transactions": "nav.transactions",
  "/analytics": "nav.analytics",
  "/expenses": "nav.expenses",
  "/suppliers": "nav.suppliers",
  "/purchases": "nav.purchases",
  "/shifts": "nav.shifts",
  "/timeclock": "nav.timeclock",
  "/discount-codes": "nav.discounts",
  "/refunds": "nav.refunds",
  "/loyalty": "nav.loyalty",
  "/wifi-vouchers": "nav.wifiVoucher",
  "/payroll": "nav.payroll",
  "/bir": "nav.bir",
  "/bir-audit-log": "nav.birAuditLog",
  "/hardware-settings": "nav.hardwareSettings",
  "/print-settings": "nav.printSettings",
  "/billing": "nav.billing",
  "/settings": "nav.settings",
};

const URL_NAV_CONFIG: Record<string, { defaultLabel: string; icon: React.ComponentType<{ className?: string }> }> = {
  "/": { defaultLabel: "Home", icon: Home },
  "/pos": { defaultLabel: "POS", icon: ShoppingCart },
  "/pending": { defaultLabel: "Pending", icon: Clock },
  "/kitchen": { defaultLabel: "Kitchen", icon: ChefHat },
  "/tables": { defaultLabel: "Tables", icon: LayoutGrid },
  "/appointments": { defaultLabel: "Appointments", icon: CalendarDays },
  "/staff": { defaultLabel: "Staff", icon: UserCheck },
  "/rooms": { defaultLabel: "Rooms", icon: DoorOpen },
  "/memberships": { defaultLabel: "Memberships", icon: BadgeCheck },
  "/products": { defaultLabel: "Products", icon: Package },
  "/ingredients": { defaultLabel: "Ingredients", icon: FlaskConical },
  "/inventory": { defaultLabel: "Inventory", icon: Warehouse },
  "/expiry": { defaultLabel: "Expiry", icon: CalendarClock },
  "/customers": { defaultLabel: "Customers", icon: UserCircle2 },
  "/transactions": { defaultLabel: "Transactions", icon: ScrollText },
  "/analytics": { defaultLabel: "Analytics", icon: BarChart3 },
  "/expenses": { defaultLabel: "Expenses", icon: Wallet },
  "/suppliers": { defaultLabel: "Suppliers", icon: Truck },
  "/purchases": { defaultLabel: "Purchases", icon: ShoppingBag },
  "/shifts": { defaultLabel: "Shifts", icon: AlarmClock },
  "/timeclock": { defaultLabel: "Time Clock", icon: Timer },
  "/discount-codes": { defaultLabel: "Discounts", icon: Tag },
  "/refunds": { defaultLabel: "Refunds", icon: RotateCcw },
  "/loyalty": { defaultLabel: "Loyalty", icon: Gift },
  "/wifi-vouchers": { defaultLabel: "WiFi Vouchers", icon: Wifi },
  "/payroll": { defaultLabel: "Payroll", icon: Banknote },
  "/bir": { defaultLabel: "BIR", icon: FileCheck },
  "/bir-audit-log": { defaultLabel: "Void Log", icon: BookLock },
  "/hardware-settings": { defaultLabel: "Hardware", icon: Cpu },
  "/print-settings": { defaultLabel: "Print", icon: ReceiptText },
  "/billing": { defaultLabel: "Billing", icon: CreditCard },
  "/settings": { defaultLabel: "Settings", icon: Settings },
};

type MoreCategory = "service" | "operations" | "management" | "finance" | "tools";

interface MoreNavItem {
  url: string;
  category: MoreCategory;
  cashierHidden: boolean;
  proOnly?: boolean;
  managerOnly?: boolean;
  ownerOnly?: boolean;
}

const MORE_NAV_FULL: MoreNavItem[] = [
  { url: "/kitchen",           category: "service",    cashierHidden: false, proOnly: true },
  { url: "/tables",            category: "service",    cashierHidden: false, proOnly: true },
  { url: "/appointments",      category: "service",    cashierHidden: false, proOnly: true },
  { url: "/staff",             category: "operations", cashierHidden: true },
  { url: "/rooms",             category: "operations", cashierHidden: false, proOnly: true },
  { url: "/memberships",       category: "operations", cashierHidden: false, proOnly: true },
  { url: "/shifts",            category: "operations", cashierHidden: false, proOnly: true },
  { url: "/timeclock",         category: "operations", cashierHidden: false, proOnly: true },
  { url: "/payroll",           category: "operations", cashierHidden: true, ownerOnly: true, proOnly: true },
  { url: "/products",          category: "management", cashierHidden: true },
  { url: "/ingredients",       category: "management", cashierHidden: true },
  { url: "/inventory",         category: "management", cashierHidden: true },
  { url: "/expiry",            category: "management", cashierHidden: true },
  { url: "/customers",         category: "management", cashierHidden: true, proOnly: true },
  { url: "/transactions",      category: "management", cashierHidden: true },
  { url: "/discount-codes",    category: "management", cashierHidden: true, proOnly: true },
  { url: "/loyalty",           category: "management", cashierHidden: true, proOnly: true },
  { url: "/wifi-vouchers",     category: "management", cashierHidden: true, proOnly: true },
  { url: "/refunds",           category: "management", cashierHidden: true, managerOnly: true },
  { url: "/analytics",         category: "finance",    cashierHidden: true },
  { url: "/expenses",          category: "finance",    cashierHidden: true, proOnly: true },
  { url: "/suppliers",         category: "finance",    cashierHidden: true, proOnly: true },
  { url: "/purchases",         category: "finance",    cashierHidden: true, proOnly: true },
  { url: "/bir",               category: "finance",    cashierHidden: true, ownerOnly: true, proOnly: true },
  { url: "/bir-audit-log",     category: "finance",    cashierHidden: true, ownerOnly: true, proOnly: true },
  { url: "/hardware-settings", category: "tools",      cashierHidden: false },
  { url: "/print-settings",    category: "tools",      cashierHidden: true, ownerOnly: true },
  { url: "/billing",           category: "tools",      cashierHidden: true, ownerOnly: true },
  { url: "/settings",          category: "tools",      cashierHidden: false },
];

const CATEGORY_ORDER: MoreCategory[] = ["service", "operations", "management", "finance", "tools"];

const ADMIN_NAV = [
  { label: "Overview",  url: "/admin",            icon: ShieldCheck, i18nKey: "nav.admin.overview" },
  { label: "Branches",  url: "/admin/branches",   icon: Building2,   i18nKey: "nav.admin.branches" },
  { label: "Team",      url: "/admin/users",       icon: Users,       i18nKey: "nav.admin.team",      proOnly: true },
  { label: "Analytics", url: "/admin/analytics",  icon: BarChart3,   i18nKey: "nav.admin.analytics", proOnly: true },
  { label: "Audit Log", url: "/admin/audit-logs", icon: ScrollText,  i18nKey: "nav.admin.auditLog",  ownerOnly: true, businessOnly: true },
] as const;

const ALL_SECONDARY_URLS = new Set([
  ...MORE_NAV_FULL.map((i) => i.url),
  ...ADMIN_NAV.map((i) => i.url),
]);

const MobilePendingBadge = memo(function MobilePendingBadge() {
  const { data } = usePendingOrders();
  const count = (data ?? []).length;
  if (!count) return null;
  return (
    <span className="absolute -top-[6px] -right-[8px] bg-rose-500 text-white text-[8px] font-bold min-w-[13px] h-[13px] rounded-full flex items-center justify-center px-[2px] leading-none shadow-sm shadow-rose-500/40 animate-pulse tabular-nums">
      {count > 9 ? "9+" : count}
    </span>
  );
});

export function BottomNav() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useAuth();
  const { data: _settings } = useSettings();
  const { isFree, isPro, isBusiness } = useSubscription();
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  const role = user?.role ?? "cashier";
  const isCashier = role === "cashier";
  const isAdminOrAbove = role === "owner" || role === "manager" || role === "admin";
  const isManagerOrAbove = role === "owner" || role === "manager";
  const isOwner = role === "owner";

  const { businessType: branchBusinessType, businessSubType: branchBusinessSubType } = useBranchBusiness();
  const { hiddenUrls, essentialUrls, primaryNavUrls, labels } = useMemo(
    () => getBusinessFeatures(branchBusinessType, branchBusinessSubType),
    [branchBusinessType, branchBusinessSubType],
  );

  const CATEGORY_LABELS = useMemo<Record<MoreCategory, string>>(() => ({
    service:    t("nav.sections.service"),
    operations: t("nav.sections.operations"),
    management: t("nav.sections.management"),
    finance:    t("nav.sections.financeAnalytics"),
    tools:      t("nav.sections.tools"),
  }), [t]);

  const primaryNavItems = useMemo(() => [
    { url: "/" as string },
    { url: primaryNavUrls[0] as string },
    { url: primaryNavUrls[1] as string },
  ].map((item) => {
    const config = URL_NAV_CONFIG[item.url] ?? { defaultLabel: item.url, icon: Home };
    const i18nKey = URL_TO_I18N_KEY[item.url];
    const translatedLabel = i18nKey ? t(i18nKey) : config.defaultLabel;
    return {
      url: item.url,
      label: labels[item.url] ?? translatedLabel,
      icon: config.icon,
    };
  }), [t, primaryNavUrls, labels]);

  const primaryNavUrlSet = useMemo(
    () => new Set(primaryNavItems.map((i) => i.url)),
    [primaryNavItems],
  );

  const filteredMoreItems = useMemo(() => MORE_NAV_FULL.filter((i) => {
    if (primaryNavUrlSet.has(i.url)) return false;
    if (isFree && i.proOnly && !essentialUrls.has(i.url)) return false;
    if (isCashier && i.cashierHidden) return false;
    if (i.managerOnly && !isManagerOrAbove) return false;
    if (i.ownerOnly && !isOwner) return false;
    if (hiddenUrls.has(i.url)) return false;
    return true;
  }).map((item) => {
    const config = URL_NAV_CONFIG[item.url] ?? { defaultLabel: item.url, icon: Home };
    const i18nKey = URL_TO_I18N_KEY[item.url];
    const translatedLabel = i18nKey ? t(i18nKey) : config.defaultLabel;
    return {
      url: item.url,
      category: item.category,
      label: labels[item.url] ?? translatedLabel,
      icon: config.icon,
    };
  }), [primaryNavUrlSet, isFree, essentialUrls, isCashier, isManagerOrAbove, isOwner, hiddenUrls, labels, t]);

  const grouped = useMemo(() => CATEGORY_ORDER
    .map(cat => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      items: filteredMoreItems.filter(i => i.category === cat),
    }))
    .filter(g => g.items.length > 0),
  [filteredMoreItems, CATEGORY_LABELS]);

  const isMoreActive = ALL_SECONDARY_URLS.has(location) || location.startsWith("/admin");
  const primaryActiveIndex = primaryNavItems.findIndex((item) => item.url === location);
  const hasMore = filteredMoreItems.length > 0 || isAdminOrAbove;
  const pillIndex = primaryActiveIndex !== -1
    ? primaryActiveIndex
    : isMoreActive
      ? primaryNavItems.length
      : -1;

  const navigate = useCallback((url: string) => {
    startTransition(() => setLocation(url));
    setMoreOpen(false);
  }, [setLocation]);

  return (
    <>
      {}
      <svg style={{ display: "none" }} aria-hidden="true">
        <filter
          id="liquid-glass-distortion"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.001 0.005"
            numOctaves="1"
            seed="17"
            result="turbulence"
          />
          <feComponentTransfer in="turbulence" result="mapped">
            <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
            <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
            <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
          </feComponentTransfer>
          <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
          <feSpecularLighting
            in="softMap"
            surfaceScale="5"
            specularConstant="1"
            specularExponent="100"
            lightingColor="white"
            result="specLight"
          >
            <fePointLight x="-200" y="-200" z="300" />
          </feSpecularLighting>
          <feComposite
            in="specLight"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="litImage"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softMap"
            scale="120"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)" }}
      >
        <div
          className="pointer-events-auto glass-nav mx-3 mb-1.5 rounded-[24px] px-1 py-1 flex items-center w-full relative"
          style={{ maxWidth: "480px" }}
        >
          <div
            className="absolute inset-y-1 pointer-events-none z-0 transition-all duration-300 ease-in-out"
            style={{
              width: `calc((100% - 8px) / ${hasMore ? primaryNavItems.length + 1 : primaryNavItems.length})`,
              transform: `translateX(calc(${Math.max(0, pillIndex)} * 100%))`,
              opacity: pillIndex === -1 ? 0 : 1,
            }}
          >
            <div className="w-full h-full rounded-[18px] relative overflow-hidden"
            style={{ boxShadow: "0 4px 8px rgba(0,0,0,0.12), 0 0 16px rgba(0,0,0,0.06)" }}
          >
            {}
            <div
              className="absolute inset-0 rounded-[18px] overflow-hidden"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                filter: "url(#liquid-glass-distortion)",
                isolation: "isolate",
              }}
            />
            {}
            <div
              className="absolute inset-0 rounded-[18px] dark:bg-white/10 bg-white/40"
            />
            {}
            <div
              className="absolute inset-0 rounded-[18px]"
              style={{
                boxShadow: "inset 1.5px 1.5px 1px rgba(255,255,255,0.65), inset -1px -1px 1px rgba(255,255,255,0.3)",
              }}
            />
          </div>
          </div>

          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.url;

            return (
              <button
                key={item.url}
                onClick={() => startTransition(() => setLocation(item.url))}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                data-tour={`tour-nav-${item.url === "/" ? "home" : item.url.slice(1)}`}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "relative flex flex-col items-center justify-center gap-[2px] rounded-[18px] flex-1 z-10",
                  "transition-[color,transform] duration-200 active:scale-90 select-none cursor-pointer py-2",
                  isActive
                    ? "text-primary"
                    : "text-foreground/55 dark:text-white/50 hover:text-foreground/75 dark:hover:text-white/70",
                ].join(" ")}
              >
                <div className="relative z-10">
                  <Icon
                    className={[
                      "h-[17px] w-[17px] transition-transform duration-200",
                      isActive ? "scale-110 stroke-[2.2px]" : "scale-100 stroke-[1.8px]",
                    ].join(" ")}
                  />
                  {item.url === "/pending" && <MobilePendingBadge />}
                </div>
                <span className="text-[8px] leading-none tracking-wide z-10 transition-all duration-200 font-medium">
                  {item.label}
                </span>
              </button>
            );
          })}

          {hasMore && (
            <button
              onClick={() => setMoreOpen(true)}
              data-tour="tour-nav-more"
              className={[
                "relative flex flex-col items-center justify-center gap-[2px] rounded-[18px] flex-1 z-10",
                "transition-[color,transform] duration-200 active:scale-90 select-none cursor-pointer py-2",
                isMoreActive
                  ? "text-primary"
                  : "text-foreground/55 dark:text-white/50 hover:text-foreground/75 dark:hover:text-white/70",
              ].join(" ")}
            >
              <MoreHorizontal
                className={[
                  "h-[17px] w-[17px] transition-transform duration-200",
                  isMoreActive ? "scale-110 stroke-[2.2px]" : "scale-100 stroke-[1.8px]",
                ].join(" ")}
              />
              <span className="text-[8px] leading-none tracking-wide z-10 transition-all duration-200 font-medium">
                {t("nav.more")}
              </span>
            </button>
          )}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-[28px] p-0 border-t border-border bg-card"
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-muted-foreground/20" />
          </div>

          {role === "owner" && (
            <div className="px-4 pt-3">
              <BranchSwitcher />
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: "calc(72dvh - env(safe-area-inset-bottom, 0px))" }}>

            <div className="px-4 pt-3 pb-1 flex gap-2">
              <button
                onClick={() => {
                  setMoreOpen(false);
                  setTimeout(() => toggleFullscreen(), 300);
                }}
                data-testid="btn-fullscreen-mobile"
                className="flex-1 flex flex-col items-center justify-center gap-2 py-3.5 rounded-2xl border bg-muted/60 border-border text-foreground hover:bg-muted active:scale-95 transition-all duration-200"
              >
                {isFullscreen
                  ? <Minimize className="h-5 w-5 text-muted-foreground" />
                  : <Maximize className="h-5 w-5 text-muted-foreground" />
                }
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {isFullscreen ? "Exit Full" : "Fullscreen"}
                </span>
              </button>
            </div>

            {grouped.map((group) => (
              <div key={group.category} className="px-4 pt-4 pb-1">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-1 mb-2">
                  {group.label}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.url;
                    return (
                      <button
                        key={item.url}
                        onClick={() => navigate(item.url)}
                        aria-current={isActive ? "page" : undefined}
                        className={[
                          "flex flex-col items-center justify-center gap-1.5 rounded-2xl transition-all duration-200 active:scale-95 border h-[72px] w-full overflow-hidden",
                          isActive
                            ? "bg-primary/10 border-primary/20 text-primary"
                            : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                        ].join(" ")}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="text-[10px] font-medium text-center leading-tight px-1 w-full line-clamp-2 break-words">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {isAdminOrAbove && (
              <div className="px-4 pt-4 pb-1">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-1 mb-2">
                  {t("nav.sections.admin")}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {ADMIN_NAV.map((item) => {
                    if ('ownerOnly' in item && item.ownerOnly && !isOwner) return null;
                    const Icon = item.icon;
                    const isActive = location === item.url;
                    const needsPro = ('proOnly' in item) && item.proOnly && !isPro;
                    const needsBusiness = ('businessOnly' in item) && item.businessOnly && !isBusiness;
                    return (
                      <button
                        key={item.url}
                        onClick={() => navigate(item.url)}
                        aria-current={isActive ? "page" : undefined}
                        className={[
                          "relative flex flex-col items-center justify-center gap-1 rounded-2xl transition-all duration-200 active:scale-95 border h-[72px] w-full overflow-hidden",
                          isActive
                            ? "bg-primary/10 border-primary/20 text-primary"
                            : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                        ].join(" ")}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="text-[10px] font-medium text-center leading-tight px-1 w-full line-clamp-2 break-words">{t(item.i18nKey)}</span>
                        {(needsPro || needsBusiness) && (
                          <span className={[
                            "absolute top-1.5 right-1.5 text-[7px] font-bold px-1 py-[1px] rounded-full",
                            needsBusiness
                              ? "bg-violet-500/20 text-violet-600 dark:text-violet-400"
                              : "bg-amber-500/20 text-amber-600 dark:text-amber-400",
                          ].join(" ")}>
                            {needsBusiness ? "BIZ" : "PRO"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
