import { Redirect, useLocation } from "wouter";
import { Suspense, useEffect, ComponentType } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { isEssentialBusinessUrl } from "@shared/business-access";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  POS,
  Transactions,
  AdminIndex,
  AdminBranches,
  AdminUsers,
  AdminAnalytics,
  AdminAuditLogs,
  AdminPermissions,
  Customers,
  Expenses,
  Shifts,
  DiscountCodes,
  Refunds,
  TablesPage,
  KitchenPage,
  SuppliersPage,
  PurchasesPage,
  TimeClockPage,
  AppointmentsPage,
  StaffPage,
  RoomsPage,
  MembershipsPage,
  BillingPage,
  PrintSettings,
  HardwareSettings,
  LoyaltyPage,
  WifiVouchersPage,
  PayrollPage,
  SchedulesPage,
  BIRPage,
  BIRAuditLogPage,
  ExpiryTrackerPage,
  InventoryHubPage,
  FeaturesPage,
} from "./lazy-pages";

export function ProGuard({ component: Component, url }: { component: ComponentType; url: string }) {
  const { isPro, isLoading } = useSubscription();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  if (isLoading || settingsLoading) return null;
  if (!isPro && !isEssentialBusinessUrl(url, settings?.businessType, settings?.businessSubType))
    return <Redirect to="/billing?reason=pro_required" />;
  return <Component />;
}

export function ProAndCashierGuard({
  component: Component,
  url,
}: {
  component: ComponentType;
  url: string;
}) {
  const { user } = useAuth();
  const { isPro, isLoading } = useSubscription();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  if (isLoading || settingsLoading) return null;
  if (!isPro && !isEssentialBusinessUrl(url, settings?.businessType, settings?.businessSubType))
    return <Redirect to="/billing?reason=pro_required" />;
  if (user?.role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

export function OwnerGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  if (user?.role !== "owner") return <Redirect to="/" />;
  return <Component />;
}

export function ProAndOwnerGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const { isPro, isLoading } = useSubscription();
  if (isLoading) return null;
  if (user?.role !== "owner") return <Redirect to="/" />;
  if (!isPro) return <Redirect to="/billing?reason=pro_required" />;
  return <Component />;
}

export function CashierGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  if (user?.role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

export function POSWithSetupGuard() {
  const [location, setLocation] = useLocation();
  const { data: settings, isLoading } = useSettings();
  const posFeatures = (settings as any)?.posFeatures;

  useEffect(() => {
    if (isLoading) return;
    if (location !== "/pos") return;
    if (settings != null && posFeatures == null) {
      setLocation("/features?setup=1");
    }
  }, [isLoading, settings, posFeatures, location, setLocation]);

  return <POS />;
}

export function AdminGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || role === "cashier") return <Redirect to="/" />;
  return <Component />;
}

export function AdminProGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const { isPro, isLoading } = useSubscription();
  const role = user?.role;
  if (!role || role === "cashier") return <Redirect to="/" />;
  if (isLoading) return null;
  if (!isPro) return <Redirect to="/billing?reason=pro_required" />;
  return <Component />;
}

export function AdminBusinessGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const { isBusiness, isLoading } = useSubscription();
  const role = user?.role;
  if (!role || role === "cashier") return <Redirect to="/" />;
  if (isLoading) return null;
  if (!isBusiness) return <Redirect to="/billing?reason=business_required" />;
  return <Component />;
}

export function ManagerOrAboveGuard({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || (role !== "owner" && role !== "manager")) return <Redirect to="/" />;
  return <Component />;
}

export const HardwareSettingsRoute = () => <HardwareSettings />;
export const BillingRoute = () => <BillingPage />;

export const TransactionsRoute = () => <CashierGuard component={Transactions} />;
export const StaffRoute = () => <ProAndCashierGuard url="/staff" component={StaffPage} />;
export const ExpiryRoute = () => <CashierGuard component={ExpiryTrackerPage} />;
function hardReloadWithCacheClear() {
  try {
    const doReload = () => window.location.reload();
    const unregisterSW = "serviceWorker" in navigator
      ? navigator.serviceWorker.getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
          .catch(() => {})
      : Promise.resolve();
    const wipeCaches = window.caches
      ? caches.keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))))
          .catch(() => {})
      : Promise.resolve();
    Promise.all([unregisterSW, wipeCaches]).finally(doReload);
  } catch {
    window.location.reload();
  }
}

export const InventoryRoute = () => (
  <ErrorBoundary
    fallback={(err, retry) => {
      const isChunk =
        (err as Error)?.name === "ChunkLoadError" ||
        /Loading (chunk|CSS chunk) [\d]+ failed/i.test((err as Error)?.message ?? "") ||
        /Failed to fetch dynamically imported module/i.test((err as Error)?.message ?? "") ||
        /Importing a module script failed/i.test((err as Error)?.message ?? "");
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground">Failed to load Inventory</h2>
            <p className="text-sm text-muted-foreground">
              {isChunk
                ? "A new version of the app is available. Reload to get the latest update."
                : "Something went wrong loading this page. Try again or reload."}
            </p>
            {!isChunk && err && (
              <p className="text-xs font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2 text-left break-all">
                {(err as Error).name}: {(err as Error).message || "(no message)"}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {!isChunk && (
                <button
                  onClick={retry}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                  data-testid="button-inventory-retry"
                >
                  Try again
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                data-testid="button-inventory-reload"
              >
                Reload page
              </button>
              <button
                onClick={hardReloadWithCacheClear}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                data-testid="button-inventory-clear-cache"
              >
                Clear cache &amp; reload
              </button>
            </div>
          </div>
        </div>
      );
    }}
  >
    <CashierGuard component={InventoryHubPage} />
  </ErrorBoundary>
);

export const AdminRoute = () => <AdminGuard component={AdminIndex} />;
export const AdminBranchesRoute = () => <AdminGuard component={AdminBranches} />;
export const AdminUsersRoute = () => <AdminProGuard component={AdminUsers} />;
export const AdminAnalyticsRoute = () => <AdminProGuard component={AdminAnalytics} />;
export const AdminAuditLogsRoute = () => <AdminBusinessGuard component={AdminAuditLogs} />;
export const AdminPermissionsRoute = () => <AdminGuard component={AdminPermissions} />;

export const RefundsRoute = () => <ManagerOrAboveGuard component={Refunds} />;
export const PrintSettingsRoute = () => <OwnerGuard component={PrintSettings} />;
export const BIRRoute = () => <ProAndOwnerGuard component={BIRPage} />;
export const BIRAuditLogRoute = () => <ProAndOwnerGuard component={BIRAuditLogPage} />;

export const CustomersRoute = () => <ProAndCashierGuard url="/customers" component={Customers} />;
export const ExpensesRoute = () => <ProAndCashierGuard url="/expenses" component={Expenses} />;
export const DiscountCodesRoute = () => (
  <ProAndCashierGuard url="/discount-codes" component={DiscountCodes} />
);
export const SuppliersRoute = () => <ProAndCashierGuard url="/suppliers" component={SuppliersPage} />;
export const PurchasesRoute = () => <ProAndCashierGuard url="/purchases" component={PurchasesPage} />;

export const FeaturesRoute = () => (
  <Suspense fallback={null}>
    <FeaturesPage />
  </Suspense>
);
export const ShiftsRoute = () => <ProGuard url="/shifts" component={Shifts} />;
export const TablesRoute = () => <ProGuard url="/tables" component={TablesPage} />;
export const KitchenRoute = () => <ProGuard url="/kitchen" component={KitchenPage} />;
export const TimeClockRoute = () => <ProGuard url="/timeclock" component={TimeClockPage} />;
export const AppointmentsRoute = () => <ProGuard url="/appointments" component={AppointmentsPage} />;
export const RoomsRoute = () => <ProGuard url="/rooms" component={RoomsPage} />;
export const MembershipsRoute = () => <ProGuard url="/memberships" component={MembershipsPage} />;
export const LoyaltyRoute = () => <ProGuard url="/loyalty" component={LoyaltyPage} />;
export const WifiVouchersRoute = () => <ProGuard url="/wifi-vouchers" component={WifiVouchersPage} />;
export const PayrollRoute = () => <ProGuard url="/payroll" component={PayrollPage} />;
export const SchedulesRoute = () => <ProGuard url="/schedules" component={SchedulesPage} />;
