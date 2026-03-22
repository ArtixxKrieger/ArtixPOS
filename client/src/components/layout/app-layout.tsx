import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Moon, Sun, Menu, Home, ShoppingCart, Clock, Package, Settings, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/toaster";
import { useSettings } from "@/hooks/use-settings";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { BottomNav } from "./bottom-nav";

const NAV_ITEMS = [
  { label: "Dashboard", url: "/", icon: Home },
  { label: "POS", url: "/pos", icon: ShoppingCart },
  { label: "Pending", url: "/pending", icon: Clock },
  { label: "Products", url: "/products", icon: Package },
  { label: "Analytics", url: "/analytics", icon: BarChart3 },
  { label: "Settings", url: "/settings", icon: Settings },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/pos": "Point of Sale",
  "/pending": "Pending Orders",
  "/products": "Products",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useSettings();
  const { data: pendingOrders = [] } = usePendingOrders();
  const [isDark, setIsDark] = useState(getInitialDark);
  const [menuOpen, setMenuOpen] = useState(false);

  const pendingCount = (pendingOrders as any[]).filter((o: any) => o.status !== "paid").length;
  const storeName = settings?.storeName || "Café Bara";
  const storeInitial = storeName[0].toUpperCase();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const dark = getInitialDark();
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const navigate = (url: string) => {
    setLocation(url);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <Toaster />
      {/* Glass Header */}
      <header className="sticky top-0 z-40 glass-header">
        <div
          className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between gap-3"
          style={{ height: "56px" }}
        >
          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-[10px] bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <span className="text-white text-sm font-bold">{storeInitial}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none truncate">{storeName}</p>
              <p className="text-[10px] text-muted-foreground/70 leading-none mt-[3px] tracking-wide uppercase">
                {PAGE_TITLES[location] || "POS"}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="glass"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              className="h-8 w-8 rounded-full"
              data-testid="button-theme-toggle"
            >
              {isDark
                ? <Sun className="h-[15px] w-[15px] text-amber-400" />
                : <Moon className="h-[15px] w-[15px] text-slate-500" />
              }
            </Button>

            {/* Desktop nav trigger */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="glass"
                  size="icon"
                  className="hidden md:flex h-8 w-8 rounded-full"
                  data-testid="button-menu"
                >
                  <Menu className="h-[15px] w-[15px]" />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="right"
                className="w-72 p-0 border-l border-white/[0.06]"
                style={{
                  background: "rgba(6, 10, 26, 0.88)",
                  backdropFilter: "blur(40px) saturate(200%)",
                  WebkitBackdropFilter: "blur(40px) saturate(200%)",
                }}
              >
                <div className="px-5 pt-8 pb-5 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-[12px] bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                      <span className="text-white font-bold">{storeInitial}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-white">{storeName}</p>
                      <p className="text-[10px] text-white/40 tracking-wide uppercase mt-0.5">POS System</p>
                    </div>
                  </div>
                </div>

                <nav className="p-3 space-y-0.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.url;
                    const badge = item.label === "Pending" && pendingCount > 0 ? pendingCount : null;
                    return (
                      <button
                        key={item.url}
                        onClick={() => navigate(item.url)}
                        className={[
                          "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-primary/15 text-primary border border-primary/15"
                            : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                        {badge ? (
                          <span className="ml-auto bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm shadow-rose-500/40">
                            {badge > 9 ? "9+" : badge}
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
      <main className="pb-[calc(80px+env(safe-area-inset-bottom,0px))] md:pb-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          {children}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
