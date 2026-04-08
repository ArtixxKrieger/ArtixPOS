import { pgTable, text, integer, boolean, serial, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Branches ─────────────────────────────────────────────────────────────────

export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  isMain: boolean("is_main").default(false),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  avatar: text("avatar"),
  provider: text("provider").notNull(),
  providerId: text("provider_id").notNull(),
  tenantId: text("tenant_id").references(() => tenants.id),
  role: text("role").default("owner"), // owner | manager | admin | cashier
  passwordHash: text("password_hash"),
  isBanned: boolean("is_banned").default(false),
  bannedAt: text("banned_at"),
  banReason: text("ban_reason"),
  lastSeenAt: text("last_seen_at"),
  resetToken: text("reset_token"),
  resetTokenExpires: text("reset_token_expires"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── User Branches ────────────────────────────────────────────────────────────

export const userBranches = pgTable("user_branches", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").notNull().references(() => branches.id),
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Invite Tokens ────────────────────────────────────────────────────────────

export const inviteTokens = pgTable("invite_tokens", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  token: text("token").notNull().unique(),
  role: text("role").notNull(), // manager | admin | cashier
  branchIds: jsonb("branch_ids").$type<number[]>(),
  createdBy: text("created_by").notNull().references(() => users.id),
  usedBy: text("used_by").references(() => users.id),
  usedAt: text("used_at"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Products ─────────────────────────────────────────────────────────────────

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  price: text("price").notNull().default("0"),
  category: text("category"),
  sku: text("sku"),
  barcode: text("barcode"),
  taxRate: text("tax_rate"),
  trackStock: boolean("track_stock").default(false),
  stock: integer("stock").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(10),
  hasSizes: boolean("has_sizes").default(false),
  hasModifiers: boolean("has_modifiers").default(false),
  sizes: jsonb("sizes").$type<{ name: string; price: string }[]>(),
  modifiers: jsonb("modifiers").$type<{ name: string; price: string }[]>(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const productSizes = pgTable("product_sizes", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  sizeName: text("size_name").notNull(),
  price: text("price").notNull(),
});

export const productModifiers = pgTable("product_modifiers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  modifierName: text("modifier_name").notNull(),
  price: text("price").notNull(),
});

// ─── Tables (Dine-in) ─────────────────────────────────────────────────────────

export const tables = pgTable("tables", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  seats: integer("seats").default(4),
  status: text("status").notNull().default("available"), // available | occupied | reserved
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Suppliers ────────────────────────────────────────────────────────────────

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  status: text("status").notNull().default("pending"), // pending | received | cancelled
  totalAmount: text("total_amount").notNull().default("0"),
  notes: text("notes"),
  orderedAt: text("ordered_at").$defaultFn(() => new Date().toISOString()),
  receivedAt: text("received_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitCost: text("unit_cost").notNull().default("0"),
  totalCost: text("total_cost").notNull().default("0"),
});

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  totalSpent: text("total_spent").default("0"),
  visitCount: integer("visit_count").default(0),
  loyaltyPoints: integer("loyalty_points").default(0),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  category: text("category").notNull().default("General"),
  description: text("description").notNull(),
  amount: text("amount").notNull(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  status: text("status").notNull().default("open"), // open | closed
  openingBalance: text("opening_balance").notNull().default("0"),
  closingBalance: text("closing_balance"),
  totalSales: text("total_sales").default("0"),
  totalExpenses: text("total_expenses").default("0"),
  salesCount: integer("sales_count").default(0),
  notes: text("notes"),
  openedAt: text("opened_at").$defaultFn(() => new Date().toISOString()),
  closedAt: text("closed_at"),
});

// ─── Discount Codes ───────────────────────────────────────────────────────────

export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  code: text("code").notNull(),
  type: text("type").notNull().default("percentage"), // percentage | fixed
  value: text("value").notNull(),
  minOrder: text("min_order").default("0"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  isActive: boolean("is_active").default(true),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Sales ────────────────────────────────────────────────────────────────────

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id),
  tableId: integer("table_id").references(() => tables.id),
  items: jsonb("items").notNull().$type<any[]>(),
  subtotal: text("subtotal").notNull(),
  tax: text("tax").default("0"),
  discount: text("discount").default("0"),
  discountCode: text("discount_code"),
  loyaltyDiscount: text("loyalty_discount").default("0"),
  total: text("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: text("payment_amount"),
  changeAmount: text("change_amount"),
  notes: text("notes"),
  deletedAt: text("deleted_at"),
  deletedBy: text("deleted_by"),
  refundedAt: text("refunded_at"),
  refundedBy: text("refunded_by"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Refunds ──────────────────────────────────────────────────────────────────

export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => sales.id),
  userId: text("user_id").notNull().references(() => users.id),
  items: jsonb("items").$type<any[]>(),
  amount: text("amount").notNull(),
  reason: text("reason"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Pending Orders ───────────────────────────────────────────────────────────

export const pendingOrders = pgTable("pending_orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id),
  tableId: integer("table_id").references(() => tables.id),
  orderNumber: integer("order_number"),
  kitchenStatus: text("kitchen_status").default("pending"), // pending | preparing | ready | done
  items: jsonb("items").notNull().$type<any[]>(),
  subtotal: text("subtotal").notNull(),
  tax: text("tax").default("0"),
  discount: text("discount").default("0"),
  discountCode: text("discount_code"),
  loyaltyDiscount: text("loyalty_discount").default("0"),
  total: text("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: text("payment_amount"),
  changeAmount: text("change_amount"),
  status: text("status").default("unpaid"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── User Settings ────────────────────────────────────────────────────────────

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id),
  storeName: text("store_name"),
  currency: text("currency"),
  taxRate: text("tax_rate"),
  address: text("address"),
  phone: text("phone"),
  emailContact: text("email_contact"),
  receiptFooter: text("receipt_footer"),
  timezone: text("timezone"),
  loyaltyPointsPerUnit: text("loyalty_points_per_unit").default("1"),
  loyaltyRedemptionRate: text("loyalty_redemption_rate").default("100"),
  businessType: text("business_type"),
  businessSubType: text("business_sub_type"),
  onboardingComplete: integer("onboarding_complete").default(0),
  paymentMethods: jsonb("payment_methods").$type<{ id: string; label: string; isCash: boolean }[]>(),
  monthlyRevenueGoal: text("monthly_revenue_goal"),
});

// ─── Service Staff ────────────────────────────────────────────────────────────

export const serviceStaff = pgTable("service_staff", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  specialty: text("specialty"),
  phone: text("phone"),
  email: text("email"),
  color: text("color").default("#6366f1"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Service Rooms / Stations / Chairs ────────────────────────────────────────

export const serviceRooms = pgTable("service_rooms", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  type: text("type").default("room"), // room | chair | station | court | lane
  status: text("status").default("available"), // available | occupied | maintenance
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id),
  staffId: integer("staff_id").references(() => serviceStaff.id),
  roomId: integer("room_id").references(() => serviceRooms.id),
  title: text("title").notNull(),
  serviceType: text("service_type"),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  duration: integer("duration").default(60),
  status: text("status").default("scheduled"), // scheduled | confirmed | in_progress | completed | cancelled | no_show
  notes: text("notes"),
  price: text("price").default("0"),
  tip: text("tip").default("0"),
  reminderSent: boolean("reminder_sent").default(false),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Membership Plans ─────────────────────────────────────────────────────────

export const membershipPlans = pgTable("membership_plans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  price: text("price").notNull().default("0"),
  billingCycle: text("billing_cycle").default("monthly"), // monthly | quarterly | annual | one_time
  durationDays: integer("duration_days").default(30),
  features: jsonb("features").$type<string[]>(),
  maxCheckIns: integer("max_check_ins"),
  isActive: boolean("is_active").default(true),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Memberships (Customer Enrollments) ───────────────────────────────────────

export const memberships = pgTable("memberships", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  planId: integer("plan_id").references(() => membershipPlans.id),
  planName: text("plan_name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").default("active"), // active | expired | cancelled | paused
  checkInsUsed: integer("check_ins_used").default(0),
  totalPaid: text("total_paid").default("0"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Membership Check-ins ─────────────────────────────────────────────────────

export const membershipCheckIns = pgTable("membership_check_ins", {
  id: serial("id").primaryKey(),
  membershipId: integer("membership_id").notNull().references(() => memberships.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  userId: text("user_id").notNull().references(() => users.id),
  notes: text("notes"),
  checkedInAt: text("checked_in_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Time Logs (Employee Time Tracking) ───────────────────────────────────────

export const timeLogs = pgTable("time_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  clockIn: text("clock_in").notNull(),
  clockOut: text("clock_out"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Role Permissions ─────────────────────────────────────────────────────────

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  role: text("role").notNull(), // manager | cashier
  maxDiscountPercent: integer("max_discount_percent").default(100),
  canRefund: boolean("can_refund").default(true),
  canDeleteSale: boolean("can_delete_sale").default(true),
  canVoidOrder: boolean("can_void_order").default(true),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export type RolePermission = typeof rolePermissions.$inferSelect;

// ─── Tenant Subscriptions ─────────────────────────────────────────────────────

export const tenantSubscriptions = pgTable("tenant_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().unique().references(() => tenants.id),
  plan: text("plan").notNull().default("free"), // free | pro
  billingCycle: text("billing_cycle"), // monthly | annual
  status: text("status").notNull().default("active"), // active | cancelled | expired
  currentPeriodStart: text("current_period_start"),
  currentPeriodEnd: text("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const subscriptionPayments = pgTable("subscription_payments", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  plan: text("plan").notNull(),
  billingCycle: text("billing_cycle").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | failed
  paymongoCheckoutId: text("paymongo_checkout_id"),
  checkoutUrl: text("checkout_url"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type TenantSubscription = typeof tenantSubscriptions.$inferSelect;
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).extend({
  email: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
});

export const insertTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

export const insertBranchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const insertUserBranchSchema = z.object({
  userId: z.string(),
  branchId: z.number(),
});

export const insertProductSchema = z.object({
  name: z.string().min(1),
  price: z.string().min(1),
  category: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  taxRate: z.string().optional().nullable(),
  trackStock: z.boolean().optional().nullable(),
  stock: z.number().optional().nullable(),
  lowStockThreshold: z.number().optional().nullable(),
  hasSizes: z.boolean().optional().nullable(),
  hasModifiers: z.boolean().optional().nullable(),
  sizes: z.array(z.object({ name: z.string(), price: z.string() })).optional().nullable(),
  modifiers: z.array(z.object({ name: z.string(), price: z.string() })).optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const insertTableSchema = z.object({
  name: z.string().min(1),
  seats: z.number().optional(),
  status: z.string().optional(),
  branchId: z.number().optional().nullable(),
});

export const insertCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const insertExpenseSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.string().min(1),
  branchId: z.number().optional().nullable(),
});

export const insertSaleSchema = z.object({
  items: z.array(z.any()),
  subtotal: z.string(),
  tax: z.string().optional(),
  discount: z.string().optional(),
  discountCode: z.string().optional().nullable(),
  loyaltyDiscount: z.string().optional(),
  total: z.string(),
  paymentMethod: z.string().optional(),
  paymentAmount: z.string().optional().nullable(),
  changeAmount: z.string().optional().nullable(),
  customerId: z.number().optional().nullable(),
  tableId: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const insertPendingOrderSchema = z.object({
  items: z.array(z.any()),
  subtotal: z.string(),
  tax: z.string().optional(),
  discount: z.string().optional(),
  discountCode: z.string().optional().nullable(),
  loyaltyDiscount: z.string().optional(),
  total: z.string(),
  paymentMethod: z.string().optional(),
  paymentAmount: z.string().optional().nullable(),
  changeAmount: z.string().optional().nullable(),
  customerId: z.number().optional().nullable(),
  tableId: z.number().optional().nullable(),
  orderNumber: z.number().optional().nullable(),
  kitchenStatus: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const insertUserSettingSchema = z.object({
  storeName: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  taxRate: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  emailContact: z.string().optional().nullable(),
  receiptFooter: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  loyaltyPointsPerUnit: z.string().optional(),
  loyaltyRedemptionRate: z.string().optional(),
  businessType: z.string().optional().nullable(),
  businessSubType: z.string().optional().nullable(),
  onboardingComplete: z.number().optional(),
  paymentMethods: z.array(z.object({ id: z.string(), label: z.string(), isCash: z.boolean() })).optional().nullable(),
  monthlyRevenueGoal: z.string().optional().nullable(),
});

export const insertDiscountCodeSchema = z.object({
  code: z.string().min(1),
  type: z.enum(["percentage", "fixed"]),
  value: z.string().min(1),
  minOrder: z.string().optional(),
  maxUses: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().optional().nullable(),
});

export const insertRefundSchema = z.object({
  saleId: z.number(),
  items: z.array(z.any()).optional(),
  amount: z.string(),
  reason: z.string().optional().nullable(),
});

export const insertSupplierSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const insertPurchaseOrderSchema = z.object({
  supplierId: z.number().optional().nullable(),
  status: z.string().optional(),
  totalAmount: z.string().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    productId: z.number().optional().nullable(),
    productName: z.string(),
    quantity: z.number(),
    unitCost: z.string(),
    totalCost: z.string(),
  })).optional(),
});

export const insertTimeLogSchema = z.object({
  clockIn: z.string(),
  clockOut: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const insertServiceStaffSchema = z.object({
  name: z.string().min(1),
  specialty: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const insertServiceRoomSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const insertAppointmentSchema = z.object({
  customerId: z.number().optional().nullable(),
  staffId: z.number().optional().nullable(),
  roomId: z.number().optional().nullable(),
  title: z.string().min(1),
  serviceType: z.string().optional().nullable(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  duration: z.number().optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  price: z.string().optional(),
  tip: z.string().optional(),
  branchId: z.number().optional().nullable(),
});

export const insertMembershipPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.string(),
  billingCycle: z.string().optional(),
  durationDays: z.number().optional(),
  features: z.array(z.string()).optional().nullable(),
  maxCheckIns: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const insertMembershipSchema = z.object({
  customerId: z.number(),
  planId: z.number().optional().nullable(),
  planName: z.string(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  status: z.string().optional(),
  totalPaid: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const insertMembershipCheckInSchema = z.object({
  membershipId: z.number(),
  customerId: z.number(),
  notes: z.string().optional().nullable(),
});

export const insertShiftSchema = z.object({
  openingBalance: z.string(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const closeShiftSchema = z.object({
  closingBalance: z.string(),
  notes: z.string().optional().nullable(),
});

export type UserRole = "owner" | "manager" | "admin" | "cashier";

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Tenant = typeof tenants.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type UserBranch = typeof userBranches.$inferSelect;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Table = typeof tables.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type Sale = typeof sales.$inferSelect;
export type InsertSale = z.infer<typeof insertSaleSchema>;

export type PendingOrder = typeof pendingOrders.$inferSelect;
export type InsertPendingOrder = z.infer<typeof insertPendingOrderSchema>;

export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = z.infer<typeof insertUserSettingSchema>;

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = z.infer<typeof insertDiscountCodeSchema>;

export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = z.infer<typeof insertRefundSchema>;

export type RefundWithDetails = Refund & {
  sale?: Sale;
  saleCreatedAt?: string;
  processedByName?: string;
  processedByEmail?: string;
};

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type Shift = typeof shifts.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;

export type InviteToken = typeof inviteTokens.$inferSelect;

export type TimeLog = typeof timeLogs.$inferSelect;
export type InsertTimeLog = z.infer<typeof insertTimeLogSchema>;

export type ServiceStaff = typeof serviceStaff.$inferSelect;
export type InsertServiceStaff = z.infer<typeof insertServiceStaffSchema>;

export type ServiceRoom = typeof serviceRooms.$inferSelect;
export type InsertServiceRoom = z.infer<typeof insertServiceRoomSchema>;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type MembershipPlan = typeof membershipPlans.$inferSelect;
export type InsertMembershipPlan = z.infer<typeof insertMembershipPlanSchema>;

export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;

export type MembershipCheckIn = typeof membershipCheckIns.$inferSelect;
export type InsertMembershipCheckIn = z.infer<typeof insertMembershipCheckInSchema>;
