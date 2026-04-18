import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, setNativeToken, NATIVE_TOKEN_KEY, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { useEffect, useState } from "react";
import { debugLog } from "@/lib/debug-log";
import { clearAllCache } from "@/lib/offline-db";
import { isEssentialBusinessUrl } from "@shared/business-access";

const INVITE_STORAGE_KEY = "artixpos_pending_invite";
const OAUTH_FLOW_KEY = "artixpos_oauth_flow";

import Dashboard from "@/pages/dashboard";
import POS from "@/pages/pos";
import Products from "@/pages/products";
import Analytics from "@/pages/analytics";
import PendingOrders from "@/pages/pending-orders";
import Settings from "@/pages/settings";
import Transactions from "@/pages/transactions";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import AdminIndex from "@/pages/admin/index";
import AdminBranches from "@/pages/admin/branches";
import AdminUsers from "@/pages/admin/users";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminAuditLogs from "@/pages/admin/audit-logs";
import AdminPermissions from "@/pages/admin/permissions";
import Customers from "@/pages/customers";
import Expenses from "@/pages/expenses";
import Shifts from "@/pages/shifts";
import DiscountCodes from "@/pages/discount-codes";
import Refunds from "@/pages/refunds";
import AiPage from "@/pages/ai";
import TablesPage from "@/pages/tables";
import KitchenPage from "@/pages/kitchen";
import SuppliersPage from "@/pages/suppliers";
import PurchasesPage from "@/pages/purchases";
import TimeClockPage from "@/pages/timeclock";
import Onboarding from "@/pages/onboarding";
import AppointmentsPage from "@/pages/appointments";
import StaffPage from "@/pages/staff";
import RoomsPage from "@/pages/rooms";
import MembershipsPage from "@/pages/memberships";
import BillingPage from "@/pages/billing";
import PrintSettings from "@/pages/print-settings";

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

function ProGuard({ component: Component, url }: { component: () => JSX.Element; url: string }) {
  const { isPro, isLoading } = useSubscription();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  if (isLoading || settingsLoading) return null;
  if (!isPro && !isEssentialBusinessUrl(url, (settings as any)?.businessType, (settings as any)?.businessSubType)) return <Redirect to="/billing?reason=pro_required" />;
  return <Component />;
}

function ProAndCashierGuard({ component: Component, url }: { component: () => JSX.Element; url: string }) {
  const { user } = useAuth();
  const { isPro, isLoading } = useSubscription();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  if (isLoading || settingsLoading) return null;
  if (!isPro && !isEssentialBusinessUrl(url, (settings as any)?.businessType, (settings as any)?.businessSubType)) return <Redirect to="/billing?reason=pro_required" />;
  if (user?.role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

function OwnerGuard({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "owner") return <Redirect to="/" />;
  return <Component />;
}

function CashierGuard({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  if (user?.role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

function AdminGuard({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

function ManagerOrAboveGuard({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || (role !== "owner" && role !== "manager")) return <Redirect to="/" />;
  return <Component />;
}

function LoadingScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
        {message && (
          <p className="text-sm font-medium text-slate-500 dark:text-white/50">{message}</p>
        )}
      </div>
    </div>
  );
}

function AppRouter() {
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useSettings();
  const [location] = useLocation();

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
    return <Onboarding />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pos" component={POS} />
        <Route path="/pending" component={PendingOrders} />
        <Route path="/products" component={() => <CashierGuard component={Products} />} />
        <Route path="/analytics" component={() => <CashierGuard component={Analytics} />} />
        <Route path="/transactions" component={() => <CashierGuard component={Transactions} />} />
        <Route path="/settings" component={Settings} />
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
        <Route path="/ai" component={() => <ProGuard url="/ai" component={AiPage} />} />
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
        <Route path="/billing" component={BillingPage} />
        <Route component={NotFound} />
      </Switch>
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
