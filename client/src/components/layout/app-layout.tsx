import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Moon, Sun, Menu, ShoppingCart, Clock, Package, Settings, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSettings } from "@/hooks/use-settings";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { BottomNav } from "./bottom-nav";

function initTheme() {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.documentElement.classList.remove("dark");
    return false;
  }
  document.documentElement.classList.add("dark");
  return true;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useSettings();
  const { data: pendingOrders = [] } = usePendingOrders();
  const [isDark, setIsDark] = useState(initTheme);
  const [menuOpen, setMenuOpen] = useState(false);

  const pendingCount = (pendingOrders as any[]).filter((o: any) => o.status !== "paid").length;

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const getPageTitle = () => {
    const titles: Record<string, string> = {
      "/pos": "Point of Sale",
      "/pending": "Pending Orders",
      "/products": "Products",
      "/settings": "Settings",
      "/": "Dashboard",
    };
    return titles[location] || "Café Bara";
  };

  const navItems = [
    { label: "POS", url: "/pos", icon: ShoppingCart, badge: null },
    { label: "Pending", url: "/pending", icon: Clock, badge: pendingCount > 0 ? pendingCount : null },
    { label: "Products", url: "/products", icon: Package, badge: null },
    { label: "Settings", url: "/settings", icon: Settings, badge: null },
  ];

  const navigate = (url: string) => {
    setLocation(url);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5 text-primary dark:drop-shadow-[0_0_6px_hsl(var(--primary))]" />
            <span className="font-mono font-bold text-lg text-foreground tracking-tight">
              <span className="text-primary dark:text-primary">
                {settings?.storeName || "Café Bara"}
              </span>
            </span>
            <span className="hidden md:block text-xs font-mono text-muted-foreground border border-border px-2 py-0.5 rounded">
              {getPageTitle()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              className="h-8 w-8 rounded-full"
              data-testid="button-theme-toggle"
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-primary" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* Hamburger — desktop only */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:flex h-8 w-8 rounded-full"
                  data-testid="button-menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-card/95 backdrop-blur-2xl border-l border-border p-0">
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                  <SheetTitle className="font-mono text-left flex items-center gap-2 text-primary">
                    <Terminal className="h-4 w-4" />
                    {settings?.storeName || "Café Bara"}
                  </SheetTitle>
                </SheetHeader>
                <nav className="p-4 space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.url;
                    return (
                      <button
                        key={item.url}
                        onClick={() => navigate(item.url)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 relative ${
                          isActive
                            ? "bg-primary/10 text-primary dark:bg-primary/15"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className={isActive ? "font-mono" : ""}>{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </nav>
                <div className="absolute bottom-6 left-0 right-0 px-6">
                  <p className="text-xs font-mono text-muted-foreground/40 text-center">
                    v1.0.0 // {settings?.storeName || "POS"}
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pb-28 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>

      {/* Floating Bottom Navigation — mobile only */}
      <BottomNav />
    </div>
  );
}
