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
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-md px-4 pb-4">
        {/* Glassmorphism nav bar */}
        <div className="relative">
          {/* Backdrop blur container */}
          <div className="absolute inset-0 rounded-full bg-white/30 dark:bg-white/10 backdrop-blur-xl border border-white/40 dark:border-white/20 shadow-lg"></div>
          
          {/* Nav items */}
          <div className="relative flex items-center justify-around p-3">
            {navItems.map((item) => {
              const isActive = location === item.url;
              const Icon = item.icon;
              
              return (
                <Link key={item.url} href={item.url}>
                  <a className="relative flex flex-col items-center gap-1 px-4 py-2 transition-all duration-300 group">
                    {/* Animated background circle for active state */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-full bg-primary/20 dark:bg-primary/30 scale-100 transition-transform duration-300"></div>
                    )}
                    
                    {/* Icon container */}
                    <div className="relative">
                      <Icon
                        className={`h-6 w-6 transition-all duration-300 ${
                          isActive
                            ? "text-primary scale-110"
                            : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      />
                      
                      {/* Badge */}
                      {item.badge && (
                        <div className="absolute -top-2 -right-2 flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/90 text-white dark:text-black text-xs font-bold shadow-lg animate-pulse">
                          {item.badge > 99 ? "99+" : item.badge}
                        </div>
                      )}
                    </div>
                    
                    {/* Label */}
                    <span
                      className={`text-xs font-semibold transition-all duration-300 ${
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
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
