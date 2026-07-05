import { lazy } from "react";

/**
 * Wraps React.lazy() with automatic recovery for stale-deployment
 * chunk load failures (e.g. "Failed to fetch dynamically imported module").
 *
 * On a chunk error this unregisters the SW, wipes all caches, then does
 * ONE clean page reload.  The reload fetches fresh HTML from the server
 * (no SW intercept, no caches) so all chunk hashes are current.  The
 * never-resolving promise prevents the error from propagating to ANY
 * other handler (ErrorBoundary, window.onerror, unhandledrejection) —
 * there is ONE reload and done.  No cascade.
 *
 * A sessionStorage flag prevents doing this more than once per session,
 * so if a chunk still fails after the reload the error is shown instead
 * of looping.
 */
function lazyWithRetry<T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
): ReturnType<typeof lazy<T["default"]>> {
  return lazy(() =>
    factory().catch(async (err: unknown) => {
      const msg = String((err as Error)?.message ?? "");
      const isChunkErr =
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Loading (chunk|CSS chunk) [\d]+ failed/i.test(msg) ||
        /Importing a module script failed/i.test(msg) ||
        (err as Error)?.name === "ChunkLoadError";

      // Only auto-recover in production builds. In dev, Vite module imports can
      // fail transiently (HMR reconnects, server restart) and triggering a
      // reload loop here makes development impossible.
      if (!isChunkErr || !navigator.onLine || !import.meta.env.PROD) throw err;

      // Only recover once per session.  If chunks still fail after our
      // reload, the deployment is broken and looping won't help.
      const RECOVERY_KEY = "_artix_lazy_recovery_done";
      if (sessionStorage.getItem(RECOVERY_KEY) === "1") throw err;
      try {
        sessionStorage.setItem(RECOVERY_KEY, "1");
      } catch {}

      // Nuke the SW and all caches so the reload gets a clean slate.
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
          await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
        }
        if (window.caches) {
          const keys = await caches.keys().catch(() => [] as string[]);
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
        }
      } catch {}

      // One clean reload.  The never-resolving promise swallows the
      // error so no other handler (ErrorBoundary, window.onerror,
      // unhandledrejection) ever sees it — zero cascade.
      window.location.reload();
      return new Promise<never>(() => {});
    }),
  );
}

export const Dashboard = lazyWithRetry(() => import("@/pages/dashboard"));
export const POS = lazyWithRetry(() => import("@/pages/pos"));
export const Products = lazyWithRetry(() => import("@/pages/products"));
export const Analytics = lazyWithRetry(() => import("@/pages/analytics"));
export const PendingOrders = lazyWithRetry(() => import("@/pages/pending-orders"));
export const Settings = lazyWithRetry(() => import("@/pages/settings"));
export const NotificationPreferences = lazyWithRetry(() => import("@/pages/notification-preferences"));
export const Transactions = lazyWithRetry(() => import("@/pages/transactions"));
export const AdminIndex = lazyWithRetry(() => import("@/pages/admin/index"));
export const AdminBranches = lazyWithRetry(() => import("@/pages/admin/branches"));
export const AdminUsers = lazyWithRetry(() => import("@/pages/admin/users"));
export const AdminAnalytics = lazyWithRetry(() => import("@/pages/admin/analytics"));
export const AdminAuditLogs = lazyWithRetry(() => import("@/pages/admin/audit-logs"));
export const AdminPermissions = lazyWithRetry(() => import("@/pages/admin/permissions"));
export const Customers = lazyWithRetry(() => import("@/pages/customers"));
export const Expenses = lazyWithRetry(() => import("@/pages/expenses"));
export const Shifts = lazyWithRetry(() => import("@/pages/shifts"));
export const DiscountCodes = lazyWithRetry(() => import("@/pages/discount-codes"));
export const Refunds = lazyWithRetry(() => import("@/pages/refunds"));
export const TablesPage = lazyWithRetry(() => import("@/pages/tables"));
export const KitchenPage = lazyWithRetry(() => import("@/pages/kitchen"));
export const KitchenDisplayPage = lazyWithRetry(() => import("@/pages/kitchen-display"));
export const SuppliersPage = lazyWithRetry(() => import("@/pages/suppliers"));
export const PurchasesPage = lazyWithRetry(() => import("@/pages/purchases"));
export const TimeClockPage = lazyWithRetry(() => import("@/pages/timeclock"));
export const Onboarding = lazyWithRetry(() => import("@/pages/onboarding"));
export const AppointmentsPage = lazyWithRetry(() => import("@/pages/appointments"));
export const StaffPage = lazyWithRetry(() => import("@/pages/staff"));
export const RoomsPage = lazyWithRetry(() => import("@/pages/rooms"));
export const MembershipsPage = lazyWithRetry(() => import("@/pages/memberships"));
export const BillingPage = lazyWithRetry(() => import("@/pages/billing"));
export const TermsPage = lazyWithRetry(() => import("@/pages/terms"));
export const PrivacyPage = lazyWithRetry(() => import("@/pages/privacy"));
export const PrintSettings = lazyWithRetry(() => import("@/pages/print-settings"));
export const HardwareSettings = lazyWithRetry(() => import("@/pages/hardware-settings"));
export const LoyaltyPage = lazyWithRetry(() => import("@/pages/loyalty"));
export const WifiVouchersPage = lazyWithRetry(() => import("@/pages/wifi-vouchers"));
export const PayrollPage = lazyWithRetry(() => import("@/pages/payroll"));
export const SchedulesPage = lazyWithRetry(() => import("@/pages/schedules"));
export const BIRPage = lazyWithRetry(() => import("@/pages/bir"));
export const BIRAuditLogPage = lazyWithRetry(() => import("@/pages/bir-audit-log"));
export const ExpiryTrackerPage = lazyWithRetry(() => import("@/pages/expiry-tracker"));
export const FeaturesPage = lazyWithRetry(() => import("@/pages/features"));
export const InventoryHubPage = lazyWithRetry(() => import("@/pages/inventory-hub"));
export const IngredientsPage = lazyWithRetry(() => import("@/pages/ingredients"));
export const VercelAnalytics = lazyWithRetry(() =>
  import("@vercel/analytics/react").then((m) => ({ default: m.Analytics })),
);

export const ALL_LAZY_ROUTES: Array<() => Promise<unknown>> = [
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
  () => import("@/pages/features"),
  () => import("@/pages/admin/index"),
  () => import("@/pages/admin/branches"),
  () => import("@/pages/admin/users"),
  () => import("@/pages/admin/analytics"),
  () => import("@/pages/admin/audit-logs"),
  () => import("@/pages/admin/permissions"),
];

export const PRIORITY_LAZY_ROUTES = ALL_LAZY_ROUTES.slice(0, 5);
export const DEFERRED_LAZY_ROUTES = ALL_LAZY_ROUTES.slice(5);
