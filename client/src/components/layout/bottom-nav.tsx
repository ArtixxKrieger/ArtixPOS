import { useLocation } from "wouter";
import { Home, ShoppingCart, Clock, Package, Settings, BarChart3 } from "lucide-react";
import { usePendingOrders } from "@/hooks/use-pending-orders";

const NAV_ITEMS = [
  { label: "Home", url: "/", icon: Home },
  { label: "POS", url: "/pos", icon: ShoppingCart },
  { label: "Pending", url: "/pending", icon: Clock },
  { label: "Products", url: "/products", icon: Package },
  { label: "Analytics", url: "/analytics", icon: BarChart3 },
  { label: "Settings", url: "/settings", icon: Settings },
] as const;

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { data: pendingOrders = [] } = usePendingOrders();

  const pendingCount = (pendingOrders as any[]).filter(
    (o: any) => o.status !== "paid"
  ).length;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)" }}
    >
      <div
        className="pointer-events-auto glass-nav mx-3 mb-1.5 rounded-[24px] px-1 py-1 flex items-center w-full"
        style={{ maxWidth: "480px" }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.url;
          const badge = item.label === "Pending" && pendingCount > 0 ? pendingCount : null;

          return (
            <button
              key={item.url}
              onClick={() => setLocation(item.url)}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={[
                "relative flex flex-col items-center justify-center gap-[2px] rounded-[18px] flex-1",
                "transition-all duration-200 active:scale-90 select-none cursor-pointer py-2",
                isActive
                  ? "glass-btn text-primary"
                  : "text-foreground/40 dark:text-white/35 hover:text-foreground/70 dark:hover:text-white/65",
              ].join(" ")}
            >
              {isActive && (
                <span className="absolute inset-0 rounded-[18px] bg-primary/10 dark:bg-primary/15" />
              )}

              <div className="relative z-10">
                <Icon
                  className={[
                    "h-[17px] w-[17px] transition-all duration-200",
                    isActive ? "scale-110 stroke-[2.2px]" : "scale-100 stroke-[1.8px]",
                  ].join(" ")}
                />
                {badge ? (
                  <span className="absolute -top-[6px] -right-[8px] bg-rose-500 text-white text-[8px] font-bold w-[13px] h-[13px] rounded-full flex items-center justify-center leading-none shadow-sm shadow-rose-500/40">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </div>

              <span
                className={[
                  "text-[8px] leading-none tracking-wide z-10 transition-all duration-200",
                  isActive ? "font-semibold opacity-100" : "font-medium opacity-55",
                ].join(" ")}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
