import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, setNativeToken, NATIVE_TOKEN_KEY, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { useEffect, useState, useRef, lazy, Suspense, ComponentType } from "react";
import { BlePrinterProvider } from "@/lib/ble-printer-context";
import { initRevenueCat } from "@/lib/revenuecat";
import { prefetchBootstrapData, clearPrefetchCache } from "@/lib/prefetch";
import { initUserSession } from "@/lib/offline-db";
import { debugLog } from "@/lib/debug-log";
import { clearAllCache } from "@/lib/offline-db";
import { isEssentialBusinessUrl } from "@shared/business-access";
import { ErrorBoundary } from "@/components/error-boundary";
import { useBranchTheme } from "@/hooks/use-branch-theme";

const INVITE_STORAGE_KEY = "artixpos_pending_invite";
const OAUTH_FLOW_KEY = "artixpos_oauth_flow";

import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import NotFound from "@/pages/not-found";
import BranchPublicPage from "@/pages/branch-public";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const POS = lazy(() => import("@/pages/pos"));
const Products = lazy(() => import("@/pages/products"));
const Analytics = lazy(() => import("@/pages/analytics"));
const PendingOrders = lazy(() => import("@/pages/pending-orders"));
const Settings = lazy(() => import("@/pages/settings"));
const Transactions = lazy(() => import("@/pages/transactions"));
const AdminIndex = lazy(() => import("@/pages/admin/index"));
const AdminBranches = lazy(() => import("@/pages/admin/branches"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));
const AdminAuditLogs = lazy(() => import("@/pages/admin/audit-logs"));
const AdminPermissions = lazy(() => import("@/pages/admin/permissions"));
const Customers = lazy(() => import("@/pages/customers"));
const Expenses = lazy(() => import("@/pages/expenses"));
const Shifts = lazy(() => import("@/pages/shifts"));
const DiscountCodes = lazy(() => import("@/pages/discount-codes"));
const Refunds = lazy(() => import("@/pages/refunds"));
const AiPage = lazy(() => import("@/pages/ai"));
const TablesPage = lazy(() => import("@/pages/tables"));
const KitchenPage = lazy(() => import("@/pages/kitchen"));
const KitchenDisplayPage = lazy(() => import("@/pages/kitchen-display"));
const SuppliersPage = lazy(() => import("@/pages/suppliers"));
const PurchasesPage = lazy(() => import("@/pages/purchases"));
const TimeClockPage = lazy(() => import("@/pages/timeclock"));
const Onboarding = lazy(() => import("@/pages/onboarding"));
const AppointmentsPage = lazy(() => import("@/pages/appointments"));
const StaffPage = lazy(() => import("@/pages/staff"));
const RoomsPage = lazy(() => import("@/pages/rooms"));
const MembershipsPage = lazy(() => import("@/pages/memberships"));
const BillingPage = lazy(() => import("@/pages/billing"));
const PrintSettings = lazy(() => import("@/pages/print-settings"));
const HardwareSettings = lazy(() => import("@/pages/hardware-settings"));
const LoyaltyPage = lazy(() => import("@/pages/loyalty"));
const WifiVouchersPage = lazy(() => import("@/pages/wifi-vouchers"));
const PayrollPage = lazy(() => import("@/pages/payroll"));
const BIRPage = lazy(() => import("@/pages/bir"));
const BIRAuditLogPage = lazy(() => import("@/pages/bir-audit-log"));
const ExpiryTrackerPage = lazy(() => import("@/pages/expiry-tracker"));
const InventoryHubPage = lazy(() => import("@/pages/inventory-hub"));
const VercelAnalytics = lazy(() =>
  import("@vercel/analytics/react").then((m) => ({ default: m.Analytics }))
);

/**
 * Extract and store the JWT token from an OAuth deep-link URL.
 * com.artixpos.app://auth?token=<jwt>
 */
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

  // If this login belongs to a DIFFERENT account than what was previously
  // stored, wipe the offline cache so no data bleeds across accounts.
  const previousToken = localStorage.getItem(NATIVE_TOKEN_KEY);
  const previousPayload = previousToken ? decodeJwtPayload(previousToken) : null;
  const newPayload = decodeJwtPayload(token);
  debugLog("deeplink", `jwt payload: id=${newPayload?.id ?? "null"} exp=${newPayload?.exp ?? "null"}`);

  if (previousPayload?.id && newPayload?.id && previousPayload.id !== newPayload.id) {
    debugLog("deeplink", `account switch detected (${previousPayload.id} → ${newPayload.id}) — clearing cache`);
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
    // Immediately set auth state from the JWT — no network round-trip needed
    queryClient.setQueryData(["auth-me"], user);
    debugLog("deeplink", `auth cache set immediately — user=${user.id}`);
  } else {
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    debugLog("deeplink", "auth-me query invalidated — waiting for re-fetch");
  }
}

/**
 * Handle OAuth deep links in both scenarios:
 *
 * 1. App was KILLED — OS launches it fresh via the deep link.
 *    Capacitor exposes the URL through getLaunchUrl(), not appUrlOpen.
 *    appUrlOpen fires only when the app is already running.
 *
 * 2. App was BACKGROUNDED — OS brings it to the foreground.
 *    Capacitor fires appUrlOpen with the URL.
 */
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

        // Case 1: app was cold-launched from the deep link
        const launch = await CapApp.getLaunchUrl();
        debugLog("deeplink", `getLaunchUrl=${JSON.stringify(launch)}`);
        if (launch?.url) {
          debugLog("deeplink", `cold-launch deep link: ${launch.url}`);
          handleAuthDeepLink(launch.url);
        }

        // Case 2: app was already running (backgrounded), brought to front
        const handle = await CapApp.addListener("appUrlOpen", async (data) => {
          debugLog("deeplink", `appUrlOpen fired: ${data.url}`);
          try { await Browser.close(); } catch (e) {
            debugLog("deeplink", `Browser.close error: ${e}`);
          }
          handleAuthDeepLink(data.url);
        });

        debugLog("deeplink", "listener registered OK");
        cleanup = () => { handle.remove(); };
      } catch (err) {
        debugLog("deeplink", `setup error: ${err}`);
      }
    }

    setup();
    return () => { cleanup?.(); };
  }, []);
}

function ProGuard({ component: Component, url }: { component: ComponentType; url: string }) {
  const { isPro, isLoading } = useSubscription();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  if (isLoading || settingsLoading) return null;
  if (!isPro && !isEssentialBusinessUrl(url, settings?.businessType, settings?.businessSubType)) return <Redirect to="/billing?reason=pro_required" />;
  return <Component />;
}

function ProAndCashierGuard({ component: Component, url }: { component: ComponentType; url: string }) {
  const { user } = useAuth();
  const { isPro, isLoading } = useSubscription();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  if (isLoading || settingsLoading) return null;
  if (!isPro && !isEssentialBusinessUrl(url, settings?.businessType, settings?.businessSubType)) return <Redirect to="/billing?reason=pro_required" />;
  if (user?.role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

function OwnerGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  if (user?.role !== "owner") return <Redirect to="/" />;
  return <Component />;
}

function ProAndOwnerGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const { isPro, isLoading } = useSubscription();
  if (isLoading) return null;
  if (user?.role !== "owner") return <Redirect to="/" />;
  if (!isPro) return <Redirect to="/billing?reason=pro_required" />;
  return <Component />;
}

function CashierGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  if (user?.role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

function AdminGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

function ManagerOrAboveGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || (role !== "owner" && role !== "manager")) return <Redirect to="/" />;
  return <Component />;
}

function LoadingScreen({ message }: { message?: string }) {
  // If we've been spinning for 4 s and we're offline, the chunk is not cached.
  // Show an actionable offline screen instead of an infinite spinner.
  const [offlineStall, setOfflineStall] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!navigator.onLine) setOfflineStall(true);
    }, 4000);
    return () => clearTimeout(id);
  }, []);

  if (offlineStall) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810] px-6">
        <div className="max-w-xs w-full text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 8v4m0 4h.01" />
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
              onClick={() => { setOfflineStall(false); window.location.reload(); }}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f2f2f7] dark:bg-[#09090f]">
      <div className="flex flex-col items-center gap-5 animate-[fadeSlideUp_0.4s_ease_both]">
        {/* Logo with ambient glow */}
        <div className="relative">
          <div className="absolute inset-0 rounded-[22px] bg-violet-500/25 dark:bg-violet-400/20 blur-2xl scale-[2] animate-pulse" />
          <div className="relative w-[72px] h-[72px] rounded-[22px] bg-[#7c3aed] flex items-center justify-center shadow-xl shadow-violet-600/30">
            <span className="text-white text-[30px] font-black select-none leading-none">A</span>
          </div>
        </div>

        {/* App name */}
        <div className="text-center space-y-0.5">
          <p className="text-[17px] font-bold text-slate-800 dark:text-white tracking-[-0.3px]">ArtixPOS</p>
          <p className="text-xs text-slate-400 dark:text-white/30 font-medium">
            {message ?? "Business OS"}
          </p>
        </div>

        {/* Staggered bouncing dots */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="w-2 h-2 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce [animation-delay:0ms] [animation-duration:900ms]" />
          <span className="w-2 h-2 rounded-full bg-violet-400/60 dark:bg-violet-400/50 animate-bounce [animation-delay:180ms] [animation-duration:900ms]" />
          <span className="w-2 h-2 rounded-full bg-violet-400/25 dark:bg-violet-400/25 animate-bounce [animation-delay:360ms] [animation-duration:900ms]" />
        </div>
      </div>
    </div>
  );
}

// Eagerly warm-up every lazy route in the background so the service worker
// can cache their JS chunks. After one successful online session, all pages
// will load instantly — including when the device is completely offline.
const ALL_LAZY_ROUTES: Array<() => Promise<unknown>> = [
  () => import("@/pages/dashboard"),
  () => import("@/pages/pos"),
  () => import("@/pages/products"),
  () => import("@/pages/analytics"),
  () => import("@/pages/pending-orders"),
  () => import("@/pages/settings"),
  () => import("@/pages/transactions"),
  () => import("@/pages/customers"),
  () => import("@/pages/expenses"),
  () => import("@/pages/shifts"),
  () => import("@/pages/discount-codes"),
  () => import("@/pages/refunds"),
  () => import("@/pages/ai"),
  () => import("@/pages/tables"),
  () => import("@/pages/kitchen"),
  () => import("@/pages/kitchen-display"),
  () => import("@/pages/suppliers"),
  () => import("@/pages/purchases"),
  () => import("@/pages/timeclock"),
  () => import("@/pages/onboarding"),
  () => import("@/pages/appointments"),
  () => import("@/pages/staff"),
  () => import("@/pages/rooms"),
  () => import("@/pages/memberships"),
  () => import("@/pages/billing"),
  () => import("@/pages/print-settings"),
  () => import("@/pages/hardware-settings"),
  () => import("@/pages/loyalty"),
  () => import("@/pages/payroll"),
  () => import("@/pages/bir"),
  () => import("@/pages/bir-audit-log"),
  () => import("@/pages/expiry-tracker"),
  () => import("@/pages/admin/index"),
  () => import("@/pages/admin/branches"),
  () => import("@/pages/admin/users"),
  () => import("@/pages/admin/analytics"),
  () => import("@/pages/admin/audit-logs"),
  () => import("@/pages/admin/permissions"),
];

// Critical routes the user is most likely to visit right after login.
// Preloaded first so navigation feels instant.
const PRIORITY_LAZY_ROUTES = ALL_LAZY_ROUTES.slice(0, 5); // dashboard, pos, products, analytics, pending-orders
const DEFERRED_LAZY_ROUTES = ALL_LAZY_ROUTES.slice(5);

function useRoutePreloader() {
  useEffect(() => {
    if (!navigator.onLine) return;

    const ric = window.requestIdleCallback;

    // Batch 1 — priority routes, loaded during first idle window after paint
    const scheduleP = ric
      ? (cb: () => void) => ric(cb, { timeout: 3000 })
      : (cb: () => void) => setTimeout(cb, 1500);

    const handle1 = scheduleP(() => {
      PRIORITY_LAZY_ROUTES.forEach((load) => load().catch(() => {}));
    });

    // Batch 2 — remaining routes, staggered so they don't compete with Batch 1
    const timer = setTimeout(() => {
      const scheduleD = ric
        ? (cb: () => void) => ric(cb, { timeout: 10_000 })
        : (cb: () => void) => setTimeout(cb, 0);

      // Spread across multiple idle callbacks so the main thread stays free
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

function AppRouter() {
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useSettings();
  const [location] = useLocation();
  // Warm-up all lazy route chunks in the background so they're offline-ready
  useRoutePreloader();
  // Apply the active branch's color as the app-wide primary theme color
  useBranchTheme();

  if (settingsLoading) return <LoadingScreen />;

  // If settings failed to load, don't block the user — let them into the app.
  // Only redirect to onboarding when we have a confirmed 0 / falsy value.
  const needsOnboarding = !settingsError && settings !== undefined && !settings?.onboardingComplete;

  if (needsOnboarding && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  if (!needsOnboarding && location === "/onboarding") {
    return <Redirect to="/" />;
  }

  if (location === "/onboarding") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <Suspense fallback={<LoadingScreen />}>
        <Switch>
          <Route path="/" component={() => <Dashboard />} />
          <Route path="/pos" component={() => <POS />} />
          <Route path="/pending" component={() => <PendingOrders />} />
          <Route path="/products" component={() => <CashierGuard component={Products} />} />
          <Route path="/analytics" component={() => <CashierGuard component={Analytics} />} />
          <Route path="/transactions" component={() => <CashierGuard component={Transactions} />} />
          <Route path="/settings" component={() => <Settings />} />
          <Route path="/admin" component={() => <AdminGuard component={AdminIndex} />} />
          <Route path="/admin/branches" component={() => <AdminGuard component={AdminBranches} />} />
          <Route path="/admin/users" component={() => <AdminGuard component={AdminUsers} />} />
          <Route path="/admin/analytics" component={() => <AdminGuard component={AdminAnalytics} />} />
          <Route path="/admin/audit-logs" component={() => <AdminGuard component={AdminAuditLogs} />} />
          <Route path="/admin/permissions" component={() => <AdminGuard component={AdminPermissions} />} />
          <Route path="/customers" component={() => <ProAndCashierGuard url="/customers" component={Customers} />} />
          <Route path="/expenses" component={() => <ProAndCashierGuard url="/expenses" component={Expenses} />} />
          <Route path="/shifts" component={() => <ProGuard url="/shifts" component={Shifts} />} />
          <Route path="/discount-codes" component={() => <ProAndCashierGuard url="/discount-codes" component={DiscountCodes} />} />
          <Route path="/refunds" component={() => <ManagerOrAboveGuard component={Refunds} />} />
          <Route path="/ai" component={() => <OwnerGuard component={AiPage} />} />
          <Route path="/tables" component={() => <ProGuard url="/tables" component={TablesPage} />} />
          <Route path="/kitchen" component={() => <ProGuard url="/kitchen" component={KitchenPage} />} />
          <Route path="/suppliers" component={() => <ProAndCashierGuard url="/suppliers" component={SuppliersPage} />} />
          <Route path="/purchases" component={() => <ProAndCashierGuard url="/purchases" component={PurchasesPage} />} />
          <Route path="/timeclock" component={() => <ProGuard url="/timeclock" component={TimeClockPage} />} />
          <Route path="/appointments" component={() => <ProGuard url="/appointments" component={AppointmentsPage} />} />
          <Route path="/staff" component={() => <CashierGuard component={StaffPage} />} />
          <Route path="/rooms" component={() => <ProGuard url="/rooms" component={RoomsPage} />} />
          <Route path="/memberships" component={() => <ProGuard url="/memberships" component={MembershipsPage} />} />
          <Route path="/print-settings" component={() => <OwnerGuard component={PrintSettings} />} />
          <Route path="/hardware-settings" component={() => <HardwareSettings />} />
          <Route path="/loyalty" component={() => <ProGuard url="/loyalty" component={LoyaltyPage} />} />
          <Route path="/wifi-vouchers" component={() => <ProGuard url="/wifi-vouchers" component={WifiVouchersPage} />} />
          <Route path="/payroll" component={() => <ProGuard url="/payroll" component={PayrollPage} />} />
          <Route path="/bir" component={() => <ProAndOwnerGuard component={BIRPage} />} />
          <Route path="/bir-audit-log" component={() => <ProAndOwnerGuard component={BIRAuditLogPage} />} />
          <Route path="/expiry" component={() => <CashierGuard component={ExpiryTrackerPage} />} />
          <Route path="/inventory" component={() => <CashierGuard component={InventoryHubPage} />} />
          <Route path="/billing" component={() => <BillingPage />} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function ProtectedRouter() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();
  const [redeemingInvite, setRedeemingInvite] = useState(false);

  // Track the previously-seen userId so we can detect an in-session account
  // switch (e.g. native Google OAuth re-login without a full page reload).
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    // If the user changed without a full page reload (e.g. native OAuth token swap),
    // remove all non-auth cache entries. We deliberately skip auth-me — it already
    // holds the new user's data, and removing it would make isAuthenticated briefly
    // false, causing the session-expiry effect to fire and flashing the login page.
    if (prevUserIdRef.current !== null && prevUserIdRef.current !== user.id) {
      queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth-me" });
      clearPrefetchCache();
    }
    prevUserIdRef.current = user.id;

    initUserSession(user.id).then(() => prefetchBootstrapData(user.id));
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId) return;
    initRevenueCat(user.tenantId).catch((e) =>
      console.warn("[revenuecat] init error:", e)
    );
  }, [isAuthenticated, user?.tenantId]);

  // On session expiry / 401, wipe in-memory + IDB so the next session starts clean.
  // IMPORTANT: do NOT call queryClient.clear() here — that removes auth-me from
  // the cache too, which causes TanStack Query to re-fetch it, land on 401 again,
  // and trigger this effect in an infinite loop. Instead, only remove non-auth
  // queries so auth-me stays as null (unauthenticated) and the loop never starts.
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
          sessionStorage.setItem("invite_error", data.message || "This invite link is invalid or has already been used.");
        }
      })
      .catch(() => {
        sessionStorage.setItem("invite_error", "Could not connect. Please try again.");
      })
      .finally(() => setRedeemingInvite(false));
  }, [isAuthenticated, isLoading]);

  if (isLoading || redeemingInvite) {
    return <LoadingScreen message={redeemingInvite ? "Joining your team…" : undefined} />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (location === "/kitchen-display") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <KitchenDisplayPage />
      </Suspense>
    );
  }

  return <AppRouter />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/b/:id" component={BranchPublicPage} />
      <Route component={ProtectedRouter} />
    </Switch>
  );
}

function useGlobalDarkMode() {
  useEffect(() => {
    // Initial class is already set by the inline script in index.html before React mounts.
    // This effect only corrects the class if AppLayout or anything else has drifted it.
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
      {import.meta.env.PROD && (
        <Suspense fallback={null}>
          <VercelAnalytics />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}

export default App;
