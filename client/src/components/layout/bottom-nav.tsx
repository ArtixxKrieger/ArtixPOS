import { useLocation } from "wouter";
import { Home, ShoppingCart, Clock, Package, Settings } from "lucide-react";
import { usePendingOrders } from "@/hooks/use-pending-orders";

const NAV_ITEMS = [
  { label: "Home", url: "/", icon: Home },
  { label: "POS", url: "/pos", icon: ShoppingCart },
  { label: "Pending", url: "/pending", icon: Clock },
  { label: "Products", url: "/products", icon: Package },
  { label: "Settings", url: "/settings", icon: Settings },
] as const;

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { data: pendingOrders = [] } = usePendingOrders();

  const pendingCount = (pendingOrders as any[]).filter(
    (o: any) => o.status !== "paid"
  ).length;

  return (
    <nav className="md:hidden fixed bottom-5 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
      <div className="pointer-events-auto glass-nav rounded-[32px] px-1.5 py-1.5 flex items-center gap-0.5">
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
                "relative flex flex-col items-center justify-center gap-1 px-3.5 py-2.5 rounded-[24px]",
                "transition-all duration-200 active:scale-90 select-none cursor-pointer min-w-[58px]",
                isActive
                  ? "glass-btn text-primary"
                  : "text-white/30 dark:text-white/30 hover:text-white/60",
              ].join(" ")}
            >
              {isActive && (
                <span className="absolute inset-0 rounded-[24px] bg-primary/10 dark:bg-primary/15" />
              )}

              <div className="relative z-10">
                <Icon
                  className={[
                    "h-[18px] w-[18px] transition-all duration-200",
                    isActive ? "scale-110 stroke-[2.2px]" : "scale-100 stroke-[1.8px]",
                  ].join(" ")}
                />
                {badge ? (
                  <span className="absolute -top-2 -right-2.5 bg-rose-500 text-white text-[9px] font-bold w-[14px] h-[14px] rounded-full flex items-center justify-center leading-none shadow-sm shadow-rose-500/40">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </div>

              <span
                className={[
                  "text-[9px] leading-none tracking-wide z-10 transition-all duration-200",
                  isActive ? "font-semibold opacity-100" : "font-medium opacity-60",
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
