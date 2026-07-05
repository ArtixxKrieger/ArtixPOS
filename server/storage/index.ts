import type {
  Product, InsertProduct,
  PendingOrder, InsertPendingOrder,
  Sale, InsertSale,
  UserSetting, InsertUserSetting,
  Customer, InsertCustomer,
  Expense, InsertExpense,
  Shift,
  DiscountCode, InsertDiscountCode,
  Refund, InsertRefund, RefundWithDetails,
  Table, InsertTable,
  Supplier, InsertSupplier,
  SupplierProduct, InsertSupplierProduct,
  PurchaseOrder, PurchaseOrderItem, InsertPurchaseOrder,
  TimeLog,
  StaffSchedule, InsertStaffSchedule,
  ServiceStaff, InsertServiceStaff,
  ServiceRoom, InsertServiceRoom,
  Appointment, InsertAppointment,
  MembershipPlan, InsertMembershipPlan,
  Membership, InsertMembership,
  MembershipCheckIn, InsertMembershipCheckIn,
  Ingredient, InsertIngredient,
  ProductRecipe,
  WifiVoucher, InsertWifiVoucher,
  PayrollPeriod, InsertPayrollPeriod,
  PayrollEntry, UpdatePayrollEntry,
  Notification,
  StockLog,
  WasteLogEntry,
  StockTransfer, StockTransferItem,
  LoyaltyTier, InsertLoyaltyTier,
  LoyaltyReward, InsertLoyaltyReward,
  LoyaltyPointsLog,
} from "@shared/schema";

export { invalidateTenantCache } from "../infrastructure/persistence/base";

import * as productsModule from "../infrastructure/persistence/products";
import * as ordersModule from "../infrastructure/persistence/orders";
import * as salesModule from "../infrastructure/persistence/sales";
import * as settingsModule from "../infrastructure/persistence/settings";
import * as customersModule from "../infrastructure/persistence/customers";
import * as expensesModule from "../infrastructure/persistence/expenses";
import * as shiftsModule from "../infrastructure/persistence/shifts";
import * as discountsModule from "../infrastructure/persistence/discounts";
import * as tablesModule from "../infrastructure/persistence/tables";
import * as suppliersModule from "../infrastructure/persistence/suppliers";
import * as timeclockModule from "../infrastructure/persistence/timeclock";
import * as appointmentsModule from "../infrastructure/persistence/appointments";
import * as membershipsModule from "../infrastructure/persistence/memberships";
import * as inventoryModule from "../infrastructure/persistence/inventory";
import * as wifiVouchersModule from "../infrastructure/persistence/wifi-vouchers";
import * as payrollModule from "../infrastructure/persistence/payroll";
import * as notificationsModule from "../infrastructure/persistence/notifications";

export interface IStorage {
  getProducts(userId: string, branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number }): Promise<Product[]>;
  getLowStockProducts(userId: string, branchId?: number | null): Promise<Product[]>;
  getProduct(id: number, userId: string): Promise<Product | undefined>;
  createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product>;
  updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number, userId: string): Promise<void>;
  adjustStock(id: number, userId: string, delta: number): Promise<Product | undefined>;
  setStock(id: number, userId: string, newStock: number): Promise<Product | undefined>;
  getStockLogs(productId: number, userId: string): Promise<StockLog[]>;
  getProductByBarcode(barcode: string, userId: string): Promise<Product | undefined>;
  deductProductStockForSale(userId: string, items: any[]): Promise<void>;

  getPendingOrders(userId: string, branchId?: number | null, opts?: { limit?: number; offset?: number }): Promise<PendingOrder[]>;
  getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined>;
  createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder>;
  updatePendingOrder(id: number, userId: string, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined>;
  deletePendingOrder(id: number, userId: string): Promise<void>;

  getSales(userId: string, opts?: { limit?: number; offset?: number; beforeId?: number; startDate?: string; endDate?: string; customerId?: number; branchId?: number | null; includeVoided?: boolean }): Promise<Sale[]>;
  getSaleById(id: number, userId: string): Promise<Sale | undefined>;
  createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale>;
  softDeleteSale(id: number, userId: string, deletedBy: string, reason?: string): Promise<boolean>;
  getDeletedSales(userId: string): Promise<Sale[]>;
  deductIngredientsForSale(userId: string, items: { productId: number; quantity: number }[]): Promise<void>;

  getSettings(userId: string): Promise<UserSetting | undefined>;
  updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting>;

  getCustomers(userId: string, opts?: { limit?: number; offset?: number; orderByTopSpenders?: boolean }): Promise<Customer[]>;
  getCustomer(id: number, userId: string): Promise<Customer | undefined>;
  createCustomer(userId: string, customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, userId: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number, userId: string): Promise<void>;
  updateCustomerStats(id: number, amount: number): Promise<void>;

  getLoyaltyTiers(userId: string): Promise<LoyaltyTier[]>;
  createLoyaltyTier(userId: string, tier: InsertLoyaltyTier): Promise<LoyaltyTier>;
  updateLoyaltyTier(id: number, userId: string, tier: Partial<InsertLoyaltyTier>): Promise<LoyaltyTier | undefined>;
  deleteLoyaltyTier(id: number, userId: string): Promise<void>;
  getLoyaltyRewards(userId: string): Promise<LoyaltyReward[]>;
  createLoyaltyReward(userId: string, reward: InsertLoyaltyReward): Promise<LoyaltyReward>;
  updateLoyaltyReward(id: number, userId: string, reward: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined>;
  deleteLoyaltyReward(id: number, userId: string): Promise<void>;
  redeemLoyaltyReward(customerId: number, rewardId: number, userId: string): Promise<{ customer: Customer; reward: LoyaltyReward; log: LoyaltyPointsLog } | null>;
  getLoyaltyPointsLog(customerId: number, userId: string): Promise<LoyaltyPointsLog[]>;
  addLoyaltyPointsLog(userId: string, customerId: number, delta: number, reason: string, opts?: { saleId?: number; rewardId?: number; note?: string; expiresAt?: string }): Promise<LoyaltyPointsLog>;
  recalcCustomerTier(customerId: number, tiers: LoyaltyTier[]): Promise<void>;
  adjustLoyaltyPoints(customerId: number, delta: number, userId: string, opts?: { reason?: string; saleId?: number; rewardId?: number; note?: string }): Promise<Customer | undefined>;

  getExpenses(userId: string, branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number }): Promise<Expense[]>;
  getExpenseById(id: number, userId: string): Promise<Expense | undefined>;
  createExpense(userId: string, expense: InsertExpense): Promise<Expense>;
  updateExpense(id: number, userId: string, expense: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: number, userId: string): Promise<void>;

  getShifts(userId: string, opts?: { limit?: number; offset?: number }): Promise<Shift[]>;
  getOpenShift(userId: string): Promise<Shift | undefined>;
  openShift(userId: string, openingBalance: string, notes?: string, denominationOpen?: string): Promise<Shift>;
  closeShift(id: number, userId: string, closingBalance: string, notes?: string, denominationClose?: string, variance?: string): Promise<Shift | undefined>;
  addCashAdjustment(shiftId: number, userId: string, type: "in" | "out", amount: string, reason: string): Promise<Shift | undefined>;

  getDiscountCodes(userId: string, opts?: { limit?: number; offset?: number }): Promise<DiscountCode[]>;
  getDiscountCodeByCode(code: string, userId: string): Promise<DiscountCode | undefined>;
  createDiscountCode(userId: string, code: InsertDiscountCode): Promise<DiscountCode>;
  updateDiscountCode(id: number, userId: string, code: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined>;
  deleteDiscountCode(id: number, userId: string): Promise<void>;
  incrementDiscountCodeUsage(id: number): Promise<boolean>;

  getRefunds(userId: string): Promise<RefundWithDetails[]>;
  getRefundsBySale(saleId: number, userId: string): Promise<Refund[]>;
  createRefund(userId: string, refund: InsertRefund): Promise<Refund>;

  getTables(userId: string): Promise<Table[]>;
  getTable(id: number, userId: string): Promise<Table | undefined>;
  createTable(userId: string, table: InsertTable): Promise<Table>;
  updateTable(id: number, userId: string, table: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: number, userId: string): Promise<void>;

  getSuppliers(userId: string): Promise<Supplier[]>;
  createSupplier(userId: string, supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, userId: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: number, userId: string): Promise<void>;
  getSupplierStats(userId: string, supplierId: number): Promise<{ totalOrders: number; totalSpent: number; pendingAmount: number; lastOrderAt: string | null }>;
  getSupplierProducts(supplierId: number, userId: string): Promise<(SupplierProduct & { productName: string; productSku: string | null; currentStock: number | null })[]>;
  upsertSupplierProduct(supplierId: number, userId: string, data: InsertSupplierProduct): Promise<SupplierProduct>;
  deleteSupplierProduct(id: number, userId: string): Promise<void>;

  getPurchaseOrders(userId: string): Promise<(PurchaseOrder & { items: PurchaseOrderItem[] })[]>;
  createPurchaseOrder(userId: string, po: InsertPurchaseOrder): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }>;
  receivePurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined>;
  cancelPurchaseOrder(id: number, userId: string): Promise<PurchaseOrder | undefined>;
  updatePurchaseOrderPayment(id: number, userId: string, paymentStatus: string): Promise<PurchaseOrder | undefined>;

  getReorderSuggestions(userId: string, branchId?: number | null): Promise<{
    productId: number; productName: string; currentStock: number;
    lowStockThreshold: number; soldLast30Days: number; avgDailySales: number;
    daysOfStockLeft: number; suggestedOrderQty: number; preferredSupplierId: number | null;
    preferredSupplierName: string | null; unitCost: string | null;
  }[]>;

  getTimeLogs(userId: string, opts?: { limit?: number; offset?: number }): Promise<TimeLog[]>;
  getActiveTimeLog(userId: string): Promise<TimeLog | undefined>;
  clockIn(userId: string, notes?: string): Promise<TimeLog>;
  clockOut(userId: string, notes?: string): Promise<TimeLog | undefined>;
  startBreak(userId: string): Promise<TimeLog | undefined>;
  endBreak(userId: string): Promise<TimeLog | undefined>;
  getTeamTimeLogs(userId: string, opts?: { limit?: number; offset?: number }): Promise<{
    id: number; userId: string; clockIn: string; clockOut: string | null;
    notes: string | null; clockOutNotes: string | null; breakStart: string | null;
    breakMinutes: number | null; createdAt: string | null; userName: string | null; userEmail: string | null;
  }[]>;
  editTimeLog(managerId: string, logId: number, data: { clockIn?: string; clockOut?: string | null; breakMinutes?: number; notes?: string | null; clockOutNotes?: string | null }): Promise<TimeLog | undefined>;
  deleteTimeLog(managerId: string, logId: number): Promise<boolean>;
  createManualTimeLog(managerId: string, data: { userId: string; branchId?: number; clockIn: string; clockOut?: string | null; breakMinutes?: number; notes?: string | null; clockOutNotes?: string | null }): Promise<TimeLog>;

  getStaffSchedules(managerId: string, targetUserId?: string): Promise<(StaffSchedule & { userName: string | null; userEmail: string | null })[]>;
  getScheduleEmployees(managerId: string): Promise<{ id: string; name: string | null; email: string | null; role: string | null }[]>;
  createStaffSchedule(managerId: string, data: Omit<InsertStaffSchedule, "tenantId">): Promise<StaffSchedule>;
  updateStaffSchedule(id: number, managerId: string, data: Partial<InsertStaffSchedule>): Promise<StaffSchedule | undefined>;
  deleteStaffSchedule(id: number, managerId: string): Promise<boolean>;

  getServiceStaff(userId: string, branchId?: number | null): Promise<ServiceStaff[]>;
  getServiceStaffMember(id: number, userId: string): Promise<ServiceStaff | undefined>;
  createServiceStaff(userId: string, staff: InsertServiceStaff): Promise<ServiceStaff>;
  updateServiceStaff(id: number, userId: string, staff: Partial<InsertServiceStaff>): Promise<ServiceStaff | undefined>;
  deleteServiceStaff(id: number, userId: string): Promise<void>;

  getServiceRooms(userId: string, branchId?: number | null): Promise<ServiceRoom[]>;
  createServiceRoom(userId: string, room: InsertServiceRoom): Promise<ServiceRoom>;
  updateServiceRoom(id: number, userId: string, room: Partial<InsertServiceRoom>): Promise<ServiceRoom | undefined>;
  deleteServiceRoom(id: number, userId: string): Promise<void>;

  getAppointments(userId: string, opts?: { date?: string; staffId?: number; status?: string }): Promise<Appointment[]>;
  getAppointment(id: number, userId: string): Promise<Appointment | undefined>;
  createAppointment(userId: string, appt: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, userId: string, appt: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number, userId: string): Promise<void>;

  getMembershipPlans(userId: string): Promise<MembershipPlan[]>;
  createMembershipPlan(userId: string, plan: InsertMembershipPlan): Promise<MembershipPlan>;
  updateMembershipPlan(id: number, userId: string, plan: Partial<InsertMembershipPlan>): Promise<MembershipPlan | undefined>;
  deleteMembershipPlan(id: number, userId: string): Promise<void>;
  getMemberships(userId: string): Promise<(Membership & { customerName: string | null; customerPhone: string | null })[]>;
  getMembership(id: number, userId: string): Promise<Membership | undefined>;
  createMembership(userId: string, m: InsertMembership): Promise<Membership>;
  updateMembership(id: number, userId: string, m: Partial<InsertMembership>): Promise<Membership | undefined>;
  deleteMembership(id: number, userId: string): Promise<void>;
  checkInMember(userId: string, data: InsertMembershipCheckIn): Promise<MembershipCheckIn>;
  getCheckIns(membershipId: number, userId: string): Promise<MembershipCheckIn[]>;

  getIngredients(userId: string): Promise<Ingredient[]>;
  getIngredient(id: number, userId: string): Promise<Ingredient | undefined>;
  createIngredient(userId: string, data: InsertIngredient): Promise<Ingredient>;
  updateIngredient(id: number, userId: string, data: Partial<InsertIngredient>): Promise<Ingredient | undefined>;
  deleteIngredient(id: number, userId: string): Promise<void>;
  adjustIngredientStock(id: number, userId: string, delta: number): Promise<Ingredient | undefined>;
  getRecipeForProduct(productId: number, userId: string): Promise<(ProductRecipe & { ingredientName: string; unit: string })[]>;
  getProductsUsingIngredient(ingredientId: number, userId: string): Promise<{ id: number; name: string; quantity: string }[]>;
  setRecipeForProduct(productId: number, userId: string, items: { ingredientId: number; quantity: string }[]): Promise<void>;

  getWasteLogs(userId: string, branchId?: number | null): Promise<WasteLogEntry[]>;
  createWasteLog(userId: string, data: { productId?: number | null; ingredientId?: number | null; itemName: string; quantity: string; unit?: string; reason: string; costImpact: string; note?: string; branchId?: number | null }): Promise<WasteLogEntry>;

  getStockTransfers(userId: string, branchId?: number | null): Promise<(StockTransfer & { items: StockTransferItem[] })[]>;
  createStockTransfer(userId: string, data: { fromBranchId?: number | null; toBranchId?: number | null; notes?: string; items: { productId: number; productName: string; quantity: number; note?: string }[] }): Promise<StockTransfer & { items: StockTransferItem[] }>;
  updateStockTransferStatus(id: number, userId: string, status: "in_transit" | "received" | "rejected"): Promise<void>;

  getWifiVouchers(userId: string): Promise<WifiVoucher[]>;
  createWifiVoucher(userId: string, data: InsertWifiVoucher & { saleId?: number | null }): Promise<WifiVoucher>;
  redeemWifiVoucher(code: string, userId: string): Promise<WifiVoucher | undefined>;
  updateWifiVoucherMikrotikId(id: number, mikrotikUserId: string): Promise<void>;
  expireOverdueVouchers(): Promise<Array<{ id: number; mikrotikUserId: string | null; userId: string }>>;

  getPayrollPeriods(userId: string): Promise<PayrollPeriod[]>;
  getPayrollPeriod(id: number, userId: string): Promise<PayrollPeriod | undefined>;
  createPayrollPeriod(userId: string, data: InsertPayrollPeriod): Promise<PayrollPeriod>;
  getPayrollEntries(periodId: number, userId: string): Promise<PayrollEntry[]>;
  updatePayrollEntry(id: number, userId: string, data: UpdatePayrollEntry): Promise<PayrollEntry | undefined>;
  finalizePayrollPeriod(id: number, userId: string): Promise<PayrollPeriod | undefined>;
  markPayrollPeriodPaid(id: number, userId: string): Promise<PayrollPeriod | undefined>;
  deletePayrollPeriod(id: number, userId: string): Promise<void>;
  updateUserWage(targetUserId: string, requesterId: string, data: { wageType: string; wageRate: string; commissionPercent: string }): Promise<any>;

  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(userId: string, data: { type: string; title: string; message?: string; productId?: number }): Promise<void>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  getProducts = productsModule.getProducts;
  getLowStockProducts = productsModule.getLowStockProducts;
  getProduct = productsModule.getProduct;
  createProduct = productsModule.createProduct;
  updateProduct = productsModule.updateProduct;
  deleteProduct = productsModule.deleteProduct;
  adjustStock = productsModule.adjustStock;
  setStock = productsModule.setStock;
  getStockLogs = productsModule.getStockLogs;
  getProductByBarcode = productsModule.getProductByBarcode;
  deductProductStockForSale = productsModule.deductProductStockForSale;

  getPendingOrders = ordersModule.getPendingOrders;
  getPendingOrder = ordersModule.getPendingOrder;
  createPendingOrder = ordersModule.createPendingOrder;
  updatePendingOrder = ordersModule.updatePendingOrder;
  deletePendingOrder = ordersModule.deletePendingOrder;

  getSales = salesModule.getSales;
  getSaleById = salesModule.getSaleById;
  createSale = salesModule.createSale;
  softDeleteSale = salesModule.softDeleteSale;
  getDeletedSales = salesModule.getDeletedSales;
  deductIngredientsForSale = inventoryModule.deductIngredientsForSale;

  getSettings = settingsModule.getSettings;
  updateSettings = settingsModule.updateSettings;

  getCustomers = customersModule.getCustomers;
  getCustomer = customersModule.getCustomer;
  createCustomer = customersModule.createCustomer;
  updateCustomer = customersModule.updateCustomer;
  deleteCustomer = customersModule.deleteCustomer;
  updateCustomerStats = customersModule.updateCustomerStats;
  getLoyaltyTiers = customersModule.getLoyaltyTiers;
  createLoyaltyTier = customersModule.createLoyaltyTier;
  updateLoyaltyTier = customersModule.updateLoyaltyTier;
  deleteLoyaltyTier = customersModule.deleteLoyaltyTier;
  getLoyaltyRewards = customersModule.getLoyaltyRewards;
  createLoyaltyReward = customersModule.createLoyaltyReward;
  updateLoyaltyReward = customersModule.updateLoyaltyReward;
  deleteLoyaltyReward = customersModule.deleteLoyaltyReward;
  redeemLoyaltyReward = customersModule.redeemLoyaltyReward;
  getLoyaltyPointsLog = customersModule.getLoyaltyPointsLog;
  addLoyaltyPointsLog = customersModule.addLoyaltyPointsLog;
  recalcCustomerTier = customersModule.recalcCustomerTier;
  adjustLoyaltyPoints = customersModule.adjustLoyaltyPoints;

  getExpenses = expensesModule.getExpenses;
  getExpenseById = expensesModule.getExpenseById;
  createExpense = expensesModule.createExpense;
  updateExpense = expensesModule.updateExpense;
  deleteExpense = expensesModule.deleteExpense;

  getShifts = shiftsModule.getShifts;
  getOpenShift = shiftsModule.getOpenShift;
  openShift = shiftsModule.openShift;
  closeShift = shiftsModule.closeShift;
  addCashAdjustment = shiftsModule.addCashAdjustment;

  getDiscountCodes = discountsModule.getDiscountCodes;
  getDiscountCodeByCode = discountsModule.getDiscountCodeByCode;
  createDiscountCode = discountsModule.createDiscountCode;
  updateDiscountCode = discountsModule.updateDiscountCode;
  deleteDiscountCode = discountsModule.deleteDiscountCode;
  incrementDiscountCodeUsage = discountsModule.incrementDiscountCodeUsage;
  getRefunds = discountsModule.getRefunds;
  getRefundsBySale = discountsModule.getRefundsBySale;
  createRefund = discountsModule.createRefund;

  getTables = tablesModule.getTables;
  getTable = tablesModule.getTable;
  createTable = tablesModule.createTable;
  updateTable = tablesModule.updateTable;
  deleteTable = tablesModule.deleteTable;

  getSuppliers = suppliersModule.getSuppliers;
  createSupplier = suppliersModule.createSupplier;
  updateSupplier = suppliersModule.updateSupplier;
  deleteSupplier = suppliersModule.deleteSupplier;
  getSupplierStats = suppliersModule.getSupplierStats;
  getSupplierProducts = suppliersModule.getSupplierProducts;
  upsertSupplierProduct = suppliersModule.upsertSupplierProduct;
  deleteSupplierProduct = suppliersModule.deleteSupplierProduct;
  getPurchaseOrders = suppliersModule.getPurchaseOrders;
  createPurchaseOrder = suppliersModule.createPurchaseOrder;
  receivePurchaseOrder = suppliersModule.receivePurchaseOrder;
  cancelPurchaseOrder = suppliersModule.cancelPurchaseOrder;
  updatePurchaseOrderPayment = suppliersModule.updatePurchaseOrderPayment;
  getReorderSuggestions = suppliersModule.getReorderSuggestions;

  getTimeLogs = timeclockModule.getTimeLogs;
  getActiveTimeLog = timeclockModule.getActiveTimeLog;
  clockIn = timeclockModule.clockIn;
  clockOut = timeclockModule.clockOut;
  startBreak = timeclockModule.startBreak;
  endBreak = timeclockModule.endBreak;
  getTeamTimeLogs = timeclockModule.getTeamTimeLogs;
  editTimeLog = timeclockModule.editTimeLog;
  deleteTimeLog = timeclockModule.deleteTimeLog;
  createManualTimeLog = timeclockModule.createManualTimeLog;
  getStaffSchedules = timeclockModule.getStaffSchedules;
  getScheduleEmployees = timeclockModule.getScheduleEmployees;
  createStaffSchedule = timeclockModule.createStaffSchedule;
  updateStaffSchedule = timeclockModule.updateStaffSchedule;
  deleteStaffSchedule = timeclockModule.deleteStaffSchedule;

  getServiceStaff = appointmentsModule.getServiceStaff;
  getServiceStaffMember = appointmentsModule.getServiceStaffMember;
  createServiceStaff = appointmentsModule.createServiceStaff;
  updateServiceStaff = appointmentsModule.updateServiceStaff;
  deleteServiceStaff = appointmentsModule.deleteServiceStaff;
  getServiceRooms = appointmentsModule.getServiceRooms;
  createServiceRoom = appointmentsModule.createServiceRoom;
  updateServiceRoom = appointmentsModule.updateServiceRoom;
  deleteServiceRoom = appointmentsModule.deleteServiceRoom;
  getAppointments = appointmentsModule.getAppointments;
  getAppointment = appointmentsModule.getAppointment;
  createAppointment = appointmentsModule.createAppointment;
  updateAppointment = appointmentsModule.updateAppointment;
  deleteAppointment = appointmentsModule.deleteAppointment;

  getMembershipPlans = membershipsModule.getMembershipPlans;
  createMembershipPlan = membershipsModule.createMembershipPlan;
  updateMembershipPlan = membershipsModule.updateMembershipPlan;
  deleteMembershipPlan = membershipsModule.deleteMembershipPlan;
  getMemberships = membershipsModule.getMemberships;
  getMembership = membershipsModule.getMembership;
  createMembership = membershipsModule.createMembership;
  updateMembership = membershipsModule.updateMembership;
  deleteMembership = membershipsModule.deleteMembership;
  checkInMember = membershipsModule.checkInMember;
  getCheckIns = membershipsModule.getCheckIns;

  getIngredients = inventoryModule.getIngredients;
  getIngredient = inventoryModule.getIngredient;
  createIngredient = inventoryModule.createIngredient;
  updateIngredient = inventoryModule.updateIngredient;
  deleteIngredient = inventoryModule.deleteIngredient;
  adjustIngredientStock = inventoryModule.adjustIngredientStock;
  getRecipeForProduct = inventoryModule.getRecipeForProduct;
  getProductsUsingIngredient = inventoryModule.getProductsUsingIngredient;
  setRecipeForProduct = inventoryModule.setRecipeForProduct;
  getWasteLogs = inventoryModule.getWasteLogs;
  createWasteLog = inventoryModule.createWasteLog;
  getStockTransfers = inventoryModule.getStockTransfers;
  createStockTransfer = inventoryModule.createStockTransfer;
  updateStockTransferStatus = inventoryModule.updateStockTransferStatus;

  getWifiVouchers = wifiVouchersModule.getWifiVouchers;
  createWifiVoucher = wifiVouchersModule.createWifiVoucher;
  redeemWifiVoucher = wifiVouchersModule.redeemWifiVoucher;
  updateWifiVoucherMikrotikId = wifiVouchersModule.updateWifiVoucherMikrotikId;
  expireOverdueVouchers = wifiVouchersModule.expireOverdueVouchers;

  getPayrollPeriods = payrollModule.getPayrollPeriods;
  getPayrollPeriod = payrollModule.getPayrollPeriod;
  createPayrollPeriod = payrollModule.createPayrollPeriod;
  getPayrollEntries = payrollModule.getPayrollEntries;
  updatePayrollEntry = payrollModule.updatePayrollEntry;
  finalizePayrollPeriod = payrollModule.finalizePayrollPeriod;
  markPayrollPeriodPaid = payrollModule.markPayrollPeriodPaid;
  deletePayrollPeriod = payrollModule.deletePayrollPeriod;
  updateUserWage = payrollModule.updateUserWage;

  getNotifications = notificationsModule.getNotifications;
  createNotification = notificationsModule.createNotification;
  markNotificationRead = notificationsModule.markNotificationRead;
  markAllNotificationsRead = notificationsModule.markAllNotificationsRead;
}

export const storage = new DatabaseStorage();
