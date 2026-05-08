import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, setNativeToken, NATIVE_TOKEN_KEY, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { useEffect, useState, lazy, Suspense, ComponentType } from "react";
import { BlePrinterProvider } from "@/lib/ble-printer-context";
import { debugLog } from "@/lib/debug-log";
import { clearAllCache } from "@/lib/offline-db";
import { isEssentialBusinessUrl } from "@shared/business-access";
import { ErrorBoundary } from "@/components/error-boundary";
import { useBranchTheme } from "@/hooks/use-branch-theme";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

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
const LoyaltyPage = lazy(() => import("@/pages/loyalty"));
const PayrollPage = lazy(() => import("@/pages/payroll"));
const BIRPage = lazy(() => import("@/pages/bir"));
const BIRAuditLogPage = lazy(() => import("@/pages/bir-audit-log"));
const ExpiryTrackerPage = lazy(() => import("@/pages/expiry-tracker"));

/**
 * Extract and store the JWT token from an OAuth deep-link URL.
 * com.cafebara.app://auth?token=<jwt>
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
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
  if (!url.startsWith("com.cafebara.app://auth")) {
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
  if (!isPro && !isEssentialBusinessUrl(url, (settings as any)?.businessType, (settings as any)?.businessSubType)) return <Redirect to="/billing?reason=pro_required" />;
  return <Component />;
}

function ProAndCashierGuard({ component: Component, url }: { component: ComponentType; url: string }) {
  const { user } = useAuth();
  const { isPro, isLoading } = useSubscription();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  if (isLoading || settingsLoading) return null;
  if (!isPro && !isEssentialBusinessUrl(url, (settings as any)?.businessType, (settings as any)?.businessSubType)) return <Redirect to="/billing?reason=pro_required" />;
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

// Skeleton shimmer block — mirrors the HTML splash in index.html
function Sk({ className }: { className?: string }) {
  return (
    <div
      className={[
        "rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200",
        "dark:from-[#1a1a2e] dark:via-[#252540] dark:to-[#1a1a2e]",
        "bg-[length:400%_100%] animate-[shimmer_1.6s_ease-in-out_infinite]",
        className ?? "",
      ].join(" ")}
    />
  );
}

// Shared sidebar used by all LoadingScreen variants
function SkeletonSidebar() {
  return (
    <aside className="hidden md:flex w-[220px] min-w-[220px] flex-col gap-5 border-r border-border bg-card/80 px-3 py-4">
      <div className="flex items-center gap-2.5 px-1 pt-1 pb-1">
        <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0">A</div>
        <div className="flex flex-col gap-1.5">
          <Sk className="h-3 w-20" />
          <Sk className="h-2 w-14" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Sk className="h-2 w-12 mb-1 rounded-sm" />
        {[16, 10, 14, 16].map((w, i) => (
          <div key={i} className="flex items-center gap-2.5 h-9 px-2.5">
            <Sk className="w-[14px] h-[14px] rounded-md shrink-0" />
            <Sk className={`h-2.5 w-${w}`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Sk className="h-2 w-16 mb-1 rounded-sm" />
        {[12, 20, 16].map((w, i) => (
          <div key={i} className="flex items-center gap-2.5 h-9 px-2.5">
            <Sk className="w-[14px] h-[14px] rounded-md shrink-0" />
            <Sk className={`h-2.5 w-${w}`} />
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 px-2 py-2 rounded-xl border border-border/40">
        <Sk className="w-7 h-7 rounded-full shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <Sk className="h-2.5 w-20" />
          <Sk className="h-2 w-14" />
        </div>
      </div>
    </aside>
  );
}

// Shared header used by all LoadingScreen variants
function SkeletonHeader() {
  return (
    <header className="h-[52px] min-h-[52px] flex items-center gap-3 px-5 border-b border-border bg-card/80">
      <div className="flex md:hidden items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">A</div>
        <Sk className="h-2.5 w-20" />
      </div>
      <Sk className="hidden md:block h-3 w-32" />
      <div className="flex-1" />
      <Sk className="w-7 h-7 rounded-lg" />
      <Sk className="w-7 h-7 rounded-lg" />
      <Sk className="w-7 h-7 rounded-full" />
    </header>
  );
}

// Shared mobile bottom nav
function SkeletonBottomNav() {
  return (
    <nav className="flex md:hidden border-t border-border bg-card/80 pb-safe">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 py-2.5">
          <Sk className="w-6 h-6 rounded-lg" />
          <Sk className="h-2 w-7 rounded-sm" />
        </div>
      ))}
    </nav>
  );
}

function LoadingScreen({ message }: { message?: string }) {
  const [location] = useLocation();

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

  // Named message (e.g. "Joining your team…") → minimal centred spinner
  if (message) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-violet-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  // ── Dashboard: full stats + chart skeleton ────────────────────────────────
  // Only use the heavy skeleton when the destination is actually the dashboard.
  // Mirrors #app-splash so the transition is seamless on first load.
  if (location === "/") {
    return (
      <div className="min-h-screen flex bg-background overflow-hidden">
        <SkeletonSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <SkeletonHeader />
          <main className="flex-1 overflow-hidden p-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
                  <Sk className="h-2.5 w-3/4" />
                  <Sk className="h-5 w-1/2" />
                  <Sk className="h-2 w-4/5" />
                </div>
              ))}
            </div>
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
              <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Sk className="h-3 w-28" />
                  <Sk className="h-5 w-14 rounded-full" />
                </div>
                <div className="flex-1 flex items-end gap-1.5 pt-2 min-h-[100px]">
                  {[45, 72, 58, 88, 62, 79, 95, 70, 83, 55, 91, 67].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-md bg-gradient-to-t from-violet-200 to-violet-100 dark:from-[#1a1a2e] dark:to-[#252540] animate-[shimmer_1.8s_ease-in-out_infinite] bg-[length:400%_100%]"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
                <Sk className="h-3 w-28" />
                <div className="flex flex-col divide-y divide-border">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-2.5 py-2.5">
                      <Sk className="w-9 h-9 rounded-[10px] shrink-0" />
                      <div className="flex-1 flex flex-col gap-1.5">
                        <Sk className="h-2.5 w-2/3" />
                        <Sk className="h-2 w-2/5" />
                      </div>
                      <Sk className="h-3.5 w-12" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
          <SkeletonBottomNav />
        </div>
      </div>
    );
  }

  // ── POS: product grid + cart panel skeleton ───────────────────────────────
  if (location === "/pos") {
    return (
      <div className="min-h-screen flex bg-background overflow-hidden">
        <SkeletonSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <SkeletonHeader />
          <main className="flex-1 overflow-hidden flex gap-0">
            {/* Product grid */}
            <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
              <Sk className="h-9 w-full rounded-xl" />
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-7 w-20 rounded-full" />)}
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2">
                    <Sk className="w-full aspect-square rounded-xl" />
                    <Sk className="h-2.5 w-3/4" />
                    <Sk className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </div>
            {/* Cart panel (desktop) */}
            <div className="hidden md:flex w-[300px] shrink-0 flex-col border-l border-border bg-card/50 p-4 gap-3">
              <Sk className="h-4 w-24" />
              <div className="flex-1 flex flex-col gap-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-border">
                    <Sk className="w-9 h-9 rounded-lg shrink-0" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <Sk className="h-2.5 w-3/4" />
                      <Sk className="h-2 w-1/2" />
                    </div>
                    <Sk className="h-3 w-10" />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <Sk className="h-3 w-full" />
                <Sk className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </main>
          <SkeletonBottomNav />
        </div>
      </div>
    );
  }

  // ── Generic page: header + single content card with rows ─────────────────
  // Used for products, customers, transactions, settings, analytics, etc.
  // Honest: most pages are just "title + a list or form" so we show one card.
  return (
    <div className="min-h-screen flex bg-background overflow-hidden">
      <SkeletonSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <SkeletonHeader />
        <main className="flex-1 overflow-hidden p-5 flex flex-col gap-4">
          {/* Optional filter/action bar */}
          <div className="flex items-center gap-3">
            <Sk className="h-9 flex-1 max-w-xs rounded-xl" />
            <Sk className="h-9 w-24 rounded-xl" />
          </div>
          {/* Main content card */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-0 flex-1">
            {/* Table header */}
            <div className="flex items-center gap-4 pb-3 border-b border-border">
              {[40, 28, 20, 16].map((w, i) => (
                <Sk key={i} className={`h-2.5 w-${w === 40 ? "2/5" : w === 28 ? "1/4" : w === 20 ? "1/5" : "1/6"}`} />
              ))}
            </div>
            {/* Table rows */}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-2.5 flex-[2]">
                  <Sk className="w-8 h-8 rounded-lg shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Sk className="h-2.5 w-3/4" />
                    <Sk className="h-2 w-1/2" />
                  </div>
                </div>
                <Sk className="h-2.5 flex-1 hidden sm:block" />
                <Sk className="h-5 w-14 rounded-full" />
                <Sk className="h-2.5 w-16 hidden md:block" />
              </div>
            ))}
          </div>
        </main>
        <SkeletonBottomNav />
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
          <Route path="/loyalty" component={() => <ProGuard url="/loyalty" component={LoyaltyPage} />} />
          <Route path="/payroll" component={() => <ProGuard url="/payroll" component={PayrollPage} />} />
          <Route path="/bir" component={() => <ProAndOwnerGuard component={BIRPage} />} />
          <Route path="/bir-audit-log" component={() => <ProAndOwnerGuard component={BIRAuditLogPage} />} />
          <Route path="/expiry" component={() => <CashierGuard component={ExpiryTrackerPage} />} />
          <Route path="/billing" component={() => <BillingPage />} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function ProtectedRouter() {
  const { isAuthenticated, isLoading } = useAuth();
  const [redeemingInvite, setRedeemingInvite] = useState(false);

  // Redeem a pending invite as soon as the user is authenticated.
  // Works for both email/password login and OAuth flows.
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
          // Mark onboarding complete so the user goes straight to the POS
          await apiRequest("PUT", "/api/settings", { onboardingComplete: 1 }).catch(() => {});
          await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        } else {
          // Store error so onboarding page can surface it via toast
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
      {import.meta.env.PROD && <VercelAnalytics />}
    </ErrorBoundary>
  );
}

export default App;
