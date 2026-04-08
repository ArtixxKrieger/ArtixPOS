import { db } from "./db";
import {
  products,
  productSizes,
  productModifiers,
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
  type Supplier,
  type InsertSupplier,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type InsertPurchaseOrder,
  type TimeLog,
  type InsertTimeLog,
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
} from "@shared/schema";
import { eq, and, isNull, isNotNull, inArray, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Products
  getProducts(userId: string): Promise<Product[]>;
  getProduct(id: number, userId: string): Promise<Product | undefined>;
  createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product>;
  updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number, userId: string): Promise<void>;
  adjustStock(id: number, userId: string, delta: number): Promise<Product | undefined>;

  // Pending Orders
  getPendingOrders(userId: string): Promise<PendingOrder[]>;
  getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined>;
  createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder>;
  updatePendingOrder(id: number, userId: string, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined>;
  deletePendingOrder(id: number, userId: string): Promise<void>;

  // Sales
  getSales(userId: string, opts?: { limit?: number; offset?: number; startDate?: string; endDate?: string; customerId?: number }): Promise<Sale[]>;
  createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale>;
  softDeleteSale(id: number, userId: string, deletedBy: string): Promise<boolean>;
  getDeletedSales(userId: string): Promise<Sale[]>;

  // Settings
  getSettings(userId: string): Promise<UserSetting | undefined>;
  updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting>;

  // Customers
  getCustomers(userId: string): Promise<Customer[]>;
  getCustomer(id: number, userId: string): Promise<Customer | undefined>;
  createCustomer(userId: string, customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, userId: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number, userId: string): Promise<void>;
  updateCustomerStats(id: number, amount: number): Promise<void>;

  // Expenses
  getExpenses(userId: string): Promise<Expense[]>;
  createExpense(userId: string, expense: InsertExpense): Promise<Expense>;
  updateExpense(id: number, userId: string, expense: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: number, userId: string): Promise<void>;

  // Shifts
  getShifts(userId: string, opts?: { limit?: number; offset?: number }): Promise<Shift[]>;
  getOpenShift(userId: string): Promise<Shift | undefined>;
  openShift(userId: string, openingBalance: string, notes?: string): Promise<Shift>;
  closeShift(id: number, userId: string, closingBalance: string, notes?: string): Promise<Shift | undefined>;

  // Discount Codes
  getDiscountCodes(userId: string): Promise<DiscountCode[]>;
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

  // Purchase Orders
  getPurchaseOrders(userId: string): Promise<(PurchaseOrder & { items: PurchaseOrderItem[] })[]>;
  createPurchaseOrder(userId: string, po: InsertPurchaseOrder): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }>;
  receivePurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined>;
  cancelPurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined>;

  // Time Logs
  getTimeLogs(userId: string): Promise<TimeLog[]>;
  getActiveTimeLog(userId: string): Promise<TimeLog | undefined>;
  clockIn(userId: string, notes?: string): Promise<TimeLog>;
  clockOut(userId: string, notes?: string): Promise<TimeLog | undefined>;

  // Product barcode lookup
  getProductByBarcode(barcode: string, userId: string): Promise<Product | undefined>;

  // Loyalty points
  adjustLoyaltyPoints(customerId: number, delta: number, userId: string): Promise<Customer | undefined>;

  // Service Staff
  getServiceStaff(userId: string): Promise<ServiceStaff[]>;
  getServiceStaffMember(id: number, userId: string): Promise<ServiceStaff | undefined>;
  createServiceStaff(userId: string, staff: InsertServiceStaff): Promise<ServiceStaff>;
  updateServiceStaff(id: number, userId: string, staff: Partial<InsertServiceStaff>): Promise<ServiceStaff | undefined>;
  deleteServiceStaff(id: number, userId: string): Promise<void>;

  // Service Rooms
  getServiceRooms(userId: string): Promise<ServiceRoom[]>;
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

// 30-second in-memory cache for tenant user ID lookups (2 DB queries per call without this)
const _tenantUserCache = new Map<string, { ids: string[]; at: number }>();

export function invalidateTenantCache(userId: string): void {
  _tenantUserCache.delete(userId);
}

export class DatabaseStorage implements IStorage {

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getTenantUserIds(userId: string): Promise<string[]> {
    const cached = _tenantUserCache.get(userId);
    if (cached && Date.now() - cached.at < 30_000) return cached.ids;
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

  async getProducts(userId: string): Promise<Product[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      if (userIds.length === 1) {
        return await db.select().from(products).where(eq(products.userId, userIds[0]));
      }
      return await db.select().from(products).where(inArray(products.userId, userIds));
    } catch (error) {
      console.error("Error fetching products:", error);
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
      await db.delete(products).where(eq(products.id, id));
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  }

  async adjustStock(id: number, userId: string, delta: number): Promise<Product | undefined> {
    try {
      const existing = await this.getProduct(id, userId);
      if (!existing) return undefined;
      const newStock = Math.max(0, (existing.stock ?? 0) + delta);
      const [updated] = await db.update(products)
        .set({ stock: newStock } as any)
        .where(eq(products.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error adjusting stock:", error);
      return undefined;
    }
  }

  // ─── Pending Orders ───────────────────────────────────────────────────────

  async getPendingOrders(userId: string): Promise<PendingOrder[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      if (userIds.length === 1) {
        return await db.select().from(pendingOrders).where(eq(pendingOrders.userId, userIds[0]));
      }
      return await db.select().from(pendingOrders).where(inArray(pendingOrders.userId, userIds));
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      return [];
    }
  }

  async getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const conditions = userIds.length === 1
        ? and(eq(pendingOrders.id, id), eq(pendingOrders.userId, userIds[0]))
        : and(eq(pendingOrders.id, id), inArray(pendingOrders.userId, userIds));
      const [order] = await db.select().from(pendingOrders).where(conditions);
      return order;
    } catch (error) {
      console.error("Error fetching pending order:", error);
      return undefined;
    }
  }

  async createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder> {
    try {
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
      await db.delete(pendingOrders).where(eq(pendingOrders.id, id));
    } catch (error) {
      console.error("Error deleting pending order:", error);
      throw error;
    }
  }

  // ─── Sales ────────────────────────────────────────────────────────────────

  async getSales(userId: string, opts: { limit?: number; offset?: number; startDate?: string; endDate?: string; customerId?: number } = {}): Promise<Sale[]> {
    try {
      const { limit = 200, offset = 0, startDate, endDate, customerId } = opts;
      const userIds = await this.getTenantUserIds(userId);
      const userCondition = userIds.length === 1
        ? eq(sales.userId, userIds[0])
        : inArray(sales.userId, userIds);
      const conditions: any[] = [userCondition, isNull(sales.deletedAt)];
      if (startDate) conditions.push(sql`${sales.createdAt} >= ${startDate}`);
      if (endDate) conditions.push(sql`${sales.createdAt} <= ${endDate}`);
      if (customerId) conditions.push(eq(sales.customerId, customerId));
      return await db.select().from(sales)
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
      const [created] = await db.insert(sales).values({ ...sale, userId } as any).returning();
      // Fire-and-forget: customer stats update runs in the background so it
      // never delays the checkout response returned to the cashier.
      if (sale.customerId) {
        void this.updateCustomerStats(sale.customerId, parseFloat(sale.total) || 0);
      }
      return created;
    } catch (error) {
      console.error("Error creating sale:", error);
      throw error;
    }
  }

  async softDeleteSale(id: number, userId: string, deletedBy: string): Promise<boolean> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const userCondition = userIds.length === 1
        ? eq(sales.userId, userIds[0])
        : inArray(sales.userId, userIds);
      const [sale] = await db.select().from(sales).where(
        and(eq(sales.id, id), userCondition, isNull(sales.deletedAt))
      );
      if (!sale) return false;
      await (db.update(sales) as any)
        .set({ deletedAt: new Date().toISOString(), deletedBy })
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
      const [setting] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
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
        const [updated] = await db.update(userSettings)
          .set(settings as any)
          .where(eq(userSettings.userId, userId))
          .returning();
        return updated;
      } else {
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

  async getCustomers(userId: string): Promise<Customer[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      if (userIds.length === 1) {
        return await db.select().from(customers).where(eq(customers.userId, userIds[0])).orderBy(desc(customers.createdAt));
      }
      return await db.select().from(customers).where(inArray(customers.userId, userIds)).orderBy(desc(customers.createdAt));
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
      await db.delete(customers).where(eq(customers.id, id));
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

  async getExpenses(userId: string): Promise<Expense[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      if (userIds.length === 1) {
        return await db.select().from(expenses).where(eq(expenses.userId, userIds[0])).orderBy(desc(expenses.createdAt));
      }
      return await db.select().from(expenses).where(inArray(expenses.userId, userIds)).orderBy(desc(expenses.createdAt));
    } catch (error) {
      console.error("Error fetching expenses:", error);
      return [];
    }
  }

  async createExpense(userId: string, expense: InsertExpense): Promise<Expense> {
    try {
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
      await db.delete(expenses).where(eq(expenses.id, id));
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

  async openShift(userId: string, openingBalance: string, notes?: string): Promise<Shift> {
    try {
      const [created] = await db.insert(shifts).values({
        userId,
        openingBalance,
        notes: notes ?? null,
        status: "open",
      } as any).returning();
      return created;
    } catch (error) {
      console.error("Error opening shift:", error);
      throw error;
    }
  }

  async closeShift(id: number, userId: string, closingBalance: string, notes?: string): Promise<Shift | undefined> {
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

      const [updated] = await db.update(shifts)
        .set({
          status: "closed",
          closingBalance,
          closedAt: new Date().toISOString(),
          totalSales: totalSalesAmount.toFixed(2),
          totalExpenses: totalExpensesAmount.toFixed(2),
          salesCount: shiftSales.length,
          notes: notes ?? existing.notes,
        } as any)
        .where(eq(shifts.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error closing shift:", error);
      return undefined;
    }
  }

  // ─── Discount Codes ───────────────────────────────────────────────────────

  async getDiscountCodes(userId: string): Promise<DiscountCode[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      if (userIds.length === 1) {
        return await db.select().from(discountCodes).where(eq(discountCodes.userId, userIds[0])).orderBy(desc(discountCodes.createdAt));
      }
      return await db.select().from(discountCodes).where(inArray(discountCodes.userId, userIds)).orderBy(desc(discountCodes.createdAt));
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
        ? and(eq(discountCodes.code, upperCode), eq(discountCodes.userId, userIds[0]))
        : and(eq(discountCodes.code, upperCode), inArray(discountCodes.userId, userIds));
      const [dc] = await db.select().from(discountCodes).where(condition);
      return dc;
    } catch (error) {
      console.error("Error fetching discount code:", error);
      return undefined;
    }
  }

  async createDiscountCode(userId: string, code: InsertDiscountCode): Promise<DiscountCode> {
    try {
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
      const [existing] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
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
      await db.delete(discountCodes).where(eq(discountCodes.id, id));
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
        .orderBy(desc(refunds.createdAt));

      return results as RefundWithDetails[];
    } catch (error) {
      console.error("Error fetching refunds:", error);
      return [];
    }
  }

  async getRefundsBySale(saleId: number, userId: string): Promise<Refund[]> {
    try {
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
      const condition = userIds.length === 1 ? eq(tables.userId, userIds[0]) : inArray(tables.userId, userIds);
      return await db.select().from(tables).where(condition).orderBy(tables.name);
    } catch (error) {
      console.error("Error fetching tables:", error);
      return [];
    }
  }

  async getTable(id: number, userId: string): Promise<Table | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const [table] = await db.select().from(tables).where(eq(tables.id, id));
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
      const [existing] = await db.select().from(tables).where(eq(tables.id, id));
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
      await db.delete(tables).where(eq(tables.id, id));
    } catch (error) {
      console.error("Error deleting table:", error);
      throw error;
    }
  }

  // ─── Suppliers ────────────────────────────────────────────────────────────

  async getSuppliers(userId: string): Promise<Supplier[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1 ? eq(suppliers.userId, userIds[0]) : inArray(suppliers.userId, userIds);
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
      const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id));
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
      await db.delete(suppliers).where(eq(suppliers.id, id));
    } catch (error) {
      console.error("Error deleting supplier:", error);
      throw error;
    }
  }

  // ─── Purchase Orders ──────────────────────────────────────────────────────

  async getPurchaseOrders(userId: string): Promise<(PurchaseOrder & { items: PurchaseOrderItem[] })[]> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1 ? eq(purchaseOrders.userId, userIds[0]) : inArray(purchaseOrders.userId, userIds);
      const pos = await db.select().from(purchaseOrders).where(condition).orderBy(desc(purchaseOrders.createdAt));
      const result: (PurchaseOrder & { items: PurchaseOrderItem[] })[] = [];
      for (const po of pos) {
        const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
        result.push({ ...po, items });
      }
      return result;
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

  async adjustLoyaltyPoints(customerId: number, delta: number, userId: string): Promise<Customer | undefined> {
    try {
      const userIds = await this.getTenantUserIds(userId);
      const condition = userIds.length === 1
        ? and(eq(customers.id, customerId), eq(customers.userId, userIds[0]))
        : and(eq(customers.id, customerId), inArray(customers.userId, userIds));
      const [customer] = await db.select().from(customers).where(condition);
      if (!customer) return undefined;
      const newPoints = Math.max(0, (customer.loyaltyPoints ?? 0) + delta);
      const [updated] = await db.update(customers).set({ loyaltyPoints: newPoints } as any).where(eq(customers.id, customerId)).returning();
      return updated;
    } catch (error) {
      console.error("Error adjusting loyalty points:", error);
      return undefined;
    }
  }

  // ─── Service Staff ────────────────────────────────────────────────────────

  async getServiceStaff(userId: string): Promise<ServiceStaff[]> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? eq(serviceStaff.userId, userIds[0])
      : inArray(serviceStaff.userId, userIds);
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
    const [created] = await db.insert(serviceStaff).values({ ...staff, userId } as any).returning();
    return created;
  }

  async updateServiceStaff(id: number, userId: string, staff: Partial<InsertServiceStaff>): Promise<ServiceStaff | undefined> {
    const existing = await this.getServiceStaffMember(id, userId);
    if (!existing) return undefined;
    const [updated] = await db.update(serviceStaff).set(staff as any).where(eq(serviceStaff.id, id)).returning();
    return updated;
  }

  async deleteServiceStaff(id: number, userId: string): Promise<void> {
    const existing = await this.getServiceStaffMember(id, userId);
    if (!existing) return;
    await db.delete(serviceStaff).where(eq(serviceStaff.id, id));
  }

  // ─── Service Rooms ────────────────────────────────────────────────────────

  async getServiceRooms(userId: string): Promise<ServiceRoom[]> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? eq(serviceRooms.userId, userIds[0])
      : inArray(serviceRooms.userId, userIds);
    return db.select().from(serviceRooms).where(condition).orderBy(desc(serviceRooms.createdAt));
  }

  async createServiceRoom(userId: string, room: InsertServiceRoom): Promise<ServiceRoom> {
    const [created] = await db.insert(serviceRooms).values({ ...room, userId } as any).returning();
    return created;
  }

  async updateServiceRoom(id: number, userId: string, room: Partial<InsertServiceRoom>): Promise<ServiceRoom | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(serviceRooms.id, id), eq(serviceRooms.userId, userIds[0]))
      : and(eq(serviceRooms.id, id), inArray(serviceRooms.userId, userIds));
    const [existing] = await db.select().from(serviceRooms).where(condition);
    if (!existing) return undefined;
    const [updated] = await db.update(serviceRooms).set(room as any).where(eq(serviceRooms.id, id)).returning();
    return updated;
  }

  async deleteServiceRoom(id: number, userId: string): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(serviceRooms.id, id), eq(serviceRooms.userId, userIds[0]))
      : and(eq(serviceRooms.id, id), inArray(serviceRooms.userId, userIds));
    const [existing] = await db.select().from(serviceRooms).where(condition);
    if (!existing) return;
    await db.delete(serviceRooms).where(eq(serviceRooms.id, id));
  }

  // ─── Appointments ─────────────────────────────────────────────────────────

  async getAppointments(userId: string, opts?: { date?: string; staffId?: number; status?: string }): Promise<Appointment[]> {
    const userIds = await this.getTenantUserIds(userId);
    let condition = userIds.length === 1
      ? eq(appointments.userId, userIds[0])
      : inArray(appointments.userId, userIds);
    if (opts?.date) {
      condition = and(condition, eq(appointments.date, opts.date)) as any;
    }
    if (opts?.staffId) {
      condition = and(condition, eq(appointments.staffId, opts.staffId)) as any;
    }
    if (opts?.status) {
      condition = and(condition, eq(appointments.status, opts.status)) as any;
    }
    return db.select().from(appointments).where(condition).orderBy(appointments.date, appointments.startTime);
  }

  async getAppointment(id: number, userId: string): Promise<Appointment | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(appointments.id, id), eq(appointments.userId, userIds[0]))
      : and(eq(appointments.id, id), inArray(appointments.userId, userIds));
    const [appt] = await db.select().from(appointments).where(condition);
    return appt;
  }

  async createAppointment(userId: string, appt: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values({ ...appt, userId } as any).returning();
    return created;
  }

  async updateAppointment(id: number, userId: string, appt: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const existing = await this.getAppointment(id, userId);
    if (!existing) return undefined;
    const [updated] = await db.update(appointments).set(appt as any).where(eq(appointments.id, id)).returning();
    return updated;
  }

  async deleteAppointment(id: number, userId: string): Promise<void> {
    const existing = await this.getAppointment(id, userId);
    if (!existing) return;
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  // ─── Membership Plans ─────────────────────────────────────────────────────

  async getMembershipPlans(userId: string): Promise<MembershipPlan[]> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? eq(membershipPlans.userId, userIds[0])
      : inArray(membershipPlans.userId, userIds);
    return db.select().from(membershipPlans).where(condition).orderBy(desc(membershipPlans.createdAt));
  }

  async createMembershipPlan(userId: string, plan: InsertMembershipPlan): Promise<MembershipPlan> {
    const [created] = await db.insert(membershipPlans).values({ ...plan, userId } as any).returning();
    return created;
  }

  async updateMembershipPlan(id: number, userId: string, plan: Partial<InsertMembershipPlan>): Promise<MembershipPlan | undefined> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(membershipPlans.id, id), eq(membershipPlans.userId, userIds[0]))
      : and(eq(membershipPlans.id, id), inArray(membershipPlans.userId, userIds));
    const [existing] = await db.select().from(membershipPlans).where(condition);
    if (!existing) return undefined;
    const [updated] = await db.update(membershipPlans).set(plan as any).where(eq(membershipPlans.id, id)).returning();
    return updated;
  }

  async deleteMembershipPlan(id: number, userId: string): Promise<void> {
    const userIds = await this.getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(membershipPlans.id, id), eq(membershipPlans.userId, userIds[0]))
      : and(eq(membershipPlans.id, id), inArray(membershipPlans.userId, userIds));
    const [existing] = await db.select().from(membershipPlans).where(condition);
    if (!existing) return;
    await db.delete(membershipPlans).where(eq(membershipPlans.id, id));
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
    const [created] = await db.insert(memberships).values({ ...m, userId } as any).returning();
    return created;
  }

  async updateMembership(id: number, userId: string, m: Partial<InsertMembership>): Promise<Membership | undefined> {
    const existing = await this.getMembership(id, userId);
    if (!existing) return undefined;
    const [updated] = await db.update(memberships).set(m as any).where(eq(memberships.id, id)).returning();
    return updated;
  }

  async deleteMembership(id: number, userId: string): Promise<void> {
    const existing = await this.getMembership(id, userId);
    if (!existing) return;
    await db.delete(memberships).where(eq(memberships.id, id));
  }

  async checkInMember(userId: string, data: InsertMembershipCheckIn): Promise<MembershipCheckIn> {
    const [checkIn] = await db.insert(membershipCheckIns).values({ ...data, userId } as any).returning();
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
}

export const storage = new DatabaseStorage();
