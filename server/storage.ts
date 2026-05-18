import { db } from "./db";
import { dbRead } from "./db-read";
import { createHash } from "crypto";
import {
  products,
  pendingOrders,
  sales,
  userSettings,
  users,
  customers,
  expenses,
  shifts,
  discountCodes,
  refunds,
  tables,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  timeLogs,
  serviceStaff,
  serviceRooms,
  appointments,
  membershipPlans,
  memberships,
  membershipCheckIns,
  ingredients,
  productRecipes,
  wifiVouchers,
  payrollPeriods,
  payrollEntries,
  type Ingredient,
  type InsertIngredient,
  type ProductRecipe,
  type WifiVoucher,
  type InsertWifiVoucher,
  type PayrollPeriod,
  type InsertPayrollPeriod,
  type PayrollEntry,
  type UpdatePayrollEntry,
  type Product,
  type InsertProduct,
  type PendingOrder,
  type InsertPendingOrder,
  type Sale,
  type InsertSale,
  type UserSetting,
  type InsertUserSetting,
  type Customer,
  type InsertCustomer,
  type Expense,
  type InsertExpense,
  type Shift,
  type DiscountCode,
  type InsertDiscountCode,
  type Refund,
  type InsertRefund,
  type RefundWithDetails,
  type Table,
  type InsertTable,
  supplierProducts,
  type Supplier,
  type InsertSupplier,
  type SupplierProduct,
  type InsertSupplierProduct,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type InsertPurchaseOrder,
  type TimeLog,
  type ServiceStaff,
  type InsertServiceStaff,
  type ServiceRoom,
  type InsertServiceRoom,
  type Appointment,
  type InsertAppointment,
  type MembershipPlan,
  type InsertMembershipPlan,
  type Membership,
  type InsertMembership,
  type MembershipCheckIn,
  type InsertMembershipCheckIn,
  notifications,
  type Notification,
  stockLogs,
  type StockLog,
  wasteLog,
  type WasteLogEntry,
  stockTransfers,
  stockTransferItems,
  type StockTransfer,
  type StockTransferItem,
  loyaltyTiers,
  type LoyaltyTier,
  type InsertLoyaltyTier,
  loyaltyRewards,
  type LoyaltyReward,
  type InsertLoyaltyReward,
  loyaltyPointsLog,
  type LoyaltyPointsLog,
} from "@shared/schema";
import { eq, and, isNull, isNotNull, inArray, desc, sql, type SQL } from "drizzle-orm";

export interface IStorage {
  // Products
  getProducts(userId: string): Promise<Product[]>;
  getLowStockProducts(userId: string, branchId?: number | null): Promise<Product[]>;
  getProduct(id: number, userId: string): Promise<Product | undefined>;
  createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product>;
  updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number, userId: string): Promise<void>;
  adjustStock(id: number, userId: string, delta: number): Promise<Product | undefined>;
  setStock(id: number, userId: string, newStock: number): Promise<Product | undefined>;
  getStockLogs(productId: number, userId: string): Promise<StockLog[]>;

  // Pending Orders
  getPendingOrders(userId: string, branchId?: number | null): Promise<PendingOrder[]>;
  getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined>;
  createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder>;
  updatePendingOrder(id: number, userId: string, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined>;
  deletePendingOrder(id: number, userId: string): Promise<void>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(userId: string, data: { type: string; title: string; message?: string; productId?: number }): Promise<void>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Sales
  getSales(userId: string, opts?: { limit?: number; offset?: number; startDate?: string; endDate?: string; customerId?: number; branchId?: number | null; includeVoided?: boolean }): Promise<Sale[]>;
  getSaleById(id: number, userId: string): Promise<Sale | undefined>;
  createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale>;
  softDeleteSale(id: number, userId: string, deletedBy: string, reason?: string): Promise<boolean>;
  getDeletedSales(userId: string): Promise<Sale[]>;

  deductIngredientsForSale(userId: string, items: { productId: number; quantity: number }[]): Promise<void>;

  // Settings
  getSettings(userId: string): Promise<UserSetting | undefined>;
  updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting>;

  // Customers
  getCustomers(userId: string, opts?: { limit?: number; offset?: number; orderByTopSpenders?: boolean }): Promise<Customer[]>;
  getCustomer(id: number, userId: string): Promise<Customer | undefined>;
  createCustomer(userId: string, customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, userId: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number, userId: string): Promise<void>;
  updateCustomerStats(id: number, amount: number): Promise<void>;

  // Loyalty Tiers
  getLoyaltyTiers(userId: string): Promise<LoyaltyTier[]>;
  createLoyaltyTier(userId: string, tier: InsertLoyaltyTier): Promise<LoyaltyTier>;
  updateLoyaltyTier(id: number, userId: string, tier: Partial<InsertLoyaltyTier>): Promise<LoyaltyTier | undefined>;
  deleteLoyaltyTier(id: number, userId: string): Promise<void>;

  // Loyalty Rewards
  getLoyaltyRewards(userId: string): Promise<LoyaltyReward[]>;
  createLoyaltyReward(userId: string, reward: InsertLoyaltyReward): Promise<LoyaltyReward>;
  updateLoyaltyReward(id: number, userId: string, reward: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined>;
  deleteLoyaltyReward(id: number, userId: string): Promise<void>;
  redeemLoyaltyReward(customerId: number, rewardId: number, userId: string): Promise<{ customer: Customer; reward: LoyaltyReward; log: LoyaltyPointsLog } | null>;

  // Loyalty Points Log
  getLoyaltyPointsLog(customerId: number, userId: string): Promise<LoyaltyPointsLog[]>;
  addLoyaltyPointsLog(userId: string, customerId: number, delta: number, reason: string, opts?: { saleId?: number; rewardId?: number; note?: string; expiresAt?: string }): Promise<LoyaltyPointsLog>;

  // Loyalty utility
  recalcCustomerTier(customerId: number, tiers: LoyaltyTier[]): Promise<void>;

  // Expenses
  getExpenses(userId: string, branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number }): Promise<Expense[]>;
  createExpense(userId: string, expense: InsertExpense): Promise<Expense>;
  updateExpense(id: number, userId: string, expense: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: number, userId: string): Promise<void>;

  // Shifts
  getShifts(userId: string, opts?: { limit?: number; offset?: number }): Promise<Shift[]>;
  getOpenShift(userId: string): Promise<Shift | undefined>;
  openShift(userId: string, openingBalance: string, notes?: string, denominationOpen?: string): Promise<Shift>;
  closeShift(id: number, userId: string, closingBalance: string, notes?: string, denominationClose?: string, variance?: string): Promise<Shift | undefined>;
  addCashAdjustment(shiftId: number, userId: string, type: "in" | "out", amount: string, reason: string): Promise<Shift | undefined>;

  // Discount Codes
  getDiscountCodes(userId: string, opts?: { limit?: number; offset?: number }): Promise<DiscountCode[]>;
  getDiscountCodeByCode(code: string, userId: string): Promise<DiscountCode | undefined>;
  createDiscountCode(userId: string, code: InsertDiscountCode): Promise<DiscountCode>;
  updateDiscountCode(id: number, userId: string, code: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined>;
  deleteDiscountCode(id: number, userId: string): Promise<void>;
  incrementDiscountCodeUsage(id: number): Promise<boolean>;

  // Refunds
  getRefunds(userId: string): Promise<RefundWithDetails[]>;
  getRefundsBySale(saleId: number, userId: string): Promise<Refund[]>;
  createRefund(userId: string, refund: InsertRefund): Promise<Refund>;

  // Tables
  getTables(userId: string): Promise<Table[]>;
  getTable(id: number, userId: string): Promise<Table | undefined>;
  createTable(userId: string, table: InsertTable): Promise<Table>;
  updateTable(id: number, userId: string, table: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: number, userId: string): Promise<void>;

  // Suppliers
  getSuppliers(userId: string): Promise<Supplier[]>;
  createSupplier(userId: string, supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, userId: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: number, userId: string): Promise<void>;
  getSupplierStats(userId: string, supplierId: number): Promise<{ totalOrders: number; totalSpent: number; pendingAmount: number; lastOrderAt: string | null }>;

  // Supplier Products
  getSupplierProducts(supplierId: number, userId: string): Promise<(SupplierProduct & { productName: string; productSku: string | null; currentStock: number | null })[]>;
  upsertSupplierProduct(supplierId: number, userId: string, data: InsertSupplierProduct): Promise<SupplierProduct>;
  deleteSupplierProduct(id: number, userId: string): Promise<void>;

  // Purchase Orders
  getPurchaseOrders(userId: string): Promise<(PurchaseOrder & { items: PurchaseOrderItem[] })[]>;
  createPurchaseOrder(userId: string, po: InsertPurchaseOrder): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }>;
  receivePurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined>;
  cancelPurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined>;
  updatePurchaseOrderPayment(id: number, userId: string, paymentStatus: string): Promise<PurchaseOrder | undefined>;

  // Time Logs
  getTimeLogs(userId: string): Promise<TimeLog[]>;
  getActiveTimeLog(userId: string): Promise<TimeLog | undefined>;
  clockIn(userId: string, notes?: string): Promise<TimeLog>;
  clockOut(userId: string, notes?: string): Promise<TimeLog | undefined>;
  startBreak(userId: string): Promise<TimeLog | undefined>;
  endBreak(userId: string): Promise<TimeLog | undefined>;
  getTeamTimeLogs(userId: string): Promise<{
    id: number;
    userId: string;
    clockIn: string;
    clockOut: string | null;
    notes: string | null;
    clockOutNotes: string | null;
    breakStart: string | null;
    breakMinutes: number | null;
    createdAt: string | null;
    userName: string | null;
    userEmail: string | null;
  }[]>;

  // Product barcode lookup
  getProductByBarcode(barcode: string, userId: string): Promise<Product | undefined>;

  // Loyalty points
  adjustLoyaltyPoints(customerId: number, delta: number, userId: string, opts?: { reason?: string; saleId?: number; rewardId?: number; note?: string }): Promise<Customer | undefined>;

  // Service Staff
  getServiceStaff(userId: string, branchId?: number | null): Promise<ServiceStaff[]>;
  getServiceStaffMember(id: number, userId: string): Promise<ServiceStaff | undefined>;
  createServiceStaff(userId: string, staff: InsertServiceStaff): Promise<ServiceStaff>;
  updateServiceStaff(id: number, userId: string, staff: Partial<InsertServiceStaff>): Promise<ServiceStaff | undefined>;
  deleteServiceStaff(id: number, userId: string): Promise<void>;

  // Service Rooms
  getServiceRooms(userId: string, branchId?: number | null): Promise<ServiceRoom[]>;
  createServiceRoom(userId: string, room: InsertServiceRoom): Promise<ServiceRoom>;
  updateServiceRoom(id: number, userId: string, room: Partial<InsertServiceRoom>): Promise<ServiceRoom | undefined>;
  deleteServiceRoom(id: number, userId: string): Promise<void>;

  // Appointments
  getAppointments(userId: string, opts?: { date?: string; staffId?: number; status?: string }): Promise<Appointment[]>;
  getAppointment(id: number, userId: string): Promise<Appointment | undefined>;
  createAppointment(userId: string, appt: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, userId: string, appt: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number, userId: string): Promise<void>;

  // Membership Plans
  getMembershipPlans(userId: string): Promise<MembershipPlan[]>;
  createMembershipPlan(userId: string, plan: InsertMembershipPlan): Promise<MembershipPlan>;
  updateMembershipPlan(id: number, userId: string, plan: Partial<InsertMembershipPlan>): Promise<MembershipPlan | undefined>;
  deleteMembershipPlan(id: number, userId: string): Promise<void>;

  // Memberships
  getMemberships(userId: string): Promise<(Membership & { customerName: string | null; customerPhone: string | null })[]>;
  getMembership(id: number, userId: string): Promise<Membership | undefined>;
  createMembership(userId: string, m: InsertMembership): Promise<Membership>;
  updateMembership(id: number, userId: string, m: Partial<InsertMembership>): Promise<Membership | undefined>;
  deleteMembership(id: number, userId: string): Promise<void>;
  checkInMember(userId: string, data: InsertMembershipCheckIn): Promise<MembershipCheckIn>;
  getCheckIns(membershipId: number, userId: string): Promise<MembershipCheckIn[]>;
}

// 5-minute in-memory cache for tenant user ID lookups (2 DB queries per call without this)
const _tenantUserCache = new Map<string, { ids: string[]; at: number }>();
const TENANT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateTenantCache(userId: string): void {
  _tenantUserCache.delete(userId);
}

export class DatabaseStorage implements IStorage {

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getTenantUserIds(userId: string): Promise<string[]> {
    const cached = _tenantUserCache.get(userId);
    if (cached && Date.now() - cached.at < TENANT_CACHE_TTL) return cached.ids;
    const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId));
    let ids: string[] = [userId];
    if (user?.tenantId) {
      const tenantUsers = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, user.tenantId));
      if (tenantUsers.length > 0) ids = tenantUsers.map(u => u.id);
    }
    _tenantUserCache.set(userId, { ids, at: Date.now() });
    return ids;
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  async getProducts(
    userId: string,
    branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number },
  ): Promise<Product[]> {
    try {
      const isOpts = (v: unknown): v is { branchId?: number | null; limit?: number; offset?: number } =>
        typeof v === "object" && v !== null;
      const branchId: number | null | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.branchId : branchIdOrOpts;
      const limit: number | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.limit : undefined;
      const offset: number = (isOpts(branchIdOrOpts) ? branchIdOrOpts.offset : undefined) ?? 0;
      const userIds = await this.getTenantUserIds(userId);
      const conditions: SQL<unknown>[] = [];
      conditions.push(userIds.length === 1 ? eq(products.userId, userIds[0]) : inArray(products.userId, userIds));
      if (branchId != null) conditions.push(eq(products.branchId, branchId));
      const baseQuery = dbRead.select().from(products).where(and(...conditions)).orderBy(desc(products.id));
      return await (typeof limit === "number" && limit > 0
        ? baseQuery.limit(limit).offset(offset)
        : baseQuery);
    } catch (error) {
      console.error("Error fetching products:", error);
      return [];
    }
  }

  async getLowStockProducts(userId: string, branchId?: number | null): Promise<Product[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const conditions: SQL<unknown>[] = [
        isNull(products.deletedAt),
        eq(products.trackStock, true),
        sql`${products.stock} <= ${products.lowStockThreshold}`,
        userIds.length === 1 ? eq(products.userId, userIds[0]) : inArray(products.userId, userIds),
      ];
      if (branchId != null) conditions.push(eq(products.branchId, branchId));
      return await dbRead.select().from(products).where(and(...conditions)).orderBy(products.stock);
    } catch (error) {
      console.error("Error fetching low-stock products:", error);
      return [];
    }
  }

  async getProduct(id: number, userId: string): Promise<Product | undefined> {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, id));
      if (!product) return undefined;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user?.tenantId) {
        return product.userId === userId ? product : undefined;
      }
      const [productOwner] = await db.select().from(users).where(eq(users.id, product.userId));
      if (productOwner?.tenantId === user.tenantId) return product;
      return undefined;
    } catch (error) {
      console.error("Error fetching product:", error);
      return undefined;
    }
  }

  async createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await db.insert(products).values({ ...product, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating product:", error);
      throw error;
    }
  }

  async updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined> {
    try {
      const existing = await this.getProduct(id, userId);
      if (!existing) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(products)
        .set(product as any)
        .where(eq(products.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating product:", error);
      return undefined;
    }
  }

  async deleteProduct(id: number, userId: string): Promise<void> {
    try {
      const existing = await this.getProduct(id, userId);
      if (!existing) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(products).set({ deletedAt: new Date().toISOString() } as any).where(eq(products.id, id));
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  }

  async adjustStock(id: number, userId: string, delta: number): Promise<Product | undefined> {
    try {
      const existing = await this.getProduct(id, userId);
      if (!existing) return undefined;
      const previousStock = existing.stock ?? 0;
      // Use a SQL expression for the increment so concurrent stock adjustments
      // can't race and overwrite each other (eliminates the read-modify-write gap).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(products)
        .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) + ${delta})` } as any)
        .where(eq(products.id, id))
        .returning();
      if (updated) {
        const newStock = updated.stock ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(stockLogs).values({
          productId: id,
          userId,
          previousStock,
          newStock,
          delta: newStock - previousStock,
          reason: "adjustment",
        } as any).catch(() => {});
      }
      return updated;
    } catch (error) {
      console.error("Error adjusting stock:", error);
      return undefined;
    }
  }

  async setStock(id: number, userId: string, newStock: number): Promise<Product | undefined> {
    try {
      const existing = await this.getProduct(id, userId);
      if (!existing) return undefined;
      const previousStock = existing.stock ?? 0;
      const clampedStock = Math.max(0, newStock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(products)
        .set({ stock: clampedStock } as any)
        .where(eq(products.id, id))
        .returning();
      if (updated) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(stockLogs).values({
          productId: id,
          userId,
          previousStock,
          newStock: clampedStock,
          delta: clampedStock - previousStock,
          reason: "restock",
        } as any).catch(() => {});
      }
      return updated;
    } catch (error) {
      console.error("Error setting stock:", error);
      return undefined;
    }
  }

  async getStockLogs(productId: number, userId: string): Promise<StockLog[]> {
    try {
      const product = await this.getProduct(productId, userId);
      if (!product) return [];
      return await db.select().from(stockLogs)
        .where(eq(stockLogs.productId, productId))
        .orderBy(desc(stockLogs.createdAt))
        .limit(50);
    } catch (error) {
      console.error("Error fetching stock logs:", error);
      return [];
    }
  }

  // ─── Pending Orders ───────────────────────────────────────────────────────

  async getPendingOrders(userId: string, branchId?: number | null): Promise<PendingOrder[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const conditions: SQL<unknown>[] = [];
      conditions.push(userIds.length === 1 ? eq(pendingOrders.userId, userIds[0]) : inArray(pendingOrders.userId, userIds));
      if (branchId != null) conditions.push(eq(pendingOrders.branchId, branchId));
      conditions.push(isNull(pendingOrders.deletedAt));
      return await db.select().from(pendingOrders).where(and(...conditions)).orderBy(desc(pendingOrders.id)).limit(300);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      return [];
    }
  }

  async getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const conditions = userIds.length === 1
        ? and(eq(pendingOrders.id, id), eq(pendingOrders.userId, userIds[0]), isNull(pendingOrders.deletedAt))
        : and(eq(pendingOrders.id, id), inArray(pendingOrders.userId, userIds), isNull(pendingOrders.deletedAt));
      const [order] = await db.select().from(pendingOrders).where(conditions);
      return order;
    } catch (error) {
      console.error("Error fetching pending order:", error);
      return undefined;
    }
  }

  async createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await db.insert(pendingOrders).values({ ...order, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating pending order:", error);
      throw error;
    }
  }

  async updatePendingOrder(id: number, userId: string, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined> {
    try {
      const existing = await this.getPendingOrder(id, userId);
      if (!existing) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(pendingOrders)
        .set(order as any)
        .where(eq(pendingOrders.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating pending order:", error);
      return undefined;
    }
  }

  async deletePendingOrder(id: number, userId: string): Promise<void> {
    try {
      const existing = await this.getPendingOrder(id, userId);
      if (!existing) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(pendingOrders).set({ deletedAt: new Date().toISOString() } as any).where(eq(pendingOrders.id, id));
    } catch (error) {
      console.error("Error deleting pending order:", error);
      throw error;
    }
  }

  // ─── Sales ────────────────────────────────────────────────────────────────

  async getSales(userId: string, opts: { limit?: number; offset?: number; startDate?: string; endDate?: string; customerId?: number; branchId?: number | null; includeVoided?: boolean } = {}): Promise<Sale[]> {
    try {
      const { limit = 200, offset = 0, startDate, endDate, customerId, branchId, includeVoided = false } = opts;
      const userIds = await this.getTenantUserIds(userId);
      const userCondition = userIds.length === 1
        ? eq(sales.userId, userIds[0])
        : inArray(sales.userId, userIds);
      const conditions: any[] = [userCondition];
      if (!includeVoided) conditions.push(isNull(sales.deletedAt));
      if (startDate) conditions.push(sql`${sales.createdAt} >= ${startDate}`);
      if (endDate) conditions.push(sql`${sales.createdAt} <= ${endDate}`);
      if (customerId) conditions.push(eq(sales.customerId, customerId));
      if (branchId != null) conditions.push(eq(sales.branchId, branchId));
      return await dbRead.select().from(sales)
        .where(and(...conditions))
        .orderBy(desc(sales.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error("Error fetching sales:", error);
      return [];
    }
  }

  async createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saleInput = sale as any;

      // ── Resolve tenant for the per-tenant OR sequence ──────────────────────
      const [userRow] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId));
      const resolvedTenantId = userRow?.tenantId ?? userId;

      // ── Atomic per-tenant OR number via upsert sequence ─────────────────────
      // PostgreSQL row-level lock on the or_sequences row serialises concurrent
      // inserts so two simultaneous checkouts can never receive the same number.
      // This permanently replaces the old COUNT(*)+1 TOCTOU race condition.
      const seqResult = await db.execute(sql`
        INSERT INTO or_sequences (tenant_id, next_val)
        VALUES (${resolvedTenantId}, 1)
        ON CONFLICT (tenant_id) DO UPDATE
          SET next_val = or_sequences.next_val + 1
        RETURNING next_val
      `);
      const seqRows = (seqResult as any).rows ?? seqResult;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextSeq = Number((Array.isArray(seqRows) ? seqRows[0] : (seqRows as any))?.next_val ?? 1);
      const padded = String(nextSeq).padStart(6, "0");
      const receiptNumber = `SR-${padded}`;
      const orNumber      = receiptNumber;
      const invoiceNumber = `INV-${padded}`;

      // Use an explicit createdAt so it is included in the hash before insert.
      const createdAt = new Date().toISOString();

      // ── Tamper-evident SHA-256 hash (BIR compliance) ───────────────────────
      // Covers every fiscally-significant field. A BIR auditor can recompute
      // this from the raw DB row; any discrepancy proves tampering.
      const hashPayload = [
        userId,
        receiptNumber,
        orNumber,
        invoiceNumber,
        sale.subtotal   ?? "0",
        sale.tax        ?? "0",
        sale.discount   ?? "0",
        saleInput.vatableSales  ?? "0",
        saleInput.vatExemptSales ?? "0",
        saleInput.zeroRatedSales ?? "0",
        sale.total,
        saleInput.discountType  ?? "regular",
        createdAt,
      ].join("|");
      const saleHash = createHash("sha256").update(hashPayload).digest("hex");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await db.insert(sales).values({
        ...saleInput,
        userId,
        tenantId: resolvedTenantId,
        receiptNumber,
        orNumber,
        invoiceNumber,
        createdAt,
        saleHash,
        // Strip any client-supplied receipt/OR/invoice numbers so they cannot
        // override the server-generated sequence.
      } as any).returning();
      // Fire-and-forget: customer stats update runs in the background so it
      // never delays the checkout response returned to the cashier.
      if (sale.customerId) {
        void this.updateCustomerStats(sale.customerId, parseFloat(sale.total) || 0);
      }
      // Auto-deduct ingredients via product recipes (cafés / production kitchens).
      void this.deductIngredientsForSale(userId, sale.items as { productId: number; quantity: number }[]).catch((e) => {
        console.error("Recipe deduction failed:", e);
      });
      return created;
    } catch (error) {
      console.error("Error creating sale:", error);
      throw error;
    }
  }

  /** Deduct ingredient stock based on product recipes (BOM) for sold items. */
  async deductIngredientsForSale(userId: string, items: { productId: number; quantity: number }[]): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) return;
    const userIds = await this.getTenantUserIds(userId);

    // Tally quantity sold per productId
    const productQty = new Map<number, number>();
    for (const it of items) {
      const pid = Number(it?.productId);
      const qty = Number(it?.quantity ?? 1);
      if (!Number.isFinite(pid) || !Number.isFinite(qty) || qty <= 0) continue;
      productQty.set(pid, (productQty.get(pid) ?? 0) + qty);
    }
    if (productQty.size === 0) return;

    const productIds = [...productQty.keys()];
    // Fetch matching recipes (only for products in this tenant — verified via products table)
    const recipes = await db.select().from(productRecipes).where(inArray(productRecipes.productId, productIds));
    if (recipes.length === 0) return;

    // Verify products belong to tenant before applying
    const tenantProducts = await db.select({ id: products.id }).from(products).where(
      and(inArray(products.id, productIds), inArray(products.userId, userIds))
    );
    const allowedProducts = new Set(tenantProducts.map(p => p.id));

    // Aggregate ingredient deltas
    const ingredientDelta = new Map<number, number>();
    for (const r of recipes) {
      if (!allowedProducts.has(r.productId)) continue;
      const sold = productQty.get(r.productId) ?? 0;
      const perUnit = parseFloat(r.quantity || "0");
      if (sold <= 0 || !Number.isFinite(perUnit) || perUnit <= 0) continue;
      const delta = sold * perUnit;
      ingredientDelta.set(r.ingredientId, (ingredientDelta.get(r.ingredientId) ?? 0) + delta);
    }
    if (ingredientDelta.size === 0) return;

    await db.transaction(async (tx) => {
      await Promise.all(
        [...ingredientDelta.entries()].map(([ingId, delta]) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tx.update(ingredients)
            .set({ stockQty: sql`(COALESCE(stock_qty::numeric, 0) - ${delta})::text` } as any)
            .where(eq(ingredients.id, ingId))
        )
      );
    });
  }

  async getSaleById(id: number, userId: string): Promise<Sale | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const userCondition = userIds.length === 1
        ? eq(sales.userId, userIds[0])
        : inArray(sales.userId, userIds);
      const [sale] = await db.select().from(sales).where(
        and(eq(sales.id, id), userCondition, isNull(sales.deletedAt))
      );
      return sale;
    } catch (error) {
      console.error("Error fetching sale by id:", error);
      return undefined;
    }
  }

  async softDeleteSale(id: number, userId: string, deletedBy: string, reason?: string): Promise<boolean> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const userCondition = userIds.length === 1
        ? eq(sales.userId, userIds[0])
        : inArray(sales.userId, userIds);
      const [sale] = await db.select().from(sales).where(
        and(eq(sales.id, id), userCondition, isNull(sales.deletedAt))
      );
      if (!sale) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.update(sales) as any)
        .set({ deletedAt: new Date().toISOString(), deletedBy, ...(reason ? { voidReason: reason } : {}) })
        .where(eq(sales.id, id));
      return true;
    } catch (error) {
      console.error("Error soft-deleting sale:", error);
      return false;
    }
  }

  async getDeletedSales(userId: string): Promise<Sale[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const userCondition = userIds.length === 1
        ? eq(sales.userId, userIds[0])
        : inArray(sales.userId, userIds);
      return await db.select().from(sales).where(and(userCondition, isNotNull(sales.deletedAt)));
    } catch (error) {
      console.error("Error fetching deleted sales:", error);
      return [];
    }
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  async getSettings(userId: string): Promise<UserSetting | undefined> {
    try {
      const [setting] = await dbRead.select().from(userSettings).where(eq(userSettings.userId, userId));
      return setting;
    } catch (error) {
      console.error("Error fetching settings:", error);
      return undefined;
    }
  }

  async updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting> {
    try {
      const existing = await this.getSettings(userId);
      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [updated] = await db.update(userSettings)
          .set(settings as any)
          .where(eq(userSettings.userId, userId))
          .returning();
        return updated;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [created] = await db.insert(userSettings)
          .values({ ...settings, userId } as any)
          .returning();
        return created;
      }
    } catch (error) {
      console.error("Error updating settings:", error);
      throw error;
    }
  }

  // ─── Customers ────────────────────────────────────────────────────────────

  async getCustomers(
    userId: string,
    opts: { limit?: number; offset?: number; orderByTopSpenders?: boolean } = {},
  ): Promise<Customer[]> {
    try {
      const { limit, offset = 0, orderByTopSpenders = false } = opts;
      const userIds = await this.getTenantUserIds(userId);
      const whereCond = userIds.length === 1
        ? eq(customers.userId, userIds[0])
        : inArray(customers.userId, userIds);
      const orderExpr = orderByTopSpenders
        ? sql`CAST(total_spent AS NUMERIC) DESC NULLS LAST`
        : desc(customers.createdAt);
      const baseQuery = dbRead.select().from(customers).where(whereCond).orderBy(orderExpr);
      return await (typeof limit === "number" && limit > 0
        ? baseQuery.limit(limit).offset(offset)
        : baseQuery);
    } catch (error) {
      console.error("Error fetching customers:", error);
      return [];
    }
  }

  async getCustomer(id: number, userId: string): Promise<Customer | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [customer] = await db.select().from(customers).where(eq(customers.id, id));
      if (!customer) return undefined;
      if (!userIds.includes(customer.userId)) return undefined;
      return customer;
    } catch (error) {
      console.error("Error fetching customer:", error);
      return undefined;
    }
  }

  async createCustomer(userId: string, customer: InsertCustomer): Promise<Customer> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await db.insert(customers).values({ ...customer, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating customer:", error);
      throw error;
    }
  }

  async updateCustomer(id: number, userId: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined> {
    try {
      const existing = await this.getCustomer(id, userId);
      if (!existing) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(customers)
        .set(customer as any)
        .where(eq(customers.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating customer:", error);
      return undefined;
    }
  }

  async deleteCustomer(id: number, userId: string): Promise<void> {
    try {
      const existing = await this.getCustomer(id, userId);
      if (!existing) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(customers).set({ deletedAt: new Date().toISOString() } as any).where(eq(customers.id, id));
    } catch (error) {
      console.error("Error deleting customer:", error);
      throw error;
    }
  }

  async updateCustomerStats(id: number, amount: number): Promise<void> {
    try {
      // Atomic single-query update — avoids read/write race when two sales
      // are processed for the same customer at the same time.
      await db.execute(sql`
        UPDATE customers
        SET total_spent  = ROUND(COALESCE(CAST(total_spent AS NUMERIC), 0) + ${amount}, 2)::text,
            visit_count  = COALESCE(visit_count, 0) + 1
        WHERE id = ${id}
      `);
    } catch (error) {
      console.error("Error updating customer stats:", error);
    }
  }

  // ─── Expenses ─────────────────────────────────────────────────────────────

  async getExpenses(
    userId: string,
    branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number },
  ): Promise<Expense[]> {
    try {
      const isOpts = (v: unknown): v is { branchId?: number | null; limit?: number; offset?: number } =>
        typeof v === "object" && v !== null;
      const branchId: number | null | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.branchId : branchIdOrOpts;
      const limit: number | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.limit : undefined;
      const offset: number = (isOpts(branchIdOrOpts) ? branchIdOrOpts.offset : undefined) ?? 0;
      const userIds = await this.getTenantUserIds(userId);
      const conditions: SQL<unknown>[] = [];
      conditions.push(userIds.length === 1 ? eq(expenses.userId, userIds[0]) : inArray(expenses.userId, userIds));
      if (branchId != null) conditions.push(eq(expenses.branchId, branchId));
      const baseQuery = db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.createdAt));
      return await (typeof limit === "number" && limit > 0
        ? baseQuery.limit(limit).offset(offset)
        : baseQuery);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      return [];
    }
  }

  async createExpense(userId: string, expense: InsertExpense): Promise<Expense> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await db.insert(expenses).values({ ...expense, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating expense:", error);
      throw error;
    }
  }

  async updateExpense(id: number, userId: string, expense: Partial<InsertExpense>): Promise<Expense | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(expenses).where(eq(expenses.id, id));
      if (!existing || !userIds.includes(existing.userId)) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(expenses)
        .set(expense as any)
        .where(eq(expenses.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating expense:", error);
      return undefined;
    }
  }

  async deleteExpense(id: number, userId: string): Promise<void> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(expenses).where(eq(expenses.id, id));
      if (!existing || !userIds.includes(existing.userId)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(expenses).set({ deletedAt: new Date().toISOString() } as any).where(eq(expenses.id, id));
    } catch (error) {
      console.error("Error deleting expense:", error);
      throw error;
    }
  }

  // ─── Shifts ───────────────────────────────────────────────────────────────

  async getShifts(userId: string, opts: { limit?: number; offset?: number } = {}): Promise<Shift[]> {
    try {
      const { limit = 200, offset = 0 } = opts;
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1
        ? eq(shifts.userId, userIds[0])
        : inArray(shifts.userId, userIds);
      return await db.select().from(shifts)
        .where(condition)
        .orderBy(desc(shifts.openedAt))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error("Error fetching shifts:", error);
      return [];
    }
  }

  async getOpenShift(userId: string): Promise<Shift | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1
        ? and(eq(shifts.userId, userIds[0]), eq(shifts.status, "open"))
        : and(inArray(shifts.userId, userIds), eq(shifts.status, "open"));
      const [shift] = await db.select().from(shifts).where(condition);
      return shift;
    } catch (error) {
      console.error("Error fetching open shift:", error);
      return undefined;
    }
  }

  async openShift(userId: string, openingBalance: string, notes?: string, denominationOpen?: string): Promise<Shift> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await db.insert(shifts).values({
        userId,
        openingBalance,
        notes: notes ?? null,
        status: "open",
        denominationOpen: denominationOpen ?? null,
        cashIn: "0",
        cashOut: "0",
      } as any).returning();
      return created;
    } catch (error) {
      console.error("Error opening shift:", error);
      throw error;
    }
  }

  async closeShift(id: number, userId: string, closingBalance: string, notes?: string, denominationClose?: string, variance?: string): Promise<Shift | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(shifts).where(eq(shifts.id, id));
      if (!existing || !userIds.includes(existing.userId)) return undefined;

      // Calculate sales total during this shift
      const shiftSales = await db.select().from(sales).where(
        and(
          inArray(sales.userId, userIds),
          isNull(sales.deletedAt),
          sql`${sales.createdAt} >= ${existing.openedAt}`
        )
      );
      const totalSalesAmount = shiftSales.reduce((acc, s) => acc + parseFloat(s.total || "0"), 0);

      // Calculate expenses during this shift
      const shiftExpenses = await db.select().from(expenses).where(
        and(
          inArray(expenses.userId, userIds),
          sql`${expenses.createdAt} >= ${existing.openedAt}`
        )
      );
      const totalExpensesAmount = shiftExpenses.reduce((acc, e) => acc + parseFloat(e.amount || "0"), 0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(shifts)
        .set({
          status: "closed",
          closingBalance,
          closedAt: new Date().toISOString(),
          totalSales: totalSalesAmount.toFixed(2),
          totalExpenses: totalExpensesAmount.toFixed(2),
          salesCount: shiftSales.length,
          notes: notes ?? existing.notes,
          denominationClose: denominationClose ?? null,
          variance: variance ?? null,
        } as any)
        .where(eq(shifts.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error closing shift:", error);
      return undefined;
    }
  }

  async addCashAdjustment(shiftId: number, userId: string, type: "in" | "out", amount: string, reason: string): Promise<Shift | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
      if (!existing || !userIds.includes(existing.userId) || existing.status !== "open") return undefined;

      const adj = { type, amount, reason, timestamp: new Date().toISOString() };
      const existingAdjs = (() => { try { return JSON.parse(existing.cashAdjustments ?? "[]"); } catch { return []; } })();
      existingAdjs.push(adj);

      const prevIn = parseFloat(existing.cashIn ?? "0");
      const prevOut = parseFloat(existing.cashOut ?? "0");
      const amtNum = parseFloat(amount) || 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(shifts).set({
        cashAdjustments: JSON.stringify(existingAdjs),
        cashIn: type === "in" ? (prevIn + amtNum).toFixed(2) : existing.cashIn,
        cashOut: type === "out" ? (prevOut + amtNum).toFixed(2) : existing.cashOut,
      } as any).where(eq(shifts.id, shiftId)).returning();
      return updated;
    } catch (error) {
      console.error("Error adding cash adjustment:", error);
      return undefined;
    }
  }

  // ─── Discount Codes ───────────────────────────────────────────────────────

  async getDiscountCodes(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<DiscountCode[]> {
    try {
      const { limit, offset = 0 } = opts;
      const userIds = await this.getTenantUserIds(userId);
      const whereCond = userIds.length === 1
        ? and(eq(discountCodes.userId, userIds[0]), isNull(discountCodes.deletedAt))
        : and(inArray(discountCodes.userId, userIds), isNull(discountCodes.deletedAt));
      const baseQuery = db.select().from(discountCodes).where(whereCond).orderBy(desc(discountCodes.createdAt));
      return await (typeof limit === "number" && limit > 0
        ? baseQuery.limit(limit).offset(offset)
        : baseQuery);
    } catch (error) {
      console.error("Error fetching discount codes:", error);
      return [];
    }
  }

  async getDiscountCodeByCode(code: string, userId: string): Promise<DiscountCode | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const upperCode = code.toUpperCase();
      const condition = userIds.length === 1
        ? and(eq(discountCodes.code, upperCode), eq(discountCodes.userId, userIds[0]), isNull(discountCodes.deletedAt))
        : and(eq(discountCodes.code, upperCode), inArray(discountCodes.userId, userIds), isNull(discountCodes.deletedAt));
      const [dc] = await db.select().from(discountCodes).where(condition);
      return dc;
    } catch (error) {
      console.error("Error fetching discount code:", error);
      return undefined;
    }
  }

  async createDiscountCode(userId: string, code: InsertDiscountCode): Promise<DiscountCode> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await db.insert(discountCodes).values({
        ...code,
        code: code.code.toUpperCase(),
        userId,
      } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating discount code:", error);
      throw error;
    }
  }

  async updateDiscountCode(id: number, userId: string, code: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(discountCodes).where(and(eq(discountCodes.id, id), isNull(discountCodes.deletedAt)));
      if (!existing || !userIds.includes(existing.userId)) return undefined;
      const [updated] = await db.update(discountCodes)
        .set(code as any)
        .where(eq(discountCodes.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating discount code:", error);
      return undefined;
    }
  }

  async deleteDiscountCode(id: number, userId: string): Promise<void> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
      if (!existing || !userIds.includes(existing.userId)) return;
      await db.update(discountCodes).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(eq(discountCodes.id, id));
    } catch (error) {
      console.error("Error deleting discount code:", error);
      throw error;
    }
  }

  async incrementDiscountCodeUsage(id: number): Promise<boolean> {
    try {
      const result = await db.update(discountCodes)
        .set({ usedCount: sql`COALESCE(used_count, 0) + 1` } as any)
        .where(and(
          eq(discountCodes.id, id),
          sql`(max_uses IS NULL OR COALESCE(used_count, 0) < max_uses)`
        ))
        .returning({ id: discountCodes.id });
      return result.length > 0;
    } catch (error) {
      console.error("Error incrementing discount code usage:", error);
      return false;
    }
  }

  // ─── Refunds ──────────────────────────────────────────────────────────────

  async getRefunds(userId: string): Promise<RefundWithDetails[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const userCondition = userIds.length === 1
        ? eq(refunds.userId, userIds[0])
        : inArray(refunds.userId, userIds);

      const results = await db
        .select({
          id: refunds.id,
          saleId: refunds.saleId,
          userId: refunds.userId,
          items: refunds.items,
          amount: refunds.amount,
          reason: refunds.reason,
          createdAt: refunds.createdAt,
          processedByName: users.name,
          processedByEmail: users.email,
          saleTotal: sales.total,
          saleCreatedAt: sales.createdAt,
        })
        .from(refunds)
        .leftJoin(users, eq(refunds.userId, users.id))
        .leftJoin(sales, eq(refunds.saleId, sales.id))
        .where(userCondition)
        .orderBy(desc(refunds.createdAt))
        .limit(500);

      return results as RefundWithDetails[];
    } catch (error) {
      console.error("Error fetching refunds:", error);
      return [];
    }
  }

  async getRefundsBySale(saleId: number, userId: string): Promise<Refund[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      // Verify the sale belongs to this tenant before returning its refunds.
      // Without this check any authenticated user could enumerate another
      // tenant's refund data by guessing sale IDs.
      const saleOwnerCond = userIds.length === 1
        ? and(eq(sales.id, saleId), eq(sales.userId, userIds[0]))
        : and(eq(sales.id, saleId), inArray(sales.userId, userIds));
      const [saleRow] = await db.select({ id: sales.id }).from(sales).where(saleOwnerCond);
      if (!saleRow) return [];
      return await db.select().from(refunds).where(eq(refunds.saleId, saleId));
    } catch (error) {
      console.error("Error fetching refunds by sale:", error);
      return [];
    }
  }

  async createRefund(userId: string, refund: InsertRefund): Promise<Refund> {
    try {
      const [created] = await db.insert(refunds).values({ ...refund, userId } as any).returning();
      // Mark the sale as refunded
      await (db.update(sales) as any)
        .set({ refundedAt: new Date().toISOString(), refundedBy: userId })
        .where(eq(sales.id, refund.saleId));
      return created;
    } catch (error) {
      console.error("Error creating refund:", error);
      throw error;
    }
  }

  // ─── Tables ───────────────────────────────────────────────────────────────

  async getTables(userId: string): Promise<Table[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1 ? and(eq(tables.userId, userIds[0]), isNull(tables.deletedAt)) : and(inArray(tables.userId, userIds), isNull(tables.deletedAt));
      return await db.select().from(tables).where(condition).orderBy(tables.name);
    } catch (error) {
      console.error("Error fetching tables:", error);
      return [];
    }
  }

  async getTable(id: number, userId: string): Promise<Table | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [table] = await db.select().from(tables).where(and(eq(tables.id, id), isNull(tables.deletedAt)));
      if (!table || !userIds.includes(table.userId)) return undefined;
      return table;
    } catch (error) {
      console.error("Error fetching table:", error);
      return undefined;
    }
  }

  async createTable(userId: string, table: InsertTable): Promise<Table> {
    try {
      const [created] = await db.insert(tables).values({ ...table, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating table:", error);
      throw error;
    }
  }

  async updateTable(id: number, userId: string, table: Partial<InsertTable>): Promise<Table | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(tables).where(and(eq(tables.id, id), isNull(tables.deletedAt)));
      if (!existing || !userIds.includes(existing.userId)) return undefined;
      const [updated] = await db.update(tables).set(table as any).where(eq(tables.id, id)).returning();
      return updated;
    } catch (error) {
      console.error("Error updating table:", error);
      return undefined;
    }
  }

  async deleteTable(id: number, userId: string): Promise<void> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(tables).where(eq(tables.id, id));
      if (!existing || !userIds.includes(existing.userId)) return;
      await db.update(tables).set({ deletedAt: new Date().toISOString() } as any).where(eq(tables.id, id));
    } catch (error) {
      console.error("Error deleting table:", error);
      throw error;
    }
  }

  // ─── Suppliers ────────────────────────────────────────────────────────────

  async getSuppliers(userId: string): Promise<Supplier[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1 ? and(eq(suppliers.userId, userIds[0]), isNull(suppliers.deletedAt)) : and(inArray(suppliers.userId, userIds), isNull(suppliers.deletedAt));
      return await db.select().from(suppliers).where(condition).orderBy(suppliers.name);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      return [];
    }
  }

  async createSupplier(userId: string, supplier: InsertSupplier): Promise<Supplier> {
    try {
      const [created] = await db.insert(suppliers).values({ ...supplier, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating supplier:", error);
      throw error;
    }
  }

  async updateSupplier(id: number, userId: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
      if (!existing || !userIds.includes(existing.userId)) return undefined;
      const [updated] = await db.update(suppliers).set(supplier as any).where(eq(suppliers.id, id)).returning();
      return updated;
    } catch (error) {
      console.error("Error updating supplier:", error);
      return undefined;
    }
  }

  async deleteSupplier(id: number, userId: string): Promise<void> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id));
      if (!existing || !userIds.includes(existing.userId)) return;
      await db.update(suppliers).set({ deletedAt: new Date().toISOString() } as any).where(eq(suppliers.id, id));
    } catch (error) {
      console.error("Error deleting supplier:", error);
      throw error;
    }
  }

  async getSupplierStats(userId: string, supplierId: number): Promise<{ totalOrders: number; totalSpent: number; pendingAmount: number; lastOrderAt: string | null }> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1
        ? and(eq(purchaseOrders.supplierId, supplierId), eq(purchaseOrders.userId, userIds[0]))
        : and(eq(purchaseOrders.supplierId, supplierId), inArray(purchaseOrders.userId, userIds));
      const pos = await db.select().from(purchaseOrders).where(condition).orderBy(desc(purchaseOrders.createdAt));
      const totalOrders = pos.length;
      const totalSpent = pos.filter(p => p.status === "received").reduce((s, p) => s + parseFloat(p.totalAmount || "0"), 0);
      const pendingAmount = pos.filter(p => p.status === "pending").reduce((s, p) => s + parseFloat(p.totalAmount || "0"), 0);
      const lastOrderAt = pos[0]?.createdAt ?? null;
      return { totalOrders, totalSpent, pendingAmount, lastOrderAt };
    } catch {
      return { totalOrders: 0, totalSpent: 0, pendingAmount: 0, lastOrderAt: null };
    }
  }

  // ─── Supplier Products ────────────────────────────────────────────────────

  async getSupplierProducts(supplierId: number, _userId: string): Promise<(SupplierProduct & { productName: string; productSku: string | null; currentStock: number | null })[]> {
    try {
      const rows = await db.select({
        id: supplierProducts.id,
        supplierId: supplierProducts.supplierId,
        productId: supplierProducts.productId,
        unitCost: supplierProducts.unitCost,
        minOrderQty: supplierProducts.minOrderQty,
        leadDays: supplierProducts.leadDays,
        createdAt: supplierProducts.createdAt,
        productName: products.name,
        productSku: products.sku,
        currentStock: products.stock,
      })
        .from(supplierProducts)
        .innerJoin(products, eq(products.id, supplierProducts.productId))
        .where(eq(supplierProducts.supplierId, supplierId))
        .orderBy(products.name);
      return rows;
    } catch {
      return [];
    }
  }

  async upsertSupplierProduct(supplierId: number, userId: string, data: InsertSupplierProduct): Promise<SupplierProduct> {
    const [existing] = await db.select().from(supplierProducts)
      .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.productId, data.productId)));
    if (existing) {
      const [updated] = await db.update(supplierProducts)
        .set({ unitCost: data.unitCost, minOrderQty: data.minOrderQty ?? 1, leadDays: data.leadDays ?? null } as any)
        .where(eq(supplierProducts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(supplierProducts).values({ supplierId, ...data } as any).returning();
    return created;
  }

  async deleteSupplierProduct(id: number, _userId: string): Promise<void> {
    await db.delete(supplierProducts).where(eq(supplierProducts.id, id));
  }

  // ─── Purchase Orders ──────────────────────────────────────────────────────

  async getPurchaseOrders(userId: string): Promise<(PurchaseOrder & { items: PurchaseOrderItem[] })[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1 ? eq(purchaseOrders.userId, userIds[0]) : inArray(purchaseOrders.userId, userIds);
      const pos = await db.select().from(purchaseOrders).where(condition).orderBy(desc(purchaseOrders.createdAt)).limit(200);
      if (pos.length === 0) return [];
      // Batch-fetch all items in one query instead of one query per PO (N+1 → 2 queries total).
      const poIds = pos.map(p => p.id);
      const allItems = await db.select().from(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.purchaseOrderId, poIds));
      const itemsByPo = new Map<number, PurchaseOrderItem[]>();
      for (const item of allItems) {
        const list = itemsByPo.get(item.purchaseOrderId) ?? [];
        list.push(item);
        itemsByPo.set(item.purchaseOrderId, list);
      }
      return pos.map(po => ({ ...po, items: itemsByPo.get(po.id) ?? [] }));
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      return [];
    }
  }

  async createPurchaseOrder(userId: string, po: InsertPurchaseOrder): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }> {
    try {
      const { items = [], ...poData } = po;
      // Calculate total
      const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.totalCost || "0"), 0).toFixed(2);
      const [created] = await db.insert(purchaseOrders).values({
        ...poData,
        userId,
        totalAmount,
      } as any).returning();
      // Insert items
      const createdItems: PurchaseOrderItem[] = [];
      for (const item of items) {
        const [createdItem] = await db.insert(purchaseOrderItems).values({
          ...item,
          purchaseOrderId: created.id,
        } as any).returning();
        createdItems.push(createdItem);
      }
      return { ...created, items: createdItems };
    } catch (error) {
      console.error("Error creating purchase order:", error);
      throw error;
    }
  }

  async receivePurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!po || !userIds.includes(po.userId)) return undefined;
      // Idempotency guard — if already received, return as-is without adding stock again
      if ((po as any).status === "received") return po as PurchaseOrder;

      // Fetch all items in one query
      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));

      // Build quantity deltas keyed by productId (sum if a product appears multiple times).
      // We no longer pre-fetch stock values — the SQL expression `COALESCE(stock,0) + delta`
      // handles the increment atomically so concurrent receives can't double-count.
      const productIds = items.map(i => i.productId).filter((pid): pid is number => pid != null);
      const deltaMap = new Map<number, number>();
      for (const item of items) {
        if (item.productId != null && productIds.includes(item.productId)) {
          deltaMap.set(item.productId, (deltaMap.get(item.productId) ?? 0) + item.quantity);
        }
      }

      // Execute all stock updates inside a transaction so partial failures roll back.
      // Use a SQL expression for the increment so concurrent receives can't double-count.
      const [updated] = await db.transaction(async (tx) => {
        await Promise.all(
          [...deltaMap.entries()].map(([pid, delta]) =>
            tx.update(products)
              .set({ stock: sql`COALESCE(stock, 0) + ${delta}` } as any)
              .where(eq(products.id, pid))
          )
        );
        return tx.update(purchaseOrders).set({
          status: "received",
          receivedAt: new Date().toISOString(),
        } as any).where(eq(purchaseOrders.id, id)).returning();
      });

      return updated;
    } catch (error) {
      console.error("Error receiving purchase order:", error);
      return undefined;
    }
  }

  async cancelPurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!po || !userIds.includes(po.userId)) return undefined;
      const [updated] = await db.update(purchaseOrders).set({ status: "cancelled" } as any).where(eq(purchaseOrders.id, id)).returning();
      return updated;
    } catch (error) {
      console.error("Error cancelling purchase order:", error);
      return undefined;
    }
  }

  async updatePurchaseOrderPayment(id: number, userId: string, paymentStatus: string): Promise<PurchaseOrder | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!po || !userIds.includes(po.userId)) return undefined;
      const [updated] = await db.update(purchaseOrders).set({ paymentStatus } as any).where(eq(purchaseOrders.id, id)).returning();
      return updated;
    } catch (error) {
      console.error("Error updating PO payment:", error);
      return undefined;
    }
  }

  // ─── Time Logs ────────────────────────────────────────────────────────────

  async getTimeLogs(userId: string): Promise<TimeLog[]> {
    try {
      return await db.select().from(timeLogs).where(eq(timeLogs.userId, userId)).orderBy(desc(timeLogs.clockIn)).limit(200);
    } catch (error) {
      console.error("Error fetching time logs:", error);
      return [];
    }
  }

  async getActiveTimeLog(userId: string): Promise<TimeLog | undefined> {
    try {
      const [log] = await db.select().from(timeLogs).where(and(eq(timeLogs.userId, userId), isNull(timeLogs.clockOut)));
      return log;
    } catch (error) {
      console.error("Error fetching active time log:", error);
      return undefined;
    }
  }

  async clockIn(userId: string, notes?: string): Promise<TimeLog> {
    try {
      const [created] = await db.insert(timeLogs).values({
        userId,
        clockIn: new Date().toISOString(),
        notes: notes ?? null,
      } as any).returning();
      return created;
    } catch (error) {
      console.error("Error clocking in:", error);
      throw error;
    }
  }

  async clockOut(userId: string, notes?: string): Promise<TimeLog | undefined> {
    try {
      const active = await this.getActiveTimeLog(userId);
      if (!active) return undefined;
      const [updated] = await db.update(timeLogs).set({
        clockOut: new Date().toISOString(),
        notes: notes ?? active.notes,
      } as any).where(eq(timeLogs.id, active.id)).returning();
      return updated;
    } catch (error) {
      console.error("Error clocking out:", error);
      return undefined;
    }
  }

  async startBreak(userId: string): Promise<TimeLog | undefined> {
    try {
      const active = await this.getActiveTimeLog(userId);
      if (!active || active.breakStart) return active ?? undefined;
      const [updated] = await db.update(timeLogs).set({
        breakStart: new Date().toISOString(),
      } as any).where(eq(timeLogs.id, active.id)).returning();
      return updated;
    } catch (error) {
      console.error("Error starting break:", error);
      return undefined;
    }
  }

  async endBreak(userId: string): Promise<TimeLog | undefined> {
    try {
      const active = await this.getActiveTimeLog(userId);
      if (!active || !active.breakStart) return active ?? undefined;
      const breakMs = Date.now() - new Date(active.breakStart).getTime();
      const addedMins = Math.max(0, Math.floor(breakMs / 60000));
      const totalBreakMins = (active.breakMinutes ?? 0) + addedMins;
      const [updated] = await db.update(timeLogs).set({
        breakStart: null,
        breakMinutes: totalBreakMins,
      } as any).where(eq(timeLogs.id, active.id)).returning();
      return updated;
    } catch (error) {
      console.error("Error ending break:", error);
      return undefined;
    }
  }

  async getTeamTimeLogs(userId: string): Promise<{
    id: number;
    userId: string;
    clockIn: string;
    clockOut: string | null;
    notes: string | null;
    clockOutNotes: string | null;
    breakStart: string | null;
    breakMinutes: number | null;
    createdAt: string | null;
    userName: string | null;
    userEmail: string | null;
  }[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      if (userIds.length === 0) return [];
      const condition = userIds.length === 1
        ? and(eq(timeLogs.userId, userIds[0]), isNull(timeLogs.deletedAt))
        : and(inArray(timeLogs.userId, userIds), isNull(timeLogs.deletedAt));
      const rows = await db.select({
        id: timeLogs.id,
        userId: timeLogs.userId,
        clockIn: timeLogs.clockIn,
        clockOut: timeLogs.clockOut,
        notes: timeLogs.notes,
        clockOutNotes: timeLogs.clockOutNotes,
        breakStart: timeLogs.breakStart,
        breakMinutes: timeLogs.breakMinutes,
        createdAt: timeLogs.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
        .from(timeLogs)
        .leftJoin(users, eq(timeLogs.userId, users.id))
        .where(condition)
        .orderBy(desc(timeLogs.clockIn))
        .limit(500);
      return rows;
    } catch (error) {
      console.error("Error fetching team time logs:", error);
      return [];
    }
  }

  // ─── Product barcode lookup ────────────────────────────────────────────────

  async getProductByBarcode(barcode: string, userId: string): Promise<Product | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1
        ? and(eq(products.barcode, barcode), eq(products.userId, userIds[0]))
        : and(eq(products.barcode, barcode), inArray(products.userId, userIds));
      const [product] = await db.select().from(products).where(condition);
      return product;
    } catch (error) {
      console.error("Error fetching product by barcode:", error);
      return undefined;
    }
  }

  // ─── Loyalty points ───────────────────────────────────────────────────────

  async adjustLoyaltyPoints(customerId: number, delta: number, userId: string, opts?: { reason?: string; saleId?: number; rewardId?: number; note?: string }): Promise<Customer | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1
        ? and(eq(customers.id, customerId), eq(customers.userId, userIds[0]))
        : and(eq(customers.id, customerId), inArray(customers.userId, userIds));
      const [customer] = await db.select({ id: customers.id }).from(customers).where(condition);
      if (!customer) return undefined;

      // Atomic update — GREATEST(0, ...) and the CASE prevent a lost-update race
      // when two concurrent sales credit/debit the same customer simultaneously.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updated] = await db.update(customers).set({
        loyaltyPoints: sql`GREATEST(0, COALESCE(loyalty_points, 0) + ${delta})`,
        lifetimePoints: sql`CASE WHEN ${delta} > 0 THEN COALESCE(lifetime_points, 0) + ${delta} ELSE COALESCE(lifetime_points, 0) END`,
      } as any).where(eq(customers.id, customerId)).returning();
      const newPoints = updated?.loyaltyPoints ?? 0;

      // Log the change
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void db.insert(loyaltyPointsLog).values({
        userId,
        customerId,
        delta,
        balance: newPoints,
        reason: opts?.reason ?? (delta > 0 ? "purchase" : "redeem_discount"),
        saleId: opts?.saleId ?? null,
        rewardId: opts?.rewardId ?? null,
        note: opts?.note ?? null,
      } as any).catch(() => {});

      // Recalc tier in background
      this.getLoyaltyTiers(userId).then(tiers => {
        if (tiers.length > 0) this.recalcCustomerTier(customerId, tiers).catch(() => {});
      }).catch(() => {});

      return updated;
    } catch (error) {
      console.error("Error adjusting loyalty points:", error);
      return undefined;
    }
  }

  // ─── Loyalty Tiers ─────────────────────────────────────────────────────────

  async getLoyaltyTiers(userId: string): Promise<LoyaltyTier[]> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1 ? eq(loyaltyTiers.userId, userIds[0]) : inArray(loyaltyTiers.userId, userIds);
    return db.select().from(loyaltyTiers).where(condition).orderBy(loyaltyTiers.sortOrder);
  }

  async createLoyaltyTier(userId: string, tier: InsertLoyaltyTier): Promise<LoyaltyTier> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(loyaltyTiers).values({ ...tier, userId } as any).returning();
    return created;
  }

  async updateLoyaltyTier(id: number, userId: string, tier: Partial<InsertLoyaltyTier>): Promise<LoyaltyTier | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1 ? and(eq(loyaltyTiers.id, id), eq(loyaltyTiers.userId, userIds[0])) : and(eq(loyaltyTiers.id, id), inArray(loyaltyTiers.userId, userIds));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(loyaltyTiers).set(tier as any).where(condition).returning();
    return updated;
  }

  async deleteLoyaltyTier(id: number, userId: string): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1 ? and(eq(loyaltyTiers.id, id), eq(loyaltyTiers.userId, userIds[0])) : and(eq(loyaltyTiers.id, id), inArray(loyaltyTiers.userId, userIds));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(loyaltyTiers).set({ deletedAt: new Date().toISOString() } as any).where(condition);
  }

  // ─── Loyalty Rewards ───────────────────────────────────────────────────────

  async getLoyaltyRewards(userId: string): Promise<LoyaltyReward[]> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1 ? and(eq(loyaltyRewards.userId, userIds[0]), isNull(loyaltyRewards.deletedAt)) : and(inArray(loyaltyRewards.userId, userIds), isNull(loyaltyRewards.deletedAt));
    return db.select().from(loyaltyRewards).where(condition).orderBy(loyaltyRewards.pointsCost);
  }

  async createLoyaltyReward(userId: string, reward: InsertLoyaltyReward): Promise<LoyaltyReward> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(loyaltyRewards).values({ ...reward, userId } as any).returning();
    return created;
  }

  async updateLoyaltyReward(id: number, userId: string, reward: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1 ? and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.userId, userIds[0])) : and(eq(loyaltyRewards.id, id), inArray(loyaltyRewards.userId, userIds));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(loyaltyRewards).set(reward as any).where(condition).returning();
    return updated;
  }

  async deleteLoyaltyReward(id: number, userId: string): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1 ? and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.userId, userIds[0])) : and(eq(loyaltyRewards.id, id), inArray(loyaltyRewards.userId, userIds));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(loyaltyRewards).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(condition);
  }

  async redeemLoyaltyReward(customerId: number, rewardId: number, userId: string): Promise<{ customer: Customer; reward: LoyaltyReward; log: LoyaltyPointsLog } | null> {
    try {
      const [reward] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, rewardId));
      if (!reward || !reward.isActive) return null;
      if (reward.maxRedemptions != null && (reward.redemptionCount ?? 0) >= reward.maxRedemptions) return null;

      const userIds = await this.getTenantUserIds(userId);
      const cond = userIds.length === 1 ? and(eq(customers.id, customerId), eq(customers.userId, userIds[0])) : and(eq(customers.id, customerId), inArray(customers.userId, userIds));
      const [customer] = await db.select().from(customers).where(cond);
      if (!customer) return null;
      if ((customer.loyaltyPoints ?? 0) < reward.pointsCost) return null;

      // Both updates are atomic SQL expressions — no lost-update race possible
      // even when two redemptions are processed concurrently for the same customer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [updatedCustomer] = await db.update(customers).set({
        loyaltyPoints: sql`GREATEST(0, COALESCE(loyalty_points, 0) - ${reward.pointsCost})`,
      } as any).where(eq(customers.id, customerId)).returning();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(loyaltyRewards).set({
        redemptionCount: sql`COALESCE(redemption_count, 0) + 1`,
      } as any).where(eq(loyaltyRewards.id, rewardId));
      const newPoints = updatedCustomer?.loyaltyPoints ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [log] = await db.insert(loyaltyPointsLog).values({
        userId,
        customerId,
        delta: -reward.pointsCost,
        balance: newPoints,
        reason: reward.type === "free_product" ? "redeem_product" : "redeem_discount",
        rewardId,
        note: `Redeemed: ${reward.name}`,
      } as any).returning();
      return { customer: updatedCustomer, reward, log };
    } catch (err) {
      console.error("redeemLoyaltyReward error:", err);
      return null;
    }
  }

  // ─── Loyalty Points Log ────────────────────────────────────────────────────

  async getLoyaltyPointsLog(customerId: number, userId: string): Promise<LoyaltyPointsLog[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const cond = userIds.length === 1 ? and(eq(customers.id, customerId), eq(customers.userId, userIds[0])) : and(eq(customers.id, customerId), inArray(customers.userId, userIds));
      const [customer] = await db.select().from(customers).where(cond);
      if (!customer) return [];
      return db.select().from(loyaltyPointsLog).where(eq(loyaltyPointsLog.customerId, customerId)).orderBy(desc(loyaltyPointsLog.createdAt)).limit(100);
    } catch { return []; }
  }

  async addLoyaltyPointsLog(userId: string, customerId: number, delta: number, reason: string, opts?: { saleId?: number; rewardId?: number; note?: string; expiresAt?: string }): Promise<LoyaltyPointsLog> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const balance = Math.max(0, (customer?.loyaltyPoints ?? 0) + delta);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [log] = await db.insert(loyaltyPointsLog).values({
      userId, customerId, delta, balance, reason,
      saleId: opts?.saleId ?? null,
      rewardId: opts?.rewardId ?? null,
      note: opts?.note ?? null,
      expiresAt: opts?.expiresAt ?? null,
    } as any).returning();
    return log;
  }

  async recalcCustomerTier(customerId: number, tiers: LoyaltyTier[]): Promise<void> {
    try {
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
      if (!customer) return;
      const lifetimePts = customer.lifetimePoints ?? 0;
      const sorted = [...tiers].sort((a, b) => b.minLifetimePoints - a.minLifetimePoints);
      const matched = sorted.find(t => lifetimePts >= t.minLifetimePoints);
      const newTier = matched?.name?.toLowerCase() ?? "none";
      if (newTier !== customer.tier) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.update(customers).set({ tier: newTier } as any).where(eq(customers.id, customerId));
      }
    } catch { /* ignore */ }
  }

  // ─── Service Staff ────────────────────────────────────────────────────────

  async getServiceStaff(userId: string, branchId?: number | null): Promise<ServiceStaff[]> {
    const userIds = await this.getTenantUserIds(userId);
    const userCondition = userIds.length === 1
      ? eq(serviceStaff.userId, userIds[0])
      : inArray(serviceStaff.userId, userIds);
    const condition = branchId != null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? and(userCondition, eq((serviceStaff as any).branchId, branchId))
      : userCondition;
    return db.select().from(serviceStaff).where(condition).orderBy(desc(serviceStaff.createdAt));
  }

  async getServiceStaffMember(id: number, userId: string): Promise<ServiceStaff | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(serviceStaff.id, id), eq(serviceStaff.userId, userIds[0]))
      : and(eq(serviceStaff.id, id), inArray(serviceStaff.userId, userIds));
    const [member] = await db.select().from(serviceStaff).where(condition);
    return member;
  }

  async createServiceStaff(userId: string, staff: InsertServiceStaff): Promise<ServiceStaff> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(serviceStaff).values({ ...staff, userId } as any).returning();
    return created;
  }

  async updateServiceStaff(id: number, userId: string, staff: Partial<InsertServiceStaff>): Promise<ServiceStaff | undefined> {
    const existing = await this.getServiceStaffMember(id, userId);
    if (!existing) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(serviceStaff).set(staff as any).where(eq(serviceStaff.id, id)).returning();
    return updated;
  }

  async deleteServiceStaff(id: number, userId: string): Promise<void> {
    const existing = await this.getServiceStaffMember(id, userId);
    if (!existing) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(serviceStaff).set({ deletedAt: new Date().toISOString() } as any).where(eq(serviceStaff.id, id));
  }

  // ─── Service Rooms ────────────────────────────────────────────────────────

  async getServiceRooms(userId: string, branchId?: number | null): Promise<ServiceRoom[]> {
    const userIds = await this.getTenantUserIds(userId);
    const userCondition = userIds.length === 1
      ? and(eq(serviceRooms.userId, userIds[0]), isNull(serviceRooms.deletedAt))
      : and(inArray(serviceRooms.userId, userIds), isNull(serviceRooms.deletedAt));
    const condition = branchId != null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? and(userCondition, eq((serviceRooms as any).branchId, branchId))
      : userCondition;
    return db.select().from(serviceRooms).where(condition).orderBy(desc(serviceRooms.createdAt));
  }

  async createServiceRoom(userId: string, room: InsertServiceRoom): Promise<ServiceRoom> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(serviceRooms).values({ ...room, userId } as any).returning();
    return created;
  }

  async updateServiceRoom(id: number, userId: string, room: Partial<InsertServiceRoom>): Promise<ServiceRoom | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(serviceRooms.id, id), eq(serviceRooms.userId, userIds[0]), isNull(serviceRooms.deletedAt))
      : and(eq(serviceRooms.id, id), inArray(serviceRooms.userId, userIds), isNull(serviceRooms.deletedAt));
    const [existing] = await db.select().from(serviceRooms).where(condition);
    if (!existing) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(serviceRooms).set(room as any).where(eq(serviceRooms.id, id)).returning();
    return updated;
  }

  async deleteServiceRoom(id: number, userId: string): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(serviceRooms.id, id), eq(serviceRooms.userId, userIds[0]), isNull(serviceRooms.deletedAt))
      : and(eq(serviceRooms.id, id), inArray(serviceRooms.userId, userIds), isNull(serviceRooms.deletedAt));
    const [existing] = await db.select().from(serviceRooms).where(condition);
    if (!existing) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(serviceRooms).set({ deletedAt: new Date().toISOString() } as any).where(eq(serviceRooms.id, id));
  }

  // ─── Appointments ─────────────────────────────────────────────────────────

  async getAppointments(userId: string, opts?: { date?: string; staffId?: number; status?: string }): Promise<Appointment[]> {
    const userIds = await this.getTenantUserIds(userId);
    let condition = userIds.length === 1
      ? and(eq(appointments.userId, userIds[0]), isNull(appointments.deletedAt))
      : and(inArray(appointments.userId, userIds), isNull(appointments.deletedAt));
    if (opts?.date) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      condition = and(condition, eq(appointments.date, opts.date)) as any;
    }
    if (opts?.staffId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      condition = and(condition, eq(appointments.staffId, opts.staffId)) as any;
    }
    if (opts?.status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      condition = and(condition, eq(appointments.status, opts.status)) as any;
    }
    return db.select().from(appointments).where(condition).orderBy(appointments.date, appointments.startTime);
  }

  async getAppointment(id: number, userId: string): Promise<Appointment | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(appointments.id, id), eq(appointments.userId, userIds[0]), isNull(appointments.deletedAt))
      : and(eq(appointments.id, id), inArray(appointments.userId, userIds), isNull(appointments.deletedAt));
    const [appt] = await db.select().from(appointments).where(condition);
    return appt;
  }

  async createAppointment(userId: string, appt: InsertAppointment): Promise<Appointment> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(appointments).values({ ...appt, userId } as any).returning();
    return created;
  }

  async updateAppointment(id: number, userId: string, appt: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const existing = await this.getAppointment(id, userId);
    if (!existing) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(appointments).set(appt as any).where(eq(appointments.id, id)).returning();
    return updated;
  }

  async deleteAppointment(id: number, userId: string): Promise<void> {
    const existing = await this.getAppointment(id, userId);
    if (!existing) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(appointments).set({ deletedAt: new Date().toISOString() } as any).where(eq(appointments.id, id));
  }

  // ─── Membership Plans ─────────────────────────────────────────────────────

  async getMembershipPlans(userId: string): Promise<MembershipPlan[]> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(membershipPlans.userId, userIds[0]), isNull(membershipPlans.deletedAt))
      : and(inArray(membershipPlans.userId, userIds), isNull(membershipPlans.deletedAt));
    return db.select().from(membershipPlans).where(condition).orderBy(desc(membershipPlans.createdAt));
  }

  async createMembershipPlan(userId: string, plan: InsertMembershipPlan): Promise<MembershipPlan> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(membershipPlans).values({ ...plan, userId } as any).returning();
    return created;
  }

  async updateMembershipPlan(id: number, userId: string, plan: Partial<InsertMembershipPlan>): Promise<MembershipPlan | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(membershipPlans.id, id), eq(membershipPlans.userId, userIds[0]), isNull(membershipPlans.deletedAt))
      : and(eq(membershipPlans.id, id), inArray(membershipPlans.userId, userIds), isNull(membershipPlans.deletedAt));
    const [existing] = await db.select().from(membershipPlans).where(condition);
    if (!existing) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(membershipPlans).set(plan as any).where(eq(membershipPlans.id, id)).returning();
    return updated;
  }

  async deleteMembershipPlan(id: number, userId: string): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(membershipPlans.id, id), eq(membershipPlans.userId, userIds[0]), isNull(membershipPlans.deletedAt))
      : and(eq(membershipPlans.id, id), inArray(membershipPlans.userId, userIds), isNull(membershipPlans.deletedAt));
    const [existing] = await db.select().from(membershipPlans).where(condition);
    if (!existing) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(membershipPlans).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(eq(membershipPlans.id, id));
  }

  // ─── Memberships ──────────────────────────────────────────────────────────

  async getMemberships(userId: string): Promise<(Membership & { customerName: string | null; customerPhone: string | null })[]> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? eq(memberships.userId, userIds[0])
      : inArray(memberships.userId, userIds);
    const rows = await db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        customerId: memberships.customerId,
        planId: memberships.planId,
        planName: memberships.planName,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        status: memberships.status,
        checkInsUsed: memberships.checkInsUsed,
        totalPaid: memberships.totalPaid,
        notes: memberships.notes,
        createdAt: memberships.createdAt,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(memberships)
      .leftJoin(customers, eq(memberships.customerId, customers.id))
      .where(condition)
      .orderBy(desc(memberships.createdAt));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows as any;
  }

  async getMembership(id: number, userId: string): Promise<Membership | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(memberships.id, id), eq(memberships.userId, userIds[0]))
      : and(eq(memberships.id, id), inArray(memberships.userId, userIds));
    const [m] = await db.select().from(memberships).where(condition);
    return m;
  }

  async createMembership(userId: string, m: InsertMembership): Promise<Membership> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(memberships).values({ ...m, userId } as any).returning();
    return created;
  }

  async updateMembership(id: number, userId: string, m: Partial<InsertMembership>): Promise<Membership | undefined> {
    const existing = await this.getMembership(id, userId);
    if (!existing) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(memberships).set(m as any).where(eq(memberships.id, id)).returning();
    return updated;
  }

  async deleteMembership(id: number, userId: string): Promise<void> {
    const existing = await this.getMembership(id, userId);
    if (!existing) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(memberships).set({ deletedAt: new Date().toISOString() } as any).where(eq(memberships.id, id));
  }

  async checkInMember(userId: string, data: InsertMembershipCheckIn): Promise<MembershipCheckIn> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [checkIn] = await db.insert(membershipCheckIns).values({ ...data, userId } as any).returning();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(memberships).set({
      checkInsUsed: sql`check_ins_used + 1`,
    } as any).where(eq(memberships.id, data.membershipId));
    return checkIn;
  }

  async getCheckIns(membershipId: number, userId: string): Promise<MembershipCheckIn[]> {
    return db.select().from(membershipCheckIns)
      .where(and(eq(membershipCheckIns.membershipId, membershipId), eq(membershipCheckIns.userId, userId)))
      .orderBy(desc(membershipCheckIns.checkedInAt));
  }

  // ─── Ingredients ──────────────────────────────────────────────────────────

  async getIngredients(userId: string): Promise<Ingredient[]> {
    const userIds = await this.getTenantUserIds(userId);
    return db.select().from(ingredients)
      .where(and(inArray(ingredients.userId, userIds), isNull(ingredients.deletedAt)))
      .orderBy(desc(ingredients.id));
  }

  async getIngredient(id: number, userId: string): Promise<Ingredient | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const [row] = await db.select().from(ingredients)
      .where(and(eq(ingredients.id, id), inArray(ingredients.userId, userIds), isNull(ingredients.deletedAt)));
    return row;
  }

  async createIngredient(userId: string, data: InsertIngredient): Promise<Ingredient> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(ingredients).values({ ...data, userId } as any).returning();
    return created;
  }

  async updateIngredient(id: number, userId: string, data: Partial<InsertIngredient>): Promise<Ingredient | undefined> {
    const existing = await this.getIngredient(id, userId);
    if (!existing) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(ingredients).set(data as any).where(eq(ingredients.id, id)).returning();
    return updated;
  }

  async deleteIngredient(id: number, userId: string): Promise<void> {
    const existing = await this.getIngredient(id, userId);
    if (!existing) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(ingredients).set({ deletedAt: new Date().toISOString() } as any).where(eq(ingredients.id, id));
  }

  async adjustIngredientStock(id: number, userId: string, delta: number): Promise<Ingredient | undefined> {
    const existing = await this.getIngredient(id, userId);
    if (!existing) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(ingredients)
      .set({ stockQty: sql`(COALESCE(stock_qty::numeric, 0) + ${delta})::text` } as any)
      .where(eq(ingredients.id, id))
      .returning();
    return updated;
  }

  // ─── Product Recipes ──────────────────────────────────────────────────────

  async getRecipeForProduct(productId: number, userId: string): Promise<(ProductRecipe & { ingredientName: string; unit: string })[]> {
    const userIds = await this.getTenantUserIds(userId);
    // Verify product belongs to tenant
    const [prod] = await db.select().from(products).where(
      and(eq(products.id, productId), inArray(products.userId, userIds))
    );
    if (!prod) return [];
    const rows = await db.select({
      id: productRecipes.id,
      productId: productRecipes.productId,
      ingredientId: productRecipes.ingredientId,
      quantity: productRecipes.quantity,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
    }).from(productRecipes)
      .leftJoin(ingredients, eq(productRecipes.ingredientId, ingredients.id))
      .where(eq(productRecipes.productId, productId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows as any;
  }

  async setRecipeForProduct(productId: number, userId: string, items: { ingredientId: number; quantity: string }[]): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const [prod] = await db.select().from(products).where(
      and(eq(products.id, productId), inArray(products.userId, userIds))
    );
    if (!prod) throw new Error("Product not found");
    // Verify all ingredients belong to tenant
    if (items.length > 0) {
      const ingIds = items.map(i => i.ingredientId);
      const tenantIngs = await db.select({ id: ingredients.id }).from(ingredients).where(
        and(inArray(ingredients.id, ingIds), inArray(ingredients.userId, userIds))
      );
      const allowed = new Set(tenantIngs.map(i => i.id));
      const filtered = items.filter(i => allowed.has(i.ingredientId));
      await db.transaction(async (tx) => {
        await tx.delete(productRecipes).where(eq(productRecipes.productId, productId));
        if (filtered.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await tx.insert(productRecipes).values(filtered.map(i => ({
            productId,
            ingredientId: i.ingredientId,
            quantity: i.quantity,
          })) as any);
        }
      });
    } else {
      await db.delete(productRecipes).where(eq(productRecipes.productId, productId));
    }
  }

  // ─── WiFi Vouchers ────────────────────────────────────────────────────────

  async getWifiVouchers(userId: string): Promise<WifiVoucher[]> {
    const userIds = await this.getTenantUserIds(userId);
    return db.select().from(wifiVouchers)
      .where(inArray(wifiVouchers.userId, userIds))
      .orderBy(desc(wifiVouchers.createdAt))
      .limit(200);
  }

  async createWifiVoucher(userId: string, data: InsertWifiVoucher & { saleId?: number | null }): Promise<WifiVoucher> {
    const code = (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6)).toUpperCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [created] = await db.insert(wifiVouchers).values({
      userId,
      branchId: data.branchId ?? null,
      code,
      durationMinutes: data.durationMinutes,
      customerName: data.customerName ?? null,
      customerEmail: data.customerEmail ?? null,
      saleId: data.saleId ?? null,
      status: "unused",
    } as any).returning();
    return created;
  }

  async redeemWifiVoucher(code: string, userId: string): Promise<WifiVoucher | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const [v] = await db.select().from(wifiVouchers).where(
      and(eq(wifiVouchers.code, code), inArray(wifiVouchers.userId, userIds))
    );
    if (!v) return undefined;
    if (v.status !== "unused") return v;
    const now = new Date();
    const expires = new Date(now.getTime() + (v.durationMinutes ?? 60) * 60_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [updated] = await db.update(wifiVouchers).set({
      status: "active",
      redeemedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    } as any).where(eq(wifiVouchers.id, v.id)).returning();
    return updated;
  }

  // ─── Payroll ──────────────────────────────────────────────────────────────

  async getPayrollPeriods(userId: string): Promise<PayrollPeriod[]> {
    const userIds = await this.getTenantUserIds(userId);
    return db.select().from(payrollPeriods)
      .where(inArray(payrollPeriods.userId, userIds))
      .orderBy(desc(payrollPeriods.createdAt));
  }

  async getPayrollPeriod(id: number, userId: string): Promise<PayrollPeriod | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const [p] = await db.select().from(payrollPeriods).where(
      and(eq(payrollPeriods.id, id), inArray(payrollPeriods.userId, userIds))
    );
    return p;
  }

  /**
   * Create a payroll period and auto-generate entries for every employee in the tenant
   * by computing hours from time_logs and commission/tip from sales in the date range.
   */
  async createPayrollPeriod(userId: string, data: InsertPayrollPeriod): Promise<PayrollPeriod> {
    const userIds = await this.getTenantUserIds(userId);
    const [period] = await db.insert(payrollPeriods).values({
      userId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      notes: data.notes ?? null,
      status: "draft",
    } as any).returning();

    // Fetch all tenant users (employees) — exclude wageType "none"
    const employees = await db.select().from(users).where(inArray(users.id, userIds));
    const start = new Date(data.startDate).toISOString();
    const endInclusive = new Date(new Date(data.endDate).getTime() + 24 * 60 * 60_000 - 1).toISOString();

    // All time logs for these users in window
    const logs = await db.select().from(timeLogs).where(
      and(inArray(timeLogs.userId, userIds), isNotNull(timeLogs.clockOut))
    );
    // All sales in window for commission/tip
    const tenantSales = await db.select().from(sales).where(
      and(inArray(sales.userId, userIds), isNull(sales.deletedAt))
    );
    const inWindowSales = tenantSales.filter(s => {
      const t = s.createdAt ?? "";
      return t >= start && t <= endInclusive;
    });
    const tipPool = inWindowSales.reduce((sum, s) => sum + (parseFloat(s.tip || "0") || 0), 0);

    // Filter logs to window
    const inWindowLogs = logs.filter(l => {
      const ci = l.clockIn ?? "";
      return ci >= start && ci <= endInclusive;
    });

    let totalAmount = 0;
    const entries: any[] = [];
    // Count how many employees actually clocked in (for tip share)
    const employeesWithHours = new Set<string>();
    for (const l of inWindowLogs) employeesWithHours.add(l.userId);
    const tipShare = employeesWithHours.size > 0 ? tipPool / employeesWithHours.size : 0;

    for (const emp of employees) {
      const wageType = (emp as any).wageType || "none";
      if (wageType === "none") continue;
      const wageRate = parseFloat((emp as any).wageRate || "0") || 0;
      const commissionPct = parseFloat((emp as any).commissionPercent || "0") || 0;

      const empLogs = inWindowLogs.filter(l => l.userId === emp.id);
      const hours = empLogs.reduce((sum, l) => {
        if (!l.clockOut) return sum;
        const ms = new Date(l.clockOut).getTime() - new Date(l.clockIn ?? l.clockOut).getTime();
        return sum + Math.max(0, ms / 3600000);
      }, 0);

      let baseAmount = 0;
      if (wageType === "hourly") baseAmount = hours * wageRate;
      else if (wageType === "monthly") baseAmount = wageRate; // simple monthly base
      else if (wageType === "commission") baseAmount = 0;

      // Commission from sales rung up by this cashier
      const empSales = inWindowSales.filter(s => s.cashierId === emp.id);
      const empSubtotal = empSales.reduce((sum, s) => sum + (parseFloat(s.subtotal || "0") || 0), 0);
      const commissionAmount = (empSubtotal * commissionPct) / 100;

      const empTip = employeesWithHours.has(emp.id) ? tipShare : 0;

      const net = baseAmount + commissionAmount + empTip;
      totalAmount += net;

      entries.push({
        periodId: period.id,
        employeeUserId: emp.id,
        employeeName: emp.name || emp.email,
        wageType,
        wageRate: String(wageRate),
        hoursWorked: hours.toFixed(2),
        baseAmount: baseAmount.toFixed(2),
        commissionAmount: commissionAmount.toFixed(2),
        tipAmount: empTip.toFixed(2),
        bonusAmount: "0",
        deductionAmount: "0",
        advanceAmount: "0",
        netAmount: net.toFixed(2),
      });
    }

    if (entries.length > 0) {
      await db.insert(payrollEntries).values(entries as any);
    }
    const [updated] = await db.update(payrollPeriods)
      .set({ totalAmount: totalAmount.toFixed(2) } as any)
      .where(eq(payrollPeriods.id, period.id))
      .returning();
    return updated;
  }

  async getPayrollEntries(periodId: number, userId: string): Promise<PayrollEntry[]> {
    const period = await this.getPayrollPeriod(periodId, userId);
    if (!period) return [];
    return db.select().from(payrollEntries).where(eq(payrollEntries.periodId, periodId));
  }

  async updatePayrollEntry(id: number, userId: string, data: UpdatePayrollEntry): Promise<PayrollEntry | undefined> {
    const [entry] = await db.select().from(payrollEntries).where(eq(payrollEntries.id, id));
    if (!entry) return undefined;
    const period = await this.getPayrollPeriod(entry.periodId, userId);
    if (!period) return undefined;
    const merged = { ...entry, ...data } as any;
    const base = parseFloat(merged.baseAmount || "0") || 0;
    const comm = parseFloat(merged.commissionAmount || "0") || 0;
    const tip = parseFloat(merged.tipAmount || "0") || 0;
    const bonus = parseFloat(merged.bonusAmount || "0") || 0;
    const ded = parseFloat(merged.deductionAmount || "0") || 0;
    const adv = parseFloat(merged.advanceAmount || "0") || 0;
    const net = base + comm + tip + bonus - ded - adv;
    const [updated] = await db.update(payrollEntries).set({
      ...data,
      netAmount: net.toFixed(2),
    } as any).where(eq(payrollEntries.id, id)).returning();
    // Recompute period total
    const allEntries = await db.select().from(payrollEntries).where(eq(payrollEntries.periodId, entry.periodId));
    const total = allEntries.reduce((s, e) => s + (parseFloat(e.netAmount || "0") || 0), 0);
    await db.update(payrollPeriods).set({ totalAmount: total.toFixed(2) } as any).where(eq(payrollPeriods.id, entry.periodId));
    return updated;
  }

  async finalizePayrollPeriod(id: number, userId: string): Promise<PayrollPeriod | undefined> {
    const period = await this.getPayrollPeriod(id, userId);
    if (!period) return undefined;
    const [updated] = await db.update(payrollPeriods).set({
      status: "finalized",
      finalizedAt: new Date().toISOString(),
    } as any).where(eq(payrollPeriods.id, id)).returning();
    return updated;
  }

  async markPayrollPeriodPaid(id: number, userId: string): Promise<PayrollPeriod | undefined> {
    const period = await this.getPayrollPeriod(id, userId);
    if (!period) return undefined;
    const [updated] = await db.update(payrollPeriods).set({
      status: "paid",
      paidAt: new Date().toISOString(),
    } as any).where(eq(payrollPeriods.id, id)).returning();
    return updated;
  }

  async deletePayrollPeriod(id: number, userId: string): Promise<void> {
    const period = await this.getPayrollPeriod(id, userId);
    if (!period) return;
    await db.update(payrollEntries).set({ notes: sql`COALESCE(notes, '')` } as any).where(eq(payrollEntries.periodId, id));
    await db.update(payrollPeriods).set({ deletedAt: new Date().toISOString() } as any).where(eq(payrollPeriods.id, id));
  }

  async updateUserWage(targetUserId: string, requesterId: string, data: { wageType: string; wageRate: string; commissionPercent: string }): Promise<any> {
    const userIds = await this.getTenantUserIds(requesterId);
    if (!userIds.includes(targetUserId)) return undefined;
    const [updated] = await db.update(users).set({
      wageType: data.wageType,
      wageRate: data.wageRate,
      commissionPercent: data.commissionPercent,
    } as any).where(eq(users.id, targetUserId)).returning();
    return updated;
  }

  // ─── Notifications ──────────────────────────────────────────────────────────

  async getNotifications(userId: string): Promise<Notification[]> {
    try {
      const ownerIds = await this.getTenantUserIds(userId);
      const ownerId = ownerIds[0];
      return await db.select().from(notifications)
        .where(eq(notifications.userId, ownerId))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
    } catch (e) {
      console.error("getNotifications error:", e);
      return [];
    }
  }

  async createNotification(userId: string, data: { type: string; title: string; message?: string; productId?: number }): Promise<void> {
    try {
      const ownerIds = await this.getTenantUserIds(userId);
      const ownerId = ownerIds[0];
      await db.insert(notifications).values({ userId: ownerId, ...data } as any);
    } catch (e) {
      console.error("createNotification error:", e);
    }
  }

  async markNotificationRead(id: number, userId: string): Promise<void> {
    try {
      const ownerIds = await this.getTenantUserIds(userId);
      const ownerId = ownerIds[0];
      await (db.update(notifications) as any)
        .set({ readAt: new Date().toISOString() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, ownerId)));
    } catch (e) {
      console.error("markNotificationRead error:", e);
    }
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    try {
      const ownerIds = await this.getTenantUserIds(userId);
      const ownerId = ownerIds[0];
      await (db.update(notifications) as any)
        .set({ readAt: new Date().toISOString() })
        .where(and(eq(notifications.userId, ownerId), isNull(notifications.readAt)));
    } catch (e) {
      console.error("markAllNotificationsRead error:", e);
    }
  }

  // ─── Waste / Spoilage Log ──────────────────────────────────────────────────

  async getWasteLogs(userId: string, branchId?: number | null): Promise<WasteLogEntry[]> {
    const userIds = await this.getTenantUserIds(userId);
    const conds: ReturnType<typeof eq>[] = [inArray(wasteLog.userId, userIds) as ReturnType<typeof eq>];
    if (branchId != null) conds.push(eq(wasteLog.branchId, branchId) as ReturnType<typeof eq>);
    return db.select().from(wasteLog).where(and(...conds)).orderBy(desc(wasteLog.createdAt));
  }

  async createWasteLog(userId: string, data: {
    productId?: number | null;
    ingredientId?: number | null;
    itemName: string;
    quantity: string;
    unit?: string;
    reason: string;
    costImpact: string;
    note?: string;
    branchId?: number | null;
  }): Promise<WasteLogEntry> {
    const [entry] = await db.insert(wasteLog).values({
      userId,
      productId: data.productId ?? null,
      ingredientId: data.ingredientId ?? null,
      itemName: data.itemName,
      quantity: data.quantity,
      unit: data.unit ?? "pcs",
      reason: data.reason,
      costImpact: data.costImpact,
      note: data.note ?? null,
      branchId: data.branchId ?? null,
    }).returning();
    // Deduct from product stock
    if (data.productId && Number(data.quantity) > 0) {
      const qty = Math.round(Number(data.quantity));
      const [prod] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, data.productId));
      const prev = prod?.stock ?? 0;
      const next = Math.max(0, prev - qty);
      await (db.update(products) as ReturnType<typeof db.update>)
        .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) - ${qty})` })
        .where(eq(products.id, data.productId));
      await db.insert(stockLogs).values({
        productId: data.productId, userId,
        previousStock: prev, newStock: next, delta: -qty,
        reason: "waste", note: `${data.reason}${data.note ? ": " + data.note : ""}`,
      });
    }
    // Deduct from ingredient stock
    if (data.ingredientId && Number(data.quantity) > 0) {
      await (db.update(ingredients) as ReturnType<typeof db.update>)
        .set({ stockQty: sql`GREATEST('0', (COALESCE(stock_qty, '0')::numeric - ${Number(data.quantity)})::text)` })
        .where(eq(ingredients.id, data.ingredientId));
    }
    return entry;
  }

  // ─── Stock Transfers ────────────────────────────────────────────────────────

  async getStockTransfers(userId: string, branchId?: number | null): Promise<(StockTransfer & { items: StockTransferItem[] })[]> {
    const userIds = await this.getTenantUserIds(userId);
    const conds: ReturnType<typeof eq>[] = [inArray(stockTransfers.userId, userIds) as ReturnType<typeof eq>];
    if (branchId != null) {
      conds.push(sql`(${stockTransfers.fromBranchId} = ${branchId} OR ${stockTransfers.toBranchId} = ${branchId})` as ReturnType<typeof eq>);
    }
    const transfers = await db.select().from(stockTransfers).where(and(...conds)).orderBy(desc(stockTransfers.createdAt));
    if (transfers.length === 0) return [];
    const ids = transfers.map(t => t.id);
    const items = await db.select().from(stockTransferItems).where(inArray(stockTransferItems.transferId, ids));
    const itemsByTransfer = new Map<number, StockTransferItem[]>();
    for (const item of items) {
      const arr = itemsByTransfer.get(item.transferId) ?? [];
      arr.push(item);
      itemsByTransfer.set(item.transferId, arr);
    }
    return transfers.map(t => ({ ...t, items: itemsByTransfer.get(t.id) ?? [] }));
  }

  async createStockTransfer(userId: string, data: {
    fromBranchId?: number | null;
    toBranchId?: number | null;
    notes?: string;
    items: { productId: number; productName: string; quantity: number; note?: string }[];
  }): Promise<StockTransfer & { items: StockTransferItem[] }> {
    const [transfer] = await db.insert(stockTransfers).values({
      userId,
      fromBranchId: data.fromBranchId ?? null,
      toBranchId: data.toBranchId ?? null,
      notes: data.notes ?? null,
      status: "pending",
      updatedAt: new Date().toISOString(),
    }).returning();
    let insertedItems: StockTransferItem[] = [];
    if (data.items.length > 0) {
      insertedItems = await db.insert(stockTransferItems).values(
        data.items.map(i => ({ transferId: transfer.id, productId: i.productId, productName: i.productName, quantity: i.quantity, note: i.note ?? null }))
      ).returning();
      // Deduct stock from source branch immediately
      for (const item of data.items) {
        await (db.update(products) as ReturnType<typeof db.update>)
          .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) - ${item.quantity})` })
          .where(and(eq(products.id, item.productId), inArray(products.userId, await this.getTenantUserIds(userId))));
        await db.insert(stockLogs).values({
          productId: item.productId, userId,
          previousStock: 0, newStock: 0, delta: -item.quantity,
          reason: "transfer_out", note: `Transfer to branch ${data.toBranchId ?? "?"}`,
        });
      }
    }
    return { ...transfer, items: insertedItems };
  }

  async updateStockTransferStatus(id: number, userId: string, status: "in_transit" | "received" | "rejected"): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const [transfer] = await db.select().from(stockTransfers)
      .where(and(eq(stockTransfers.id, id), inArray(stockTransfers.userId, userIds)));
    if (!transfer) throw new Error("Transfer not found");
    await (db.update(stockTransfers) as ReturnType<typeof db.update>)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(stockTransfers.id, id));
    if (status === "received" && transfer.toBranchId != null) {
      const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
      for (const item of items) {
        await (db.update(products) as ReturnType<typeof db.update>)
          .set({ stock: sql`COALESCE(stock, 0) + ${item.quantity}` })
          .where(and(eq(products.id, item.productId), inArray(products.userId, userIds)));
        await db.insert(stockLogs).values({
          productId: item.productId, userId,
          previousStock: 0, newStock: 0, delta: item.quantity,
          reason: "transfer_in", note: `Received transfer from branch ${transfer.fromBranchId ?? "?"}`,
        });
      }
    } else if (status === "rejected") {
      // Return stock to source branch
      const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
      for (const item of items) {
        await (db.update(products) as ReturnType<typeof db.update>)
          .set({ stock: sql`COALESCE(stock, 0) + ${item.quantity}` })
          .where(and(eq(products.id, item.productId), inArray(products.userId, userIds)));
        await db.insert(stockLogs).values({
          productId: item.productId, userId,
          previousStock: 0, newStock: 0, delta: item.quantity,
          reason: "transfer_rejected", note: `Transfer rejected — stock returned`,
        });
      }
    }
  }

  // ─── Reorder Suggestions (velocity-based) ──────────────────────────────────

  async getReorderSuggestions(userId: string, branchId?: number | null): Promise<{
    productId: number; productName: string; currentStock: number;
    lowStockThreshold: number; soldLast30Days: number; avgDailySales: number;
    daysOfStockLeft: number; suggestedOrderQty: number; preferredSupplierId: number | null;
    preferredSupplierName: string | null; unitCost: string | null;
  }[]> {
    const userIds = await this.getTenantUserIds(userId);
    const userCond = userIds.length === 1 ? eq(products.userId, userIds[0]) : inArray(products.userId, userIds);
    const branchCond = branchId != null ? eq(products.branchId, branchId) : undefined;
    const lowStockProds = await db.select().from(products).where(
      and(userCond, branchCond, eq(products.trackStock, true), sql`COALESCE(stock, 0) <= COALESCE(low_stock_threshold, 10)`, isNull(products.deletedAt))
    );
    if (lowStockProds.length === 0) return [];

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentSales = await db.select({ id: sales.id, items: sales.items, createdAt: sales.createdAt })
      .from(sales)
      .where(and(inArray(sales.userId, userIds), sql`${sales.createdAt} >= ${thirtyDaysAgo}`, isNull(sales.deletedAt)));

    const soldMap = new Map<number, number>();
    for (const sale of recentSales) {
      const items = (sale.items ?? []) as { productId?: number; id?: number; quantity?: number }[];
      for (const item of items) {
        const pid = Number(item.productId ?? item.id);
        if (!Number.isFinite(pid)) continue;
        soldMap.set(pid, (soldMap.get(pid) ?? 0) + Number(item.quantity ?? 1));
      }
    }

    const productIds = lowStockProds.map(p => p.id);
    const supplierProds = productIds.length > 0
      ? await db.select({ productId: supplierProducts.productId, supplierId: supplierProducts.supplierId, unitCost: supplierProducts.unitCost })
          .from(supplierProducts).where(inArray(supplierProducts.productId, productIds))
      : [];
    const supplierMap = new Map<number, { supplierId: number; unitCost: string }>();
    for (const sp of supplierProds) { if (!supplierMap.has(sp.productId)) supplierMap.set(sp.productId, { supplierId: sp.supplierId, unitCost: sp.unitCost }); }

    const supplierIdSet = new Set<number>();
    for (const sv of supplierMap.values()) supplierIdSet.add(sv.supplierId);
    const supplierIds = [...supplierIdSet];
    const supplierNames = supplierIds.length > 0
      ? await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(inArray(suppliers.id, supplierIds as number[]))
      : [];
    const supplierNameMap = new Map(supplierNames.map(s => [s.id, s.name]));

    return lowStockProds.map(prod => {
      const sold30 = soldMap.get(prod.id) ?? 0;
      const avgDaily = sold30 / 30;
      const current = prod.stock ?? 0;
      const daysLeft = avgDaily > 0 ? Math.floor(current / avgDaily) : 999;
      const reorderDays = 14;
      const suggested = Math.max(prod.lowStockThreshold ?? 10, Math.ceil(avgDaily * reorderDays * 1.2));
      const sp = supplierMap.get(prod.id);
      return {
        productId: prod.id, productName: prod.name,
        currentStock: current, lowStockThreshold: prod.lowStockThreshold ?? 10,
        soldLast30Days: sold30, avgDailySales: Math.round(avgDaily * 10) / 10,
        daysOfStockLeft: daysLeft, suggestedOrderQty: suggested,
        preferredSupplierId: sp?.supplierId ?? null,
        preferredSupplierName: sp ? (supplierNameMap.get(sp.supplierId) ?? null) : null,
        unitCost: sp?.unitCost ?? null,
      };
    }).sort((a, b) => a.daysOfStockLeft - b.daysOfStockLeft);
  }

  /** Deduct product stock after a sale and create restock notifications for items that hit 0 or low threshold. */
  async deductProductStockForSale(userId: string, items: any[]): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) return;
    try {
      const userIds = await this.getTenantUserIds(userId);
      const productQty = new Map<number, number>();
      for (const it of items) {
        const pid = Number(it?.productId ?? it?.id ?? it?.product?.id);
        const qty = Number(it?.quantity ?? 1);
        if (!Number.isFinite(pid) || !Number.isFinite(qty) || qty <= 0) continue;
        productQty.set(pid, (productQty.get(pid) ?? 0) + qty);
      }
      if (productQty.size === 0) return;

      const productIds = [...productQty.keys()];
      const userCondition = userIds.length === 1
        ? eq(products.userId, userIds[0])
        : inArray(products.userId, userIds);
      const rows = await db.select().from(products)
        .where(and(userCondition, inArray(products.id, productIds)));

      for (const product of rows) {
        if (!product.trackStock) continue;
        const sold = productQty.get(product.id) ?? 0;
        if (sold === 0) continue;
        const prevStock = product.stock ?? 0;
        // Atomic decrement via SQL expression — prevents race conditions with concurrent sales
        await (db.update(products) as any)
          .set({ stock: sql`GREATEST(0, COALESCE(stock, 0) - ${sold})` })
          .where(eq(products.id, product.id));
        const newStock = Math.max(0, prevStock - sold);
        const threshold = product.lowStockThreshold ?? 10;
        // Notify if stock just hit 0
        if (newStock === 0 && prevStock > 0) {
          await this.createNotification(userId, {
            type: "restock",
            title: `${product.name} is out of stock`,
            message: `Sold ${sold} unit${sold !== 1 ? "s" : ""}. Stock is now 0. Reorder immediately.`,
            productId: product.id,
          });
          // Fire push notification to all tenant users — non-blocking
          setImmediate(async () => {
            try {
              const { sendPushToUsers } = await import("./push");
              const tenantUserIds = await this.getTenantUserIds(userId);
              await sendPushToUsers(tenantUserIds, {
                title: `⚠️ Out of stock: ${product.name}`,
                body:  `Sold ${sold} unit${sold !== 1 ? "s" : ""}. Stock is now 0. Reorder immediately.`,
                tag:   `stock-${product.id}`,
                url:   "/products",
              });
            } catch {}
          });
        } else if (newStock > 0 && newStock <= threshold && prevStock > threshold) {
          // Notify only when crossing the low-stock threshold (not on every sale below it)
          await this.createNotification(userId, {
            type: "low_stock",
            title: `${product.name} is running low`,
            message: `Only ${newStock} unit${newStock !== 1 ? "s" : ""} remaining (threshold: ${threshold}).`,
            productId: product.id,
          });
          // Fire push notification to all tenant users — non-blocking
          setImmediate(async () => {
            try {
              const { sendPushToUsers } = await import("./push");
              const tenantUserIds = await this.getTenantUserIds(userId);
              await sendPushToUsers(tenantUserIds, {
                title: `📦 Low stock: ${product.name}`,
                body:  `Only ${newStock} unit${newStock !== 1 ? "s" : ""} remaining (threshold: ${threshold}).`,
                tag:   `stock-${product.id}`,
                url:   "/products",
              });
            } catch {}
          });
        }
      }
    } catch (e) {
      console.error("deductProductStockForSale error:", e);
    }
  }
}

export const storage = new DatabaseStorage();
