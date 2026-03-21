import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Moon, Sun, Menu, ShoppingCart, Clock, Package, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useSettings } from "@/hooks/use-settings";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { BottomNav } from "./bottom-nav";

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  // default: system preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useSettings();
  const { data: pendingOrders = [] } = usePendingOrders();
  const [isDark, setIsDark] = useState(getInitialDark);
  const [menuOpen, setMenuOpen] = useState(false);

  const pendingCount = (pendingOrders as any[]).filter((o: any) => o.status !== "paid").length;

  // Apply theme class whenever isDark changes
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  // Apply theme on first paint before React hydrates (avoids flash)
  useEffect(() => {
    const dark = getInitialDark();
    setIsDark(dark);
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

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
      {/* Glass Header */}
      <header className="sticky top-0 z-40 glass-header">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          {/* Store name */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-[10px] bg-primary flex items-center justify-center shadow-md shadow-primary/30">
              <span className="text-white text-sm font-bold">
                {(settings?.storeName || "C")[0]}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">
                {settings?.storeName || "Café Bara"}
              </p>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5 hidden md:block">
                {getPageTitle()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              className="h-8 w-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              data-testid="button-theme-toggle"
            >
              {isDark
                ? <Sun className="h-4 w-4 text-amber-400" />
                : <Moon className="h-4 w-4 text-slate-500" />
              }
            </Button>

            {/* Hamburger — desktop only */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:flex h-8 w-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  data-testid="button-menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-72 p-0 bg-white/80 dark:bg-black/80 backdrop-blur-2xl border-l border-black/10 dark:border-white/10"
              >
                <div className="px-5 pt-8 pb-5 border-b border-black/10 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-[12px] bg-primary flex items-center justify-center shadow-md shadow-primary/30">
                      <span className="text-white font-bold">
                        {(settings?.storeName || "C")[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{settings?.storeName || "Café Bara"}</p>
                      <p className="text-xs text-muted-foreground">POS System</p>
                    </div>
                  </div>
                </div>

                <nav className="p-3 space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.url;
                    return (
                      <button
                        key={item.url}
                        onClick={() => navigate(item.url)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-primary/10 dark:bg-primary/15 text-primary"
                            : "text-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span>{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pb-28 md:pb-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          {children}
        </div>
      </main>

      {/* Floating Glass Pill Nav — mobile only */}
      <BottomNav />
    </div>
  );
}
