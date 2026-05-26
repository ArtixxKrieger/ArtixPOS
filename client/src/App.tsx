import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, setNativeToken, NATIVE_TOKEN_KEY, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { useEffect, useState, useRef, lazy, Suspense, ComponentType, ReactNode } from "react";
import { BlePrinterProvider } from "@/lib/ble-printer-context";
import { initRevenueCat } from "@/lib/revenuecat";
import { prefetchBootstrapData, clearPrefetchCache } from "@/lib/prefetch";
import { initUserSession } from "@/lib/offline-db";
import { debugLog } from "@/lib/debug-log";
import { clearAllCache } from "@/lib/offline-db";
import { isEssentialBusinessUrl } from "@shared/business-access";
import { ErrorBoundary } from "@/components/error-boundary";
import { useBranchTheme } from "@/hooks/use-branch-theme";
import { AppTour } from "@/components/app-tour";

const INVITE_STORAGE_KEY = "artixpos_pending_invite";
const OAUTH_FLOW_KEY = "artixpos_oauth_flow";

import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import NotFound from "@/pages/not-found";
import BranchPublicPage from "@/pages/branch-public";
import StaffPinLogin from "@/pages/staff-pin-login";

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

const pageFallback = null;

function LoadingScreen({ message }: { message?: string }) {
  // After 4 s offline → show the "no cached chunk" error screen.
  // After 12 s online  → show a "taking too long" banner with a Retry button.
  // Without the online timer, a poor mobile connection after an OAuth redirect
  // leaves the user staring at a spinner forever.
  const [offlineStall, setOfflineStall] = useState(false);
  const [slowStall, setSlowStall] = useState(false);

  useEffect(() => {
    const offlineId = setTimeout(() => {
      if (!navigator.onLine) setOfflineStall(true);
    }, 4_000);
    const slowId = setTimeout(() => {
      if (navigator.onLine) setSlowStall(true);
    }, 12_000);
    return () => { clearTimeout(offlineId); clearTimeout(slowId); };
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

  if (slowStall) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810] px-6">
        <div className="max-w-xs w-full text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Taking longer than expected</h2>
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

// ── Persistent route paths ─────────────────────────────────────────────────
// These routes are ALWAYS kept mounted after first visit and toggled via CSS.
// Navigation between them is a pure style change — zero JS work, zero skeleton.
const PINNED_PATHS = new Set(["/", "/pos", "/pending", "/settings", "/analytics", "/products"]);

/**
 * Mounts the children the first time the path is active, then keeps them
 * mounted forever. When inactive, the wrapper is hidden with display:none so
 * it consumes no layout budget and is invisible, but React does not unmount
 * it — all hooks, effects, and React Query subscriptions remain alive.
 *
 * This is the "tab caching" pattern: switching between pinned views is a
 * single CSS property change, not a React render cycle.
 */
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
    <div
      aria-hidden={hidden || undefined}
      style={hidden ? { display: "none" } : undefined}
    >
      {children}
    </div>
  );
}

// ── Stable route components ────────────────────────────────────────────────
// Defined at module level so their references NEVER change between renders.
// Inline arrow functions inside AppRouter would create new references every
// render, causing Wouter to unmount + remount the page each time.
//
// Note: Dashboard, POS, Pending, Settings, Analytics are handled by
// PersistentRoute above — no route constant needed for those.
const HardwareSettingsRoute = () => <HardwareSettings />;
const BillingRoute          = () => <BillingPage />;

const TransactionsRoute     = () => <CashierGuard component={Transactions} />;
const StaffRoute            = () => <CashierGuard component={StaffPage} />;
const ExpiryRoute           = () => <CashierGuard component={ExpiryTrackerPage} />;
const InventoryRoute        = () => (
  <ErrorBoundary fallback={(err, retry) => (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Failed to load Inventory</h2>
        <p className="text-sm text-muted-foreground">This might be a temporary network issue. Try again without leaving the page.</p>
        <button
          onClick={retry}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
          data-testid="button-inventory-retry"
        >
          Try again
        </button>
      </div>
    </div>
  )}>
    <CashierGuard component={InventoryHubPage} />
  </ErrorBoundary>
);

const AdminRoute            = () => <AdminGuard component={AdminIndex} />;
const AdminBranchesRoute    = () => <AdminGuard component={AdminBranches} />;
const AdminUsersRoute       = () => <AdminGuard component={AdminUsers} />;
const AdminAnalyticsRoute   = () => <AdminGuard component={AdminAnalytics} />;
const AdminAuditLogsRoute   = () => <AdminGuard component={AdminAuditLogs} />;
const AdminPermissionsRoute = () => <AdminGuard component={AdminPermissions} />;

const RefundsRoute          = () => <ManagerOrAboveGuard component={Refunds} />;
const AiRoute               = () => <OwnerGuard component={AiPage} />;
const PrintSettingsRoute    = () => <OwnerGuard component={PrintSettings} />;
const BIRRoute              = () => <ProAndOwnerGuard component={BIRPage} />;
const BIRAuditLogRoute      = () => <ProAndOwnerGuard component={BIRAuditLogPage} />;

const CustomersRoute        = () => <ProAndCashierGuard url="/customers" component={Customers} />;
const ExpensesRoute         = () => <ProAndCashierGuard url="/expenses" component={Expenses} />;
const DiscountCodesRoute    = () => <ProAndCashierGuard url="/discount-codes" component={DiscountCodes} />;
const SuppliersRoute        = () => <ProAndCashierGuard url="/suppliers" component={SuppliersPage} />;
const PurchasesRoute        = () => <ProAndCashierGuard url="/purchases" component={PurchasesPage} />;

const ShiftsRoute           = () => <ProGuard url="/shifts" component={Shifts} />;
const TablesRoute           = () => <ProGuard url="/tables" component={TablesPage} />;
const KitchenRoute          = () => <ProGuard url="/kitchen" component={KitchenPage} />;
const TimeClockRoute        = () => <ProGuard url="/timeclock" component={TimeClockPage} />;
const AppointmentsRoute     = () => <ProGuard url="/appointments" component={AppointmentsPage} />;
const RoomsRoute            = () => <ProGuard url="/rooms" component={RoomsPage} />;
const MembershipsRoute      = () => <ProGuard url="/memberships" component={MembershipsPage} />;
const LoyaltyRoute          = () => <ProGuard url="/loyalty" component={LoyaltyPage} />;
const WifiVouchersRoute     = () => <ProGuard url="/wifi-vouchers" component={WifiVouchersPage} />;
const PayrollRoute          = () => <ProGuard url="/payroll" component={PayrollPage} />;

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
  const { user } = useAuth();
  const [location] = useLocation();
  // Warm-up all lazy route chunks in the background so they're offline-ready
  useRoutePreloader();
  // Apply the active branch's color as the app-wide primary theme color
  useBranchTheme();

  // ── First-load splash gate ─────────────────────────────────────────────────
  // We only want to show the boot splash ONCE — during the very first settings
  // fetch on a fresh page load. Every subsequent render (navigations, background
  // refetches, or AppRouter remounts from /kitchen-display) will already have
  // settings in the React Query cache, so settingsEverLoaded becomes true
  // immediately and we skip the gate entirely.
  //
  // WHY a ref instead of state: changing this value must NOT trigger a re-render.
  // It's a one-way latch (false → true, never back). State would cause an extra
  // render cycle that defeats the purpose.
  const settingsEverLoaded = useRef(settings !== undefined);
  if (!settingsEverLoaded.current && settings !== undefined) {
    settingsEverLoaded.current = true;
  }

  // 4-second bail-out: if settings hasn't arrived in 4 s on first load, render
  // the app anyway (needsOnboarding will be false so the user lands on the
  // dashboard; the onboarding redirect fires once settings eventually arrives).
  // This effect is a guaranteed no-op after the first successful load because
  // settingsEverLoaded.current will already be true.
  const [settingsTimedOut, setSettingsTimedOut] = useState(false);
  useEffect(() => {
    if (settingsEverLoaded.current || !settingsLoading) return;
    const t = setTimeout(() => setSettingsTimedOut(true), 4_000);
    return () => clearTimeout(t);
  }, [settingsLoading]);

  // Scroll the main content pane to the top on every route change.
  // Required because all persistent views share the same scroll container.
  // IMPORTANT: must be declared BEFORE any conditional early returns so the
  // hook call order is identical on every render (Rules of Hooks).
  useEffect(() => {
    document.getElementById("app-scroll")?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location]);

  if (!settingsEverLoaded.current && settingsLoading && !settingsTimedOut) {
    return <LoadingScreen />;
  }

  // Only redirect to onboarding when we have a CONFIRMED falsy onboardingComplete.
  // settings === undefined → still loading (show splash/timeout instead)
  // settings === null     → fetch failed or IDB empty; treat as "not yet known" to
  //                         prevent false onboarding redirects for returning users
  //                         on cold starts where the 15s fetch hasn't resolved yet.
  //
  // ADDITIONAL GUARD: localStorage flag per-userId prevents a false onboarding
  // redirect if the server transiently returns onboardingComplete=0 (e.g. due to
  // an RLS context issue on the first request after a cold start, or a race
  // between the 4-second bail-out and the actual settings fetch).
  // The flag is keyed by userId so it is specific to each account on the device.
  const onboardedKey = user?.id ? `artix-onboarded-${user.id}` : null;
  const alreadyOnboarded = onboardedKey ? localStorage.getItem(onboardedKey) === "1" : false;

  // Persist the flag the moment we confirm onboarding is complete.
  if (onboardedKey && settings?.onboardingComplete) {
    localStorage.setItem(onboardedKey, "1");
  }

  const needsOnboarding =
    !settingsError &&
    settings !== undefined &&
    settings !== null &&
    !settings?.onboardingComplete &&
    !alreadyOnboarded;

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
      {/* ── Persistent (tab-cached) views ─────────────────────────────────────
           Mounted ONCE on first visit, then kept alive via CSS display:none.
           Switching between these 5 routes is a pure style toggle — no React
           unmount/remount, no skeleton, no data re-fetch. Sub-millisecond.   */}
      <PersistentRoute path="/" currentPath={location}>
        <Suspense fallback={pageFallback}><Dashboard /></Suspense>
      </PersistentRoute>
      <PersistentRoute path="/pos" currentPath={location}>
        <Suspense fallback={pageFallback}><POS /></Suspense>
      </PersistentRoute>
      <PersistentRoute path="/pending" currentPath={location}>
        <Suspense fallback={pageFallback}><PendingOrders /></Suspense>
      </PersistentRoute>
      <PersistentRoute path="/settings" currentPath={location}>
        <Suspense fallback={pageFallback}><Settings /></Suspense>
      </PersistentRoute>
      <PersistentRoute path="/analytics" currentPath={location}>
        <Suspense fallback={pageFallback}><CashierGuard component={Analytics} /></Suspense>
      </PersistentRoute>
      <PersistentRoute path="/products" currentPath={location}>
        <Suspense fallback={pageFallback}><Products /></Suspense>
      </PersistentRoute>

      {/* ── On-demand routes ───────────────────────────────────────────────────
           Only rendered when not on a pinned path. First visit shows a brief
           PageFallback while the JS chunk loads; subsequent visits are instant
           because the chunk is cached by the browser / service worker.        */}
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
            <Route path="/ai" component={AiRoute} />
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
            <Route path="/bir" component={BIRRoute} />
            <Route path="/bir-audit-log" component={BIRAuditLogRoute} />
            <Route path="/expiry" component={ExpiryRoute} />
            <Route path="/inventory" component={InventoryRoute} />
            <Route path="/billing" component={BillingRoute} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      )}
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

    initUserSession(user.id)
      .then(() => prefetchBootstrapData(user.id))
      .catch(() => {});
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
      <Suspense fallback={pageFallback}>
        <KitchenDisplayPage />
      </Suspense>
    );
  }

  if (location === "/staff-clock-in") {
    return <StaffPinLogin />;
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
