import { pgTable, text, integer, boolean, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  deletedAt: text("deleted_at"),
});

// ─── Branches ─────────────────────────────────────────────────────────────────

export type OpeningHours = {
  [day: string]: { open: string; close: string; closed: boolean };
};

export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  description: text("description"),
  color: text("color"),
  timezone: text("timezone"),
  taxRate: text("tax_rate"),
  openingHours: jsonb("opening_hours").$type<OpeningHours>(),
  isActive: boolean("is_active").default(true),
  isMain: boolean("is_main").default(false),
  // Each branch can be a different business (e.g. main is a cafe, second is a salon).
  businessType: text("business_type"),
  businessSubType: text("business_sub_type"),
  deletedAt: text("deleted_at"),
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
  // Payroll fields
  wageType: text("wage_type").default("none"), // none | hourly | monthly | commission
  wageRate: text("wage_rate").default("0"),
  commissionPercent: text("commission_percent").default("0"),
  // PIN clock-in (staff only — owners/managers use full login)
  staffPin: text("staff_pin"),           // scrypt-hashed 4-6 digit PIN
  pinLockedUntil: text("pin_locked_until"), // ISO timestamp — set after repeated failures
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  previousHash: text("previous_hash"),
  recordHash: text("record_hash"),
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
  // ── Perishable / Pharmacy fields ─────────────────────────────────────────
  expiryDate: text("expiry_date"),
  batchNumber: text("batch_number"),
  requiresPrescription: boolean("requires_prescription").default(false),
  genericName: text("generic_name"),
  deletedAt: text("deleted_at"),
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
  deletedAt: text("deleted_at"),
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
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  status: text("status").notNull().default("pending"), // pending | received | cancelled
  paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | partial | paid
  totalAmount: text("total_amount").notNull().default("0"),
  notes: text("notes"),
  expectedDeliveryAt: text("expected_delivery_at"),
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

// ─── Supplier Products (catalog of products each supplier carries) ─────────────
export const supplierProducts = pgTable("supplier_products", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  productId: integer("product_id").notNull().references(() => products.id),
  unitCost: text("unit_cost").notNull().default("0"),
  minOrderQty: integer("min_order_qty").notNull().default(1),
  leadDays: integer("lead_days"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
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
  lifetimePoints: integer("lifetime_points").default(0),
  tier: text("tier").default("none"), // none | bronze | silver | gold | platinum
  birthday: text("birthday"), // ISO date string YYYY-MM-DD
  stampCount: integer("stamp_count").default(0),
  referredBy: integer("referred_by"), // customer.id who referred
  deletedAt: text("deleted_at"),
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
  deletedAt: text("deleted_at"),
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
  // Cash drawer tracking
  cashIn: text("cash_in").default("0"),
  cashOut: text("cash_out").default("0"),
  cashAdjustments: text("cash_adjustments"), // JSON: [{type,amount,reason,timestamp}]
  denominationOpen: text("denomination_open"), // JSON: {1000:n,500:n,...}
  denominationClose: text("denomination_close"), // JSON: {1000:n,500:n,...}
  variance: text("variance"), // actual closing - expected closing
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
  deletedAt: text("deleted_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── OR Number Sequences (per-tenant atomic BIR counter) ──────────────────────
// Each row holds the last-used sequence value for one tenant.
// The atomic INSERT ... ON CONFLICT DO UPDATE in createSale eliminates
// the TOCTOU race of the old COUNT(*)+1 approach.
export const orSequences = pgTable("or_sequences", {
  tenantId: text("tenant_id").primaryKey(),
  nextVal: integer("next_val").notNull().default(0),
});

// ─── Sales ────────────────────────────────────────────────────────────────────

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tenantId: text("tenant_id").references(() => tenants.id),
  branchId: integer("branch_id").references(() => branches.id),
  cashierId: text("cashier_id"), // user.id of cashier who rang up the sale (for commission/tips)
  receiptNumber: text("receipt_number"),
  orNumber: text("or_number"),
  invoiceNumber: text("invoice_number"),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"), // Free-text guest name (Starbucks-style, not a stored customer)
  tableId: integer("table_id").references(() => tables.id),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: jsonb("items").notNull().$type<any[]>(),
  subtotal: text("subtotal").notNull(),
  tax: text("tax").default("0"),
  discount: text("discount").default("0"),
  discountCode: text("discount_code"),
  loyaltyDiscount: text("loyalty_discount").default("0"),
  tip: text("tip").default("0"),
  total: text("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: text("payment_amount"),
  changeAmount: text("change_amount"),
  notes: text("notes"),
  deletedAt: text("deleted_at"),
  deletedBy: text("deleted_by"),
  voidReason: text("void_reason"),
  refundedAt: text("refunded_at"),
  refundedBy: text("refunded_by"),
  // BIR Compliance fields
  discountType: text("discount_type").default("regular"), // regular | sc | pwd
  scPwdId: text("sc_pwd_id"),
  vatableSales: text("vatable_sales").default("0"),
  vatExemptSales: text("vat_exempt_sales").default("0"),
  zeroRatedSales: text("zero_rated_sales").default("0"),
  // Tamper-evident SHA-256 hash covering all fiscal fields of this sale.
  // Any post-insertion modification to OR/totals/VAT will break this hash,
  // making tampering detectable during a BIR audit.
  saleHash: text("sale_hash"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Refunds ──────────────────────────────────────────────────────────────────

export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => sales.id),
  userId: text("user_id").notNull().references(() => users.id),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  cashierId: text("cashier_id"),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"), // Free-text guest name
  tableId: integer("table_id").references(() => tables.id),
  orderNumber: integer("order_number"),
  kitchenStatus: text("kitchen_status").default("pending"), // pending | preparing | ready | done
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: jsonb("items").notNull().$type<any[]>(),
  subtotal: text("subtotal").notNull(),
  tax: text("tax").default("0"),
  discount: text("discount").default("0"),
  discountCode: text("discount_code"),
  loyaltyDiscount: text("loyalty_discount").default("0"),
  tip: text("tip").default("0"),
  total: text("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: text("payment_amount"),
  changeAmount: text("change_amount"),
  status: text("status").default("unpaid"),
  notes: text("notes"),
  orderType: text("order_type"), // "dine_in" | "takeout" | null
  deletedAt: text("deleted_at"),
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
  loyaltyExpiryDays: integer("loyalty_expiry_days").default(0),
  loyaltyBirthdayBonus: integer("loyalty_birthday_bonus").default(0),
  loyaltyReferralBonus: integer("loyalty_referral_bonus").default(0),
  loyaltyStampTarget: integer("loyalty_stamp_target").default(10),
  loyaltyStampEnabled: integer("loyalty_stamp_enabled").default(0),
  businessType: text("business_type"),
  businessSubType: text("business_sub_type"),
  onboardingComplete: integer("onboarding_complete").default(0),
  paymentMethods: jsonb("payment_methods").$type<{ id: string; label: string; isCash: boolean }[]>(),
  monthlyRevenueGoal: text("monthly_revenue_goal"),
  receiptWidth: text("receipt_width").default("58mm"),
  receiptTitle: text("receipt_title").default("OFFICIAL RECEIPT"),
  receiptHeaderText: text("receipt_header_text"),
  receiptWebsite: text("receipt_website"),
  receiptShowAddress: integer("receipt_show_address").default(1),
  receiptShowPhone: integer("receipt_show_phone").default(1),
  receiptShowEmail: integer("receipt_show_email").default(0),
  receiptShowWebsite: integer("receipt_show_website").default(0),
  receiptShowOrderNumber: integer("receipt_show_order_number").default(1),
  receiptShowCashier: integer("receipt_show_cashier").default(0),
  receiptShowUnitPrice: integer("receipt_show_unit_price").default(0),
  receiptShowPoweredBy: integer("receipt_show_powered_by").default(1),
  printDarkness: integer("print_darkness").default(65000),
  receiptFontSize: integer("receipt_font_size").default(15),
  // Café WiFi voucher settings
  wifiSsid: text("wifi_ssid"),
  wifiPassword: text("wifi_password"),
  wifiDurationMinutes: integer("wifi_duration_minutes").default(60),
  wifiAutoIssue: integer("wifi_auto_issue").default(0),
  country: text("country"),
  // BIR Compliance (Philippines Bureau of Internal Revenue)
  tin: text("tin"),
  ptuNumber: text("ptu_number"),
  accreditationNumber: text("accreditation_number"),
  accreditationDate: text("accreditation_date"),
  machineSerialNumber: text("machine_serial_number"),
  vatRegistered: integer("vat_registered").default(1),
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
  deletedAt: text("deleted_at"),
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
  deletedAt: text("deleted_at"),
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
  deletedAt: text("deleted_at"),
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
  deletedAt: text("deleted_at"),
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
  deletedAt: text("deleted_at"),
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
  clockOutNotes: text("clock_out_notes"),
  breakStart: text("break_start"),   // ISO timestamp when current break started
  breakMinutes: integer("break_minutes").default(0), // total accumulated break minutes
  deletedAt: text("deleted_at"),
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

// ─── AI Memories ───────────────────────────────────────────────────────────────
// Stores compressed atomic facts extracted from AI conversations.
// Persists across sessions even if chat history is deleted.
// Scoped by tenantId (owner isolation) + businessType (cross-learning).

export const aiMemories = pgTable("ai_memories", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  businessType: text("business_type"),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"),
  importanceScore: integer("importance_score").notNull().default(5),
  accessCount: integer("access_count").notNull().default(0),
  lastAccessedAt: text("last_accessed_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  expiresAt: text("expires_at"),
});

export type AiMemory = typeof aiMemories.$inferSelect;

// ─── Ingredients (Raw Materials for Recipes) ──────────────────────────────────

export const ingredients = pgTable("ingredients", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("pcs"), // g | ml | pcs | kg | l
  stockQty: text("stock_qty").notNull().default("0"),
  lowStockThreshold: text("low_stock_threshold").default("0"),
  costPerUnit: text("cost_per_unit").default("0"),
  notes: text("notes"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Product Recipes (BOM linking products to ingredients) ────────────────────

export const productRecipes = pgTable("product_recipes", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  quantity: text("quantity").notNull().default("0"), // amount of ingredient (in its unit) used per 1 product
});

// ─── WiFi Vouchers (per-branch customer WiFi codes) ───────────────────────────

export const wifiVouchers = pgTable("wifi_vouchers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  code: text("code").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  status: text("status").notNull().default("unused"), // unused | active | expired
  saleId: integer("sale_id").references(() => sales.id),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  redeemedAt: text("redeemed_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // "restock" | "low_stock"
  title: text("title").notNull(),
  message: text("message"),
  productId: integer("product_id"),
  readAt: text("read_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type Notification = typeof notifications.$inferSelect;

// ─── Stock Logs ────────────────────────────────────────────────────────────────

export const stockLogs = pgTable("stock_logs", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  userId: text("user_id").notNull().references(() => users.id),
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").default("manual"), // "manual" | "sale" | "restock" | "adjustment"
  note: text("note"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type StockLog = typeof stockLogs.$inferSelect;

// ─── Waste / Spoilage Log ─────────────────────────────────────────────────────

export const wasteLog = pgTable("waste_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: integer("branch_id").references(() => branches.id),
  productId: integer("product_id").references(() => products.id),
  ingredientId: integer("ingredient_id").references(() => ingredients.id),
  itemName: text("item_name").notNull(),
  quantity: text("quantity").notNull().default("0"),
  unit: text("unit").default("pcs"),
  reason: text("reason").notNull().default("expired"), // expired | damaged | theft | sample | cooking_loss | other
  costImpact: text("cost_impact").notNull().default("0"),
  note: text("note"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type WasteLogEntry = typeof wasteLog.$inferSelect;

// ─── Stock Transfers (branch-to-branch) ───────────────────────────────────────

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  fromBranchId: integer("from_branch_id").references(() => branches.id),
  toBranchId: integer("to_branch_id").references(() => branches.id),
  status: text("status").notNull().default("pending"), // pending | in_transit | received | rejected
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at"),
});

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull().references(() => stockTransfers.id),
  productId: integer("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  note: text("note"),
});

export type StockTransfer = typeof stockTransfers.$inferSelect;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;

// ─── Loyalty Tiers ─────────────────────────────────────────────────────────────

export const loyaltyTiers = pgTable("loyalty_tiers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(), // e.g. "Bronze", "Silver"
  minLifetimePoints: integer("min_lifetime_points").notNull().default(0),
  multiplier: text("multiplier").notNull().default("1"), // point earning multiplier
  color: text("color").notNull().default("#CD7F32"), // hex color
  perks: text("perks"), // free-text description of perks
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: text("deleted_at"),
});

export type LoyaltyTier = typeof loyaltyTiers.$inferSelect;

// ─── Loyalty Rewards Catalog ───────────────────────────────────────────────────

export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("discount_fixed"),
  // type: "discount_fixed" | "discount_percent" | "free_product" | "stamp_card" | "custom"
  pointsCost: integer("points_cost").notNull().default(100),
  value: text("value").notNull().default("0"),
  // for discount_fixed: currency amount; discount_percent: 0-100; free_product: productId; custom: text
  productId: integer("product_id").references(() => products.id),
  isActive: boolean("is_active").default(true),
  deletedAt: text("deleted_at"),
  maxRedemptions: integer("max_redemptions"), // null = unlimited
  redemptionCount: integer("redemption_count").default(0),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;

// ─── Loyalty Points Log ────────────────────────────────────────────────────────

export const loyaltyPointsLog = pgTable("loyalty_points_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  delta: integer("delta").notNull(), // positive = earn, negative = spend
  balance: integer("balance").notNull().default(0), // points balance after this change
  reason: text("reason").notNull().default("purchase"),
  // reason: "purchase" | "redeem_discount" | "redeem_product" | "birthday" | "referral" | "manual" | "expiry" | "stamp_bonus"
  saleId: integer("sale_id"),
  rewardId: integer("reward_id").references(() => loyaltyRewards.id),
  note: text("note"),
  expiresAt: text("expires_at"), // for points expiry
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type LoyaltyPointsLog = typeof loyaltyPointsLog.$inferSelect;

// ─── Payroll Periods ──────────────────────────────────────────────────────────

export const payrollPeriods = pgTable("payroll_periods", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id), // owner who created it
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("draft"), // draft | finalized | paid
  totalAmount: text("total_amount").default("0"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  finalizedAt: text("finalized_at"),
  paidAt: text("paid_at"),
  deletedAt: text("deleted_at"),
});

// ─── Payroll Entries (per employee per period) ────────────────────────────────

export const payrollEntries = pgTable("payroll_entries", {
  id: serial("id").primaryKey(),
  periodId: integer("period_id").notNull().references(() => payrollPeriods.id),
  employeeUserId: text("employee_user_id").notNull().references(() => users.id),
  employeeName: text("employee_name").notNull(),
  wageType: text("wage_type").notNull().default("hourly"),
  wageRate: text("wage_rate").notNull().default("0"),
  hoursWorked: text("hours_worked").default("0"),
  baseAmount: text("base_amount").notNull().default("0"),
  commissionAmount: text("commission_amount").default("0"),
  tipAmount: text("tip_amount").default("0"),
  bonusAmount: text("bonus_amount").default("0"),
  deductionAmount: text("deduction_amount").default("0"),
  advanceAmount: text("advance_amount").default("0"),
  netAmount: text("net_amount").notNull().default("0"),
  notes: text("notes"),
});

export type Ingredient = typeof ingredients.$inferSelect;
export type ProductRecipe = typeof productRecipes.$inferSelect;
export type WifiVoucher = typeof wifiVouchers.$inferSelect;
export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type PayrollEntry = typeof payrollEntries.$inferSelect;

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
  expiryDate: z.string().optional().nullable(),
  batchNumber: z.string().optional().nullable(),
  requiresPrescription: z.boolean().optional().nullable(),
  genericName: z.string().optional().nullable(),
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
  birthday: z.string().optional().nullable(),
  referredBy: z.number().int().optional().nullable(),
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
  tip: z.string().optional(),
  total: z.string(),
  paymentMethod: z.string().optional(),
  paymentAmount: z.string().optional().nullable(),
  changeAmount: z.string().optional().nullable(),
  customerId: z.number().optional().nullable(),
  customerName: z.string().optional().nullable(),
  tableId: z.number().optional().nullable(),
  cashierId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
  // BIR compliance fields
  discountType: z.string().optional().nullable(),
  scPwdId: z.string().optional().nullable(),
  vatableSales: z.string().optional().nullable(),
  vatExemptSales: z.string().optional().nullable(),
  zeroRatedSales: z.string().optional().nullable(),
});

export const insertPendingOrderSchema = z.object({
  items: z.array(z.any()),
  subtotal: z.string(),
  tax: z.string().optional(),
  discount: z.string().optional(),
  discountCode: z.string().optional().nullable(),
  loyaltyDiscount: z.string().optional(),
  tip: z.string().optional(),
  total: z.string(),
  paymentMethod: z.string().optional(),
  paymentAmount: z.string().optional().nullable(),
  changeAmount: z.string().optional().nullable(),
  customerId: z.number().optional().nullable(),
  customerName: z.string().optional().nullable(),
  tableId: z.number().optional().nullable(),
  cashierId: z.string().optional().nullable(),
  orderNumber: z.number().optional().nullable(),
  kitchenStatus: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
  orderType: z.string().optional().nullable(),
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
  loyaltyExpiryDays: z.union([z.number(), z.string()]).optional().nullable(),
  loyaltyBirthdayBonus: z.union([z.number(), z.string()]).optional().nullable(),
  loyaltyReferralBonus: z.union([z.number(), z.string()]).optional().nullable(),
  loyaltyStampTarget: z.union([z.number(), z.string()]).optional().nullable(),
  loyaltyStampEnabled: z.union([z.boolean(), z.number()]).optional().nullable(),
  businessType: z.string().optional().nullable(),
  businessSubType: z.string().optional().nullable(),
  onboardingComplete: z.number().optional(),
  paymentMethods: z.array(z.object({ id: z.string(), label: z.string(), isCash: z.boolean() })).optional().nullable(),
  monthlyRevenueGoal: z.string().optional().nullable(),
  receiptWidth: z.string().optional().nullable(),
  receiptTitle: z.string().optional().nullable(),
  receiptHeaderText: z.string().optional().nullable(),
  receiptWebsite: z.string().optional().nullable(),
  receiptShowAddress: z.number().optional().nullable(),
  receiptShowPhone: z.number().optional().nullable(),
  receiptShowEmail: z.number().optional().nullable(),
  receiptShowWebsite: z.number().optional().nullable(),
  receiptShowOrderNumber: z.number().optional().nullable(),
  receiptShowCashier: z.number().optional().nullable(),
  receiptShowUnitPrice: z.number().optional().nullable(),
  receiptShowPoweredBy: z.number().optional().nullable(),
  printDarkness: z.number().optional().nullable(),
  receiptFontSize: z.number().optional().nullable(),
  wifiSsid: z.string().optional().nullable(),
  wifiPassword: z.string().optional().nullable(),
  wifiDurationMinutes: z.number().optional().nullable(),
  wifiAutoIssue: z.number().optional().nullable(),
  country: z.string().optional().nullable(),
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
  paymentStatus: z.string().optional(),
  notes: z.string().optional().nullable(),
  expectedDeliveryAt: z.string().optional().nullable(),
  items: z.array(z.object({
    productId: z.number().optional().nullable(),
    productName: z.string(),
    quantity: z.number(),
    unitCost: z.string(),
    totalCost: z.string(),
  })).optional(),
});

export const insertSupplierProductSchema = z.object({
  productId: z.number(),
  unitCost: z.string().default("0"),
  minOrderQty: z.number().default(1),
  leadDays: z.number().optional().nullable(),
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
  denominationOpen: z.string().optional().nullable(),
});

export const closeShiftSchema = z.object({
  closingBalance: z.string(),
  notes: z.string().optional().nullable(),
  denominationClose: z.string().optional().nullable(),
  variance: z.string().optional().nullable(),
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

export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type InsertSupplierProduct = z.infer<typeof insertSupplierProductSchema>;

export type Shift = typeof shifts.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;

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

// ─── Insert Schemas for new tables ───────────────────────────────────────────

export const insertIngredientSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1).default("pcs"),
  stockQty: z.string().default("0"),
  lowStockThreshold: z.string().optional().nullable(),
  costPerUnit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const upsertProductRecipeSchema = z.object({
  productId: z.number(),
  items: z.array(z.object({
    ingredientId: z.number(),
    quantity: z.string(),
  })),
});

export const insertWifiVoucherSchema = z.object({
  durationMinutes: z.number().int().positive().default(60),
  customerName: z.string().optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  branchId: z.number().optional().nullable(),
});

export const insertPayrollPeriodSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export const updatePayrollEntrySchema = z.object({
  hoursWorked: z.string().optional(),
  baseAmount: z.string().optional(),
  commissionAmount: z.string().optional(),
  tipAmount: z.string().optional(),
  bonusAmount: z.string().optional(),
  deductionAmount: z.string().optional(),
  advanceAmount: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const updateUserWageSchema = z.object({
  wageType: z.enum(["none", "hourly", "monthly", "commission"]),
  wageRate: z.string().default("0"),
  commissionPercent: z.string().default("0"),
});

export type InsertIngredient = z.infer<typeof insertIngredientSchema>;
export type InsertWifiVoucher = z.infer<typeof insertWifiVoucherSchema>;
export type InsertPayrollPeriod = z.infer<typeof insertPayrollPeriodSchema>;
export type UpdatePayrollEntry = z.infer<typeof updatePayrollEntrySchema>;
export type UpdateUserWage = z.infer<typeof updateUserWageSchema>;

// ─── Loyalty Insert Schemas ───────────────────────────────────────────────────

export const insertLoyaltyTierSchema = z.object({
  name: z.string().min(1),
  minLifetimePoints: z.number().int().min(0).default(0),
  multiplier: z.string().default("1"),
  color: z.string().default("#CD7F32"),
  perks: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export const insertLoyaltyRewardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(["discount_fixed", "discount_percent", "free_product", "stamp_card", "custom"]),
  pointsCost: z.number().int().min(1),
  value: z.string().default("0"),
  productId: z.number().int().optional().nullable(),
  isActive: z.boolean().default(true),
  maxRedemptions: z.number().int().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export type InsertLoyaltyTier = z.infer<typeof insertLoyaltyTierSchema>;
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;

// ─── Revoked Tokens ───────────────────────────────────────────────────────────
// Stores JWT IDs (jti) that have been explicitly revoked (e.g. on logout).
// jwtAuthMiddleware checks this before trusting any token.
// Rows are pruned automatically once their expiresAt has passed.

export const revokedTokens = pgTable("revoked_tokens", {
  id: serial("id").primaryKey(),
  jti: text("jti").notNull().unique(),
  userId: text("user_id").notNull(),
  revokedAt: text("revoked_at").$defaultFn(() => new Date().toISOString()),
  expiresAt: text("expires_at").notNull(),
});

export type RevokedToken = typeof revokedTokens.$inferSelect;

// ─── Push Subscriptions ───────────────────────────────────────────────────────
// Stores Web Push API subscriptions so the server can send background
// notifications (low stock, new orders) even when the app is not open.

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
