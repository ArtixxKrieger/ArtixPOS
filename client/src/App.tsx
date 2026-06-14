import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, setNativeToken, NATIVE_TOKEN_KEY, apiRequest } from "./lib/queryClient";
import { LogOut, ShoppingCart } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useEffect, useState, useRef, Suspense, ReactNode } from "react";
import { BlePrinterProvider } from "@/lib/ble-printer-context";
import { initRevenueCat } from "@/lib/revenuecat";
import { prefetchBootstrapData, clearPrefetchCache } from "@/lib/prefetch";
import { initUserSession, clearAllCache } from "@/lib/offline-db";
import { debugLog } from "@/lib/debug-log";
import { ErrorBoundary } from "@/components/error-boundary";
import { useBranchTheme } from "@/hooks/use-branch-theme";
import { AppTour } from "@/components/app-tour";

import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import VerifyEmail from "@/pages/verify-email";
import NotFound from "@/pages/not-found";
import BranchPublicPage from "@/pages/branch-public";
import StaffPinLogin from "@/pages/staff-pin-login";

import {
  Dashboard,
  POS,
  Products,
  Analytics,
  PendingOrders,
  Settings,
  KitchenDisplayPage,
  TimeClockPage,
  Onboarding,
  TermsPage,
  PrivacyPage,
  IngredientsPage,
  VercelAnalytics,
  PRIORITY_LAZY_ROUTES,
  DEFERRED_LAZY_ROUTES,
} from "@/lib/lazy-pages";

import {
  CashierGuard,
  POSWithSetupGuard,
  ProGuard,
  TransactionsRoute,
  AdminRoute,
  AdminBranchesRoute,
  AdminUsersRoute,
  AdminAnalyticsRoute,
  AdminAuditLogsRoute,
  AdminPermissionsRoute,
  CustomersRoute,
  ExpensesRoute,
  ShiftsRoute,
  DiscountCodesRoute,
  RefundsRoute,
  TablesRoute,
  KitchenRoute,
  SuppliersRoute,
  PurchasesRoute,
  TimeClockRoute,
  AppointmentsRoute,
  StaffRoute,
  RoomsRoute,
  MembershipsRoute,
  PrintSettingsRoute,
  HardwareSettingsRoute,
  LoyaltyRoute,
  WifiVouchersRoute,
  PayrollRoute,
  SchedulesRoute,
  BIRRoute,
  BIRAuditLogRoute,
  ExpiryRoute,
  InventoryRoute,
  BillingRoute,
  FeaturesRoute,
} from "@/lib/route-guards";

const INVITE_STORAGE_KEY = "artixpos_pending_invite";
const OAUTH_FLOW_KEY = "artixpos_oauth_flow";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function handleAuthDeepLink(url: string) {
  debugLog("deeplink", `handleAuthDeepLink: ${url.slice(0, 80)}`);
  if (!url.startsWith("com.artixpos.app://auth")) {
    debugLog("deeplink", `URL doesn't match scheme — ignored`);
    return;
  }
  const qs = url.includes("?") ? url.split("?")[1] : "";
  const token = new URLSearchParams(qs).get("token");
  if (!token) {
    debugLog("deeplink", "no token in URL params");
    return;
  }

  debugLog("deeplink", `token received (length=${token.length}) — storing`);

  const previousToken = localStorage.getItem(NATIVE_TOKEN_KEY);
  const previousPayload = previousToken ? decodeJwtPayload(previousToken) : null;
  const newPayload = decodeJwtPayload(token);
  debugLog(
    "deeplink",
    `jwt payload: id=${newPayload?.id ?? "null"} exp=${newPayload?.exp ?? "null"}`,
  );

  if (previousPayload?.id && newPayload?.id && previousPayload.id !== newPayload.id) {
    debugLog(
      "deeplink",
      `account switch detected (${previousPayload.id} → ${newPayload.id}) — clearing cache`,
    );
    clearAllCache().catch(() => {});
    queryClient.clear();
  }

  setNativeToken(token);

  if (newPayload?.id) {
    const user = {
      id: newPayload.id,
      name: newPayload.name ?? null,
      email: newPayload.email ?? null,
      avatar: newPayload.avatar ?? null,
      provider: newPayload.provider ?? "unknown",
    };
    queryClient.setQueryData(["auth-me"], user);
    debugLog("deeplink", `auth cache set immediately — user=${user.id}`);
  } else {
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    debugLog("deeplink", "auth-me query invalidated — waiting for re-fetch");
  }
}

function useNativeDeepLink() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function setup() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        const platform = Capacitor.getPlatform();
        debugLog("deeplink", `platform=${platform} isNative=${Capacitor.isNativePlatform()}`);

        if (!Capacitor.isNativePlatform()) {
          debugLog("deeplink", "not native — skipping deep link setup");
          return;
        }

        const { App: CapApp } = await import("@capacitor/app");
        const { Browser } = await import("@capacitor/browser");

        debugLog("deeplink", "registering appUrlOpen listener");

        const launch = await CapApp.getLaunchUrl();
        debugLog("deeplink", `getLaunchUrl=${JSON.stringify(launch)}`);
        if (launch?.url) {
          debugLog("deeplink", `cold-launch deep link: ${launch.url}`);
          handleAuthDeepLink(launch.url);
        }

        const handle = await CapApp.addListener("appUrlOpen", async (data) => {
          debugLog("deeplink", `appUrlOpen fired: ${data.url}`);
          try {
            await Browser.close();
          } catch (e) {
            debugLog("deeplink", `Browser.close error: ${e}`);
          }
          handleAuthDeepLink(data.url);
        });

        debugLog("deeplink", "listener registered OK");
        cleanup = () => {
          handle.remove();
        };
      } catch (err) {
        debugLog("deeplink", `setup error: ${err}`);
      }
    }

    setup();
    return () => {
      cleanup?.();
    };
  }, []);
}

function LoadingScreen({ message: _message }: { message?: string }) {
  const [offlineStall, setOfflineStall] = useState(false);
  const [slowStall, setSlowStall] = useState(false);

  useEffect(() => {
    const offlineId = setTimeout(() => {
      if (!navigator.onLine) setOfflineStall(true);
    }, 4_000);
    const slowId = setTimeout(() => {
      if (navigator.onLine) setSlowStall(true);
    }, 12_000);
    return () => {
      clearTimeout(offlineId);
      clearTimeout(slowId);
    };
  }, []);

  if (offlineStall) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810] px-6">
        <div className="max-w-xs w-full text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 8v4m0 4h.01"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">You're offline</h2>
          <p className="text-sm text-slate-500 dark:text-white/60">
            This page hasn't been downloaded yet. Connect to the internet and it will be available
            offline from then on.
          </p>
          <div className="flex gap-2 justify-center pt-1">
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Go back
            </button>
            <button
              onClick={() => {
                setOfflineStall(false);
                window.location.reload();
              }}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (slowStall) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810] px-6">
        <div className="max-w-xs w-full text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-violet-600 dark:text-violet-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            Taking longer than expected
          </h2>
          <p className="text-sm text-slate-500 dark:text-white/60">
            The server is taking a while to respond. This can happen on slow connections or after a
            period of inactivity.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}

const PINNED_PATHS = new Set(["/", "/pos", "/pending", "/settings", "/analytics", "/products"]);

function PersistentRoute({
  path,
  currentPath,
  children,
}: {
  path: string;
  currentPath: string;
  children: ReactNode;
}) {
  const activated = useRef(false);
  if (currentPath === path) activated.current = true;
  if (!activated.current) return null;
  const hidden = currentPath !== path;
  return (
    <div aria-hidden={hidden || undefined} style={hidden ? { display: "none" } : undefined}>
      {children}
    </div>
  );
}

function useRoutePreloader() {
  useEffect(() => {
    if (!navigator.onLine) return;

    const ric = window.requestIdleCallback;

    const scheduleP = ric
      ? (cb: () => void) => ric(cb, { timeout: 3000 })
      : (cb: () => void) => setTimeout(cb, 1500);

    const handle1 = scheduleP(() => {
      PRIORITY_LAZY_ROUTES.forEach((load) => load().catch(() => {}));
    });

    const timer = setTimeout(() => {
      const scheduleD = ric
        ? (cb: () => void) => ric(cb, { timeout: 10_000 })
        : (cb: () => void) => setTimeout(cb, 0);

      const chunkSize = 5;
      DEFERRED_LAZY_ROUTES.forEach((load, i) => {
        const delay = Math.floor(i / chunkSize) * 800;
        setTimeout(() => scheduleD(() => load().catch(() => {})), delay);
      });
    }, 4000);

    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle1 as number);
      clearTimeout(timer);
    };
  }, []);
}

const pageFallback = null;

function AppRouter() {
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useSettings();
  const { user } = useAuth();
  const [location] = useLocation();
  useRoutePreloader();
  useBranchTheme();

  const settingsEverLoaded = useRef(settings !== undefined);
  if (!settingsEverLoaded.current && settings !== undefined) {
    settingsEverLoaded.current = true;
  }

  const [settingsTimedOut, setSettingsTimedOut] = useState(false);
  useEffect(() => {
    if (settingsEverLoaded.current || !settingsLoading) return;
    const t = setTimeout(() => setSettingsTimedOut(true), 4_000);
    return () => clearTimeout(t);
  }, [settingsLoading]);

  useEffect(() => {
    document
      .getElementById("app-scroll")
      ?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location]);

  if (!settingsEverLoaded.current && settingsLoading && !settingsTimedOut) {
    return <LoadingScreen />;
  }

  const onboardedKey = user?.id ? `artix-onboarded-${user.id}` : null;
  const alreadyOnboarded = onboardedKey ? localStorage.getItem(onboardedKey) === "1" : false;

  if (onboardedKey && settings?.onboardingComplete) {
    localStorage.setItem(onboardedKey, "1");
  }

  const needsOnboarding =
    !settingsError &&
    settings !== undefined &&
    settings !== null &&
    !settings?.onboardingComplete &&
    !alreadyOnboarded &&
    !user?.tenantId;

  if (needsOnboarding && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  if (!needsOnboarding && location === "/onboarding") {
    return <Redirect to="/" />;
  }

  if (location === "/onboarding") {
    return (
      <Suspense fallback={pageFallback}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <AppTour />
      <PersistentRoute path="/" currentPath={location}>
        <Suspense fallback={pageFallback}>
          <Dashboard />
        </Suspense>
      </PersistentRoute>
      <PersistentRoute path="/pos" currentPath={location}>
        <Suspense fallback={pageFallback}>
          <POSWithSetupGuard />
        </Suspense>
      </PersistentRoute>
      <PersistentRoute path="/pending" currentPath={location}>
        <Suspense fallback={pageFallback}>
          <PendingOrders />
        </Suspense>
      </PersistentRoute>
      <PersistentRoute path="/settings" currentPath={location}>
        <Suspense fallback={pageFallback}>
          <Settings />
        </Suspense>
      </PersistentRoute>
      <PersistentRoute path="/analytics" currentPath={location}>
        <Suspense fallback={pageFallback}>
          <CashierGuard component={Analytics} />
        </Suspense>
      </PersistentRoute>
      <PersistentRoute path="/products" currentPath={location}>
        <Suspense fallback={pageFallback}>
          <Products />
        </Suspense>
      </PersistentRoute>

      {!PINNED_PATHS.has(location) && (
        <Suspense fallback={pageFallback}>
          <Switch>
            <Route path="/transactions" component={TransactionsRoute} />
            <Route path="/admin" component={AdminRoute} />
            <Route path="/admin/branches" component={AdminBranchesRoute} />
            <Route path="/admin/users" component={AdminUsersRoute} />
            <Route path="/admin/analytics" component={AdminAnalyticsRoute} />
            <Route path="/admin/audit-logs" component={AdminAuditLogsRoute} />
            <Route path="/admin/permissions" component={AdminPermissionsRoute} />
            <Route path="/customers" component={CustomersRoute} />
            <Route path="/expenses" component={ExpensesRoute} />
            <Route path="/shifts" component={ShiftsRoute} />
            <Route path="/discount-codes" component={DiscountCodesRoute} />
            <Route path="/refunds" component={RefundsRoute} />
            <Route path="/tables" component={TablesRoute} />
            <Route path="/kitchen" component={KitchenRoute} />
            <Route path="/suppliers" component={SuppliersRoute} />
            <Route path="/purchases" component={PurchasesRoute} />
            <Route path="/timeclock" component={TimeClockRoute} />
            <Route path="/appointments" component={AppointmentsRoute} />
            <Route path="/staff" component={StaffRoute} />
            <Route path="/rooms" component={RoomsRoute} />
            <Route path="/memberships" component={MembershipsRoute} />
            <Route path="/print-settings" component={PrintSettingsRoute} />
            <Route path="/hardware-settings" component={HardwareSettingsRoute} />
            <Route path="/loyalty" component={LoyaltyRoute} />
            <Route path="/wifi-vouchers" component={WifiVouchersRoute} />
            <Route path="/payroll" component={PayrollRoute} />
            <Route path="/schedules" component={SchedulesRoute} />
            <Route path="/bir" component={BIRRoute} />
            <Route path="/bir-audit-log" component={BIRAuditLogRoute} />
            <Route path="/expiry" component={ExpiryRoute} />
            <Route path="/inventory" component={InventoryRoute} />
            <Route
              path="/ingredients"
              component={() => <ProGuard url="/ingredients" component={IngredientsPage} />}
            />
            <Route path="/billing" component={BillingRoute} />
            <Route path="/features" component={FeaturesRoute} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      )}
    </AppLayout>
  );
}

function PinSessionApp() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [location, setLocation] = useLocation();
  const [clockingOut, setClockingOut] = useState(false);
  const storeName = (settings as any)?.storeName ?? "ArtixPOS";

  const isEmployeeOnly = user?.role === "staff";

  useEffect(() => {
    const target = isEmployeeOnly ? "/timeclock" : "/pos";
    if (location !== target) setLocation(target);
  }, [location, setLocation, isEmployeeOnly]);

  async function handleClockOut() {
    setClockingOut(true);
    try {
      await apiRequest("POST", "/api/staff-pin/clockout");
    } catch {
    }
    queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (q) => (q.queryKey[0] as string) !== "auth-me" });
    await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    setLocation("/staff-clock-in");
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-background shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <ShoppingCart className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold text-foreground">{storeName}</span>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[11px] font-bold shrink-0">
                {(user.name ?? "?")[0].toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground leading-tight">{user.name}</p>
                <p className="text-[10px] text-muted-foreground capitalize leading-tight">
                  {user.role === "staff" ? "Employee" : user.role}
                </p>
              </div>
            </div>
          )}
          {!isEmployeeOnly && (
            <button
              onClick={handleClockOut}
              disabled={clockingOut}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-all duration-150 disabled:opacity-50"
            >
              <LogOut className="w-3 h-3" />
              {clockingOut ? "Clocking out…" : "Clock Out"}
            </button>
          )}
        </div>
      </div>
      <div
        className={
          isEmployeeOnly ? "flex-1 min-h-0 overflow-auto" : "flex-1 min-h-0 overflow-hidden"
        }
      >
        <Suspense fallback={pageFallback}>{isEmployeeOnly ? <TimeClockPage /> : <POS />}</Suspense>
      </div>
    </div>
  );
}

function ProtectedRouter() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();
  const [redeemingInvite, setRedeemingInvite] = useState(false);

  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    if (prevUserIdRef.current !== null && prevUserIdRef.current !== user.id) {
      queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth-me" });
      clearPrefetchCache();
    }
    prevUserIdRef.current = user.id;

    initUserSession(user.id)
      .then(() => prefetchBootstrapData(user.id))
      .catch(() => {});
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId) return;
    initRevenueCat(user.tenantId).catch((e) => console.warn("[revenuecat] init error:", e));
  }, [isAuthenticated, user?.tenantId]);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth-me" });
      clearAllCache().catch(() => {});
      clearPrefetchCache();
      prevUserIdRef.current = null;
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    sessionStorage.removeItem(OAUTH_FLOW_KEY);

    const pendingInvite = localStorage.getItem(INVITE_STORAGE_KEY);
    if (!pendingInvite) return;

    setRedeemingInvite(true);
    localStorage.removeItem(INVITE_STORAGE_KEY);
    apiRequest("POST", "/api/admin/invite/redeem", { token: pendingInvite })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (data.ok) {
          if (data.token) {
            setNativeToken(data.token);
          }
          await apiRequest("PUT", "/api/settings", { onboardingComplete: 1 }).catch(() => {});
          await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        } else {
          sessionStorage.setItem(
            "invite_error",
            data.message || "This invite link is invalid or has already been used.",
          );
        }
      })
      .catch(() => {
        sessionStorage.setItem("invite_error", "Could not connect. Please try again.");
      })
      .finally(() => setRedeemingInvite(false));
  }, [isAuthenticated, isLoading]);

  if (redeemingInvite) {
    return <LoadingScreen message="Joining your team…" />;
  }
  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (location === "/kitchen-display") {
    return (
      <Suspense fallback={pageFallback}>
        <KitchenDisplayPage />
      </Suspense>
    );
  }

  if (location === "/staff-clock-in") {
    return <StaffPinLogin />;
  }

  if (user?.pinSession && user?.role !== "owner") {
    return <PinSessionApp />;
  }

  return <AppRouter />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route
        path="/terms"
        component={() => (
          <Suspense fallback={null}>
            <TermsPage />
          </Suspense>
        )}
      />
      <Route
        path="/privacy"
        component={() => (
          <Suspense fallback={null}>
            <PrivacyPage />
          </Suspense>
        )}
      />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/b/:id" component={BranchPublicPage} />
      <Route path="/staff-clock-in" component={StaffPinLogin} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route component={ProtectedRouter} />
    </Switch>
  );
}

function useGlobalDarkMode() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const stored = localStorage.getItem("theme");
    const isDark = stored === "dark" || (!stored && mq.matches);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
}

function App() {
  useNativeDeepLink();
  useGlobalDarkMode();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BlePrinterProvider>
            <Router />
            <Toaster />
          </BlePrinterProvider>
        </TooltipProvider>
      </QueryClientProvider>
      {}
      {import.meta.env.PROD && (
        <Suspense fallback={null}>
          <VercelAnalytics />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}

export default App;
