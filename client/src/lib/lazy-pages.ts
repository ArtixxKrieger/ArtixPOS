import { lazy } from "react";

/**
 * Wraps React.lazy() with automatic cache-clearing recovery for stale-deployment
 * chunk load failures (e.g. "Failed to fetch dynamically imported module").
 *
 * When a lazy chunk 404s after a new deployment, this clears all SW caches and
 * the SW registration itself, then reloads — so the browser fetches fresh HTML
 * and the correct new chunk hashes. Without this, a plain reload() lets the SW
 * re-serve the same stale HTML, causing an infinite error loop.
 *
 * A sessionStorage counter prevents runaway reload loops (max 3 attempts).
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

      const RETRY_KEY = "_artix_lazy_retry";
      const attempts = Number(sessionStorage.getItem(RETRY_KEY) ?? "0");
      if (attempts >= 3) throw err;
      sessionStorage.setItem(RETRY_KEY, String(attempts + 1));

      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
          await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
        }
        if (window.caches) {
          const keys = await caches.keys().catch(() => [] as string[]);
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
        }
      } catch {
        // ignore — reload regardless
      }

      window.location.reload();
      // Return a never-resolving promise so React.lazy doesn't render anything
      // while the page is reloading.
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
