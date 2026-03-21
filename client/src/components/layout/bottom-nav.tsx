import { useLocation } from "wouter";
import { ShoppingCart, Clock, Package, Settings } from "lucide-react";
import { usePendingOrders } from "@/hooks/use-pending-orders";

export function BottomNav() {
  const [location] = useLocation();
  const { data: pendingOrders = [] } = usePendingOrders();

  const pendingCount = pendingOrders.filter(
    (o: any) => o.status !== "paid"
  ).length;

  const navItems = [
    { label: "POS", url: "/pos", icon: ShoppingCart, badge: null },
    {
      label: "Pending",
      url: "/pending",
      icon: Clock,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    { label: "Products", url: "/products", icon: Package, badge: null },
    { label: "Settings", url: "/settings", icon: Settings, badge: null },
  ];

  return (
    <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 bg-card/80 dark:bg-card/90 backdrop-blur-2xl rounded-full border border-border shadow-2xl shadow-black/40 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.url;

          return (
            <a
              key={item.url}
              href={item.url}
              className={`relative flex flex-col items-center justify-center gap-1 px-4 py-2.5 rounded-full transition-all duration-200 ${
                isActive
                  ? "bg-primary/15 dark:bg-primary/20 text-primary dark:shadow-[0_0_12px_hsl(var(--primary)/0.3)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "dark:drop-shadow-[0_0_6px_hsl(var(--primary))]" : ""}`} />
              {item.badge ? (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
              <span className={`text-[10px] font-semibold tracking-wide ${isActive ? "font-mono" : ""}`}>
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
