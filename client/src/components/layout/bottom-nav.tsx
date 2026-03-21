import { useLocation } from "wouter";
import { ShoppingCart, Clock, Package, Settings } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { usePendingOrders } from "@/hooks/use-pending-orders";

export function BottomNav() {
  const [location] = useLocation();
  const { data: products = [] } = useProducts();
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
    {
      label: "Products",
      url: "/products",
      icon: Package,
      badge: products.length > 0 ? products.length : null,
    },
    { label: "Settings", url: "/settings", icon: Settings, badge: null },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-slate-950 border-t border-border/40 shadow-2xl">
      <div className="flex items-center justify-around max-w-xl mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.url;

          return (
            <a
              key={item.url}
              href={item.url}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-4 transition-colors ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon className="h-6 w-6" />
                {item.badge ? (
                  <span className="absolute -top-2 -right-2 bg-primary text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
