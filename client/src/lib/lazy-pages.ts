import { lazy } from "react";

export const Dashboard = lazy(() => import("@/pages/dashboard"));
export const POS = lazy(() => import("@/pages/pos"));
export const Products = lazy(() => import("@/pages/products"));
export const Analytics = lazy(() => import("@/pages/analytics"));
export const PendingOrders = lazy(() => import("@/pages/pending-orders"));
export const Settings = lazy(() => import("@/pages/settings"));
export const Transactions = lazy(() => import("@/pages/transactions"));
export const AdminIndex = lazy(() => import("@/pages/admin/index"));
export const AdminBranches = lazy(() => import("@/pages/admin/branches"));
export const AdminUsers = lazy(() => import("@/pages/admin/users"));
export const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));
export const AdminAuditLogs = lazy(() => import("@/pages/admin/audit-logs"));
export const AdminPermissions = lazy(() => import("@/pages/admin/permissions"));
export const Customers = lazy(() => import("@/pages/customers"));
export const Expenses = lazy(() => import("@/pages/expenses"));
export const Shifts = lazy(() => import("@/pages/shifts"));
export const DiscountCodes = lazy(() => import("@/pages/discount-codes"));
export const Refunds = lazy(() => import("@/pages/refunds"));
export const TablesPage = lazy(() => import("@/pages/tables"));
export const KitchenPage = lazy(() => import("@/pages/kitchen"));
export const KitchenDisplayPage = lazy(() => import("@/pages/kitchen-display"));
export const SuppliersPage = lazy(() => import("@/pages/suppliers"));
export const PurchasesPage = lazy(() => import("@/pages/purchases"));
export const TimeClockPage = lazy(() => import("@/pages/timeclock"));
export const Onboarding = lazy(() => import("@/pages/onboarding"));
export const AppointmentsPage = lazy(() => import("@/pages/appointments"));
export const StaffPage = lazy(() => import("@/pages/staff"));
export const RoomsPage = lazy(() => import("@/pages/rooms"));
export const MembershipsPage = lazy(() => import("@/pages/memberships"));
export const BillingPage = lazy(() => import("@/pages/billing"));
export const TermsPage = lazy(() => import("@/pages/terms"));
export const PrivacyPage = lazy(() => import("@/pages/privacy"));
export const PrintSettings = lazy(() => import("@/pages/print-settings"));
export const HardwareSettings = lazy(() => import("@/pages/hardware-settings"));
export const LoyaltyPage = lazy(() => import("@/pages/loyalty"));
export const WifiVouchersPage = lazy(() => import("@/pages/wifi-vouchers"));
export const PayrollPage = lazy(() => import("@/pages/payroll"));
export const SchedulesPage = lazy(() => import("@/pages/schedules"));
export const BIRPage = lazy(() => import("@/pages/bir"));
export const BIRAuditLogPage = lazy(() => import("@/pages/bir-audit-log"));
export const ExpiryTrackerPage = lazy(() => import("@/pages/expiry-tracker"));
export const FeaturesPage = lazy(() => import("@/pages/features"));
export const InventoryHubPage = lazy(() => import("@/pages/inventory-hub"));
export const IngredientsPage = lazy(() => import("@/pages/ingredients"));
export const VercelAnalytics = lazy(() =>
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
