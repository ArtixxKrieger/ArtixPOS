import { useState, startTransition } from "react";
import { useLocation } from "wouter";
import {
  Home, ShoppingCart, Clock, Package, Settings, BarChart3,
  MoreHorizontal, ScrollText, ShieldCheck, Building2, Users,
  UserCircle2, Wallet, AlarmClock, Tag, RotateCcw, Sparkles,
  LayoutGrid, ChefHat, Truck, ShoppingBag, Timer, CalendarDays, UserCheck, BadgeCheck, DoorOpen, CreditCard,
} from "lucide-react";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getBusinessFeatures } from "@/lib/business-features";

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
  "/ai": { defaultLabel: "AI", icon: Sparkles },
  "/billing": { defaultLabel: "Billing", icon: CreditCard },
  "/settings": { defaultLabel: "Settings", icon: Settings },
};

const MORE_NAV_FULL = [
  { url: "/kitchen", cashierHidden: false, proOnly: true },
  { url: "/tables", cashierHidden: false, proOnly: true },
  { url: "/appointments", cashierHidden: false, proOnly: true },
  { url: "/staff", cashierHidden: true },
  { url: "/rooms", cashierHidden: false, proOnly: true },
  { url: "/memberships", cashierHidden: false, proOnly: true },
  { url: "/products", cashierHidden: true },
  { url: "/customers", cashierHidden: true, proOnly: true },
  { url: "/transactions", cashierHidden: true },
  { url: "/analytics", cashierHidden: true, proOnly: true },
  { url: "/expenses", cashierHidden: true, proOnly: true },
  { url: "/suppliers", cashierHidden: true, proOnly: true },
  { url: "/purchases", cashierHidden: true, proOnly: true },
  { url: "/shifts", cashierHidden: false, proOnly: true },
  { url: "/timeclock", cashierHidden: false, proOnly: true },
  { url: "/discount-codes", cashierHidden: true, proOnly: true },
  { url: "/refunds", cashierHidden: true, managerOnly: true },
  { url: "/ai", cashierHidden: false, proOnly: true },
  { url: "/billing", cashierHidden: true },
  { url: "/settings", cashierHidden: false },
];

const ADMIN_NAV = [
  { label: "Overview", url: "/admin", icon: ShieldCheck },
  { label: "Branches", url: "/admin/branches", icon: Building2 },
  { label: "Team", url: "/admin/users", icon: Users },
  { label: "Analytics", url: "/admin/analytics", icon: BarChart3 },
] as const;

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: pendingOrders = [] } = usePendingOrders();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { isFree } = useSubscription();

  const role = user?.role ?? "cashier";
  const isCashier = role === "cashier";
  const isAdminOrAbove = role === "owner" || role === "manager" || role === "admin";
  const isManagerOrAbove = role === "owner" || role === "manager";

  const { hiddenUrls, primaryNavUrls, labels } = getBusinessFeatures(
    (settings as any)?.businessType,
    (settings as any)?.businessSubType,
  );

  const primaryNavItems = [
    { url: "/" as string },
    { url: primaryNavUrls[0] as string },
    { url: primaryNavUrls[1] as string },
  ].map((item) => {
    const config = URL_NAV_CONFIG[item.url] ?? { defaultLabel: item.url, icon: Home };
    return {
      url: item.url,
      label: labels[item.url] ?? config.defaultLabel,
      icon: config.icon,
    };
  });

  const primaryNavUrlSet = new Set(primaryNavItems.map((i) => i.url));

  const MORE_NAV = MORE_NAV_FULL.filter((i) => {
    if (primaryNavUrlSet.has(i.url)) return false;
    if (isFree && (i as any).proOnly) return false;
    if (isCashier && i.cashierHidden) return false;
    if ((i as any).managerOnly && !isManagerOrAbove) return false;
    if (hiddenUrls.has(i.url)) return false;
    return true;
  }).map((item) => {
    const config = URL_NAV_CONFIG[item.url] ?? { defaultLabel: item.url, icon: Home };
    return {
      url: item.url,
      label: labels[item.url] ?? config.defaultLabel,
      icon: config.icon,
    };
  });

  const pendingCount = (pendingOrders as any[]).filter(
    (o: any) => o.status !== "paid"
  ).length;

  const allMoreUrls = [...MORE_NAV.map((i) => i.url), ...ADMIN_NAV.map((i) => i.url)];
  const isMoreActive = allMoreUrls.some((url) => url === location);
  const primaryActiveIndex = primaryNavItems.findIndex((item) => item.url === location);
  const pillIndex = primaryActiveIndex === -1 ? (isMoreActive ? primaryNavItems.length : 0) : primaryActiveIndex;

  const hasMore = MORE_NAV.length > 0 || isAdminOrAbove;

  const navigate = (url: string) => {
    startTransition(() => setLocation(url));
    setMoreOpen(false);
  };

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)" }}
      >
        <div
          className="pointer-events-auto glass-nav mx-3 mb-1.5 rounded-[24px] px-1 py-1 flex items-center w-full relative"
          style={{ maxWidth: "480px" }}
        >
          {/* Sliding active pill */}
          <div
            className="absolute inset-y-1 pointer-events-none z-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              width: `calc((100% - 8px) / ${hasMore ? primaryNavItems.length + 1 : primaryNavItems.length})`,
              transform: `translateX(calc(${pillIndex} * 100%))`,
            }}
          >
            <div className="w-full h-full rounded-[18px] bg-primary/10 dark:bg-primary/15 glass-btn" />
          </div>

          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.url;
            const badge = item.url === "/pending" && pendingCount > 0 ? pendingCount : null;

            return (
              <button
                key={item.url}
                onClick={() => startTransition(() => setLocation(item.url))}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
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
                  {badge ? (
                    <span className="absolute -top-[6px] -right-[8px] bg-rose-500 text-white text-[8px] font-bold w-[13px] h-[13px] rounded-full flex items-center justify-center leading-none shadow-sm shadow-rose-500/40">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
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
                More
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* More Sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen} modal={false}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-[28px] p-0 border-t border-border bg-card"
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-muted-foreground/20" />
          </div>

          {MORE_NAV.length > 0 && (
            <div className="px-4 pt-3 pb-2">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-1 mb-3">
                More
              </p>
              <div className="grid grid-cols-4 gap-2">
                {MORE_NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.url;
                  return (
                    <button
                      key={item.url}
                      onClick={() => navigate(item.url)}
                      className={[
                        "flex flex-col items-center justify-center gap-2 py-5 rounded-2xl transition-all duration-200 active:scale-95 border",
                        isActive
                          ? "bg-primary/10 border-primary/20 text-primary"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isAdminOrAbove && (
            <div className="px-4 pt-2 pb-2">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-1 mb-3">
                Admin
              </p>
              <div className="grid grid-cols-4 gap-2">
                {ADMIN_NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.url;
                  return (
                    <button
                      key={item.url}
                      onClick={() => navigate(item.url)}
                      className={[
                        "flex flex-col items-center justify-center gap-2 py-5 rounded-2xl transition-all duration-200 active:scale-95 border",
                        isActive
                          ? "bg-primary/10 border-primary/20 text-primary"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }} />
        </SheetContent>
      </Sheet>
    </>
  );
}
