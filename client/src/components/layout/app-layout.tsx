import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";
import { BottomNav } from "./bottom-nav";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: settings } = useSettings();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (document.documentElement.classList.contains("dark")) {
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

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

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-black bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {settings?.storeName || "Café Bara"}
            </h1>
            <span className="hidden md:block text-sm text-muted-foreground font-medium">
              {getPageTitle()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full hover:bg-primary/10 transition-colors"
              data-testid="button-theme-toggle"
            >
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white font-bold shadow-lg">
              {settings?.storeName?.[0] || "C"}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pb-32 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
