import { Link, useLocation } from "wouter";
import {
  ShoppingCart,
  Clock,
  Package,
  Settings,
} from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { usePendingOrders } from "@/hooks/use-pending-orders";

interface NavItem {
  label: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function BottomNav() {
  const [location] = useLocation();
  const { data: products = [] } = useProducts();
  const { data: pendingOrders = [] } = usePendingOrders();
  
  // Count pending orders
  const pendingCount = pendingOrders.filter((o: any) => o.status !== "paid").length;
  
  const navItems: NavItem[] = [
    {
      label: "POS",
      url: "/pos",
      icon: ShoppingCart,
    },
    {
      label: "Pending",
      url: "/pending",
      icon: Clock,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      label: "Products",
      url: "/products",
      icon: Package,
      badge: products.length > 0 ? products.length : undefined,
    },
    {
      label: "Settings",
      url: "/settings",
      icon: Settings,
    },
  ];

  return (
    <nav className="fixed bottom-4 left-4 right-4 z-50 md:bottom-8 md:left-auto md:right-auto md:w-auto">
      <div className="flex justify-center">
        <div className="w-full md:w-auto bg-white/40 dark:bg-white/10 backdrop-blur-2xl rounded-[32px] border border-white/60 dark:border-white/20 shadow-2xl p-4">
          {/* Nav items */}
          <div className="flex items-center justify-around gap-6">
            {navItems.map((item) => {
              const isActive = location === item.url;
              const Icon = item.icon;
              
              return (
                <Link key={item.url} href={item.url}>
                  <a className="relative flex flex-col items-center gap-2 px-4 py-2 rounded-2xl transition-all duration-300 group hover:bg-white/20 dark:hover:bg-white/5">
                    {/* Animated background for active state */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-2xl bg-primary/20 dark:bg-primary/30"></div>
                    )}
                    
                    {/* Icon container */}
                    <div className="relative">
                      <Icon
                        className={`h-6 w-6 transition-all duration-300 ${
                          isActive
                            ? "text-primary scale-110"
                            : "text-foreground/60 group-hover:text-foreground"
                        }`}
                      />
                      
                      {/* Badge */}
                      {item.badge && (
                        <div className="absolute -top-3 -right-3 flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-lg animate-pulse">
                          {item.badge > 99 ? "99+" : item.badge}
                        </div>
                      )}
                    </div>
                    
                    {/* Label */}
                    <span
                      className={`text-xs font-semibold transition-all duration-300 ${
                        isActive
                          ? "text-primary"
                          : "text-foreground/60 group-hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </span>
                  </a>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
