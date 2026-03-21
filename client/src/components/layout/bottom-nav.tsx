import { useLocation } from "wouter";
import { Home, ShoppingCart, Clock, Package, Settings } from "lucide-react";
import { usePendingOrders } from "@/hooks/use-pending-orders";

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { data: pendingOrders = [] } = usePendingOrders();

  const pendingCount = (pendingOrders as any[]).filter(
    (o: any) => o.status !== "paid"
  ).length;

  const navItems = [
    { label: "Home", url: "/", icon: Home, badge: null },
    { label: "POS", url: "/pos", icon: ShoppingCart, badge: null },
    { label: "Pending", url: "/pending", icon: Clock, badge: pendingCount > 0 ? pendingCount : null },
    { label: "Products", url: "/products", icon: Package, badge: null },
    { label: "Settings", url: "/settings", icon: Settings, badge: null },
  ];

  return (
    <nav className="md:hidden fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto glass-nav rounded-[28px] px-2 py-2 flex items-center gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.url;

          return (
            <button
              key={item.url}
              onClick={() => setLocation(item.url)}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={`relative flex flex-col items-center justify-center gap-1.5 px-4 py-2.5 rounded-[20px] 
                transition-all duration-150 active:scale-90 active:opacity-70 min-w-[60px]
                select-none cursor-pointer
                ${isActive
                  ? "bg-primary/15 dark:bg-primary/20 text-primary"
                  : "text-foreground/50 hover:text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 transition-transform duration-150 ${isActive ? "scale-110" : "scale-100"}`} />
                {item.badge ? (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none shadow-sm">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </div>
              <span className={`text-[10px] leading-none transition-all duration-150 ${isActive ? "font-semibold" : "font-medium"}`}>
                {item.label}
              </span>

              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
