import { db } from "../db";
import {
  products,
  productSizes,
  productModifiers,
  sales,
  pendingOrders,
  userSettings,
  customers,
  serviceStaff,
  serviceRooms,
  appointments,
  membershipPlans,
  memberships,
  membershipCheckIns,
  expenses,
  shifts,
  discountCodes,
  refunds,
  timeLogs,
  tables,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  supplierProducts,
  userBranches,
  auditLogs,
  ingredients,
  productRecipes,
  wifiVouchers,
  payrollPeriods,
  payrollEntries,
  branches,
  tenants,
  rolePermissions,
  tenantSubscriptions,
  subscriptionPayments,
  stockLogs,
  wasteLog,
  stockTransfers,
  stockTransferItems,
  loyaltyTiers,
  loyaltyRewards,
  loyaltyPointsLog,
  notifications,
} from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

export async function deleteUsersData(uids: string[]): Promise<void> {
  if (uids.length === 0) return;

  const userProductIds = (
    await db.select({ id: products.id }).from(products).where(inArray(products.userId, uids))
  ).map((r) => r.id);

  const userIngredientIds = (
    await db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(inArray(ingredients.userId, uids))
  ).map((r) => r.id);

  const userSaleIds = (
    await db.select({ id: sales.id }).from(sales).where(inArray(sales.userId, uids))
  ).map((r) => r.id);

  const userPoIds = (
    await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.userId, uids))
  ).map((r) => r.id);

  const userSupplierIds = (
    await db.select({ id: suppliers.id }).from(suppliers).where(inArray(suppliers.userId, uids))
  ).map((r) => r.id);

  const userMembershipIds = (
    await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(inArray(memberships.userId, uids))
  ).map((r) => r.id);

  const userPayrollPeriodIds = (
    await db
      .select({ id: payrollPeriods.id })
      .from(payrollPeriods)
      .where(inArray(payrollPeriods.userId, uids))
  ).map((r) => r.id);

  const userStockTransferIds = (
    await db
      .select({ id: stockTransfers.id })
      .from(stockTransfers)
      .where(inArray(stockTransfers.userId, uids))
  ).map((r) => r.id);

  if (userMembershipIds.length > 0) {
    await db
      .delete(membershipCheckIns)
      .where(inArray(membershipCheckIns.membershipId, userMembershipIds));
  }
  await db.delete(membershipCheckIns).where(inArray(membershipCheckIns.userId, uids));

  await db.delete(loyaltyPointsLog).where(inArray(loyaltyPointsLog.userId, uids));

  if (userSaleIds.length > 0) {
    await db.delete(refunds).where(inArray(refunds.saleId, userSaleIds));
  }
  await db.delete(refunds).where(inArray(refunds.userId, uids));

  if (userStockTransferIds.length > 0) {
    await db
      .delete(stockTransferItems)
      .where(inArray(stockTransferItems.transferId, userStockTransferIds));
  }

  if (userProductIds.length > 0) {
    await db.delete(productRecipes).where(inArray(productRecipes.productId, userProductIds));
    await db.delete(productSizes).where(inArray(productSizes.productId, userProductIds));
    await db.delete(productModifiers).where(inArray(productModifiers.productId, userProductIds));
  }
  if (userIngredientIds.length > 0) {
    await db.delete(productRecipes).where(inArray(productRecipes.ingredientId, userIngredientIds));
  }

  if (userPoIds.length > 0) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.purchaseOrderId, userPoIds));
  }

  if (userSupplierIds.length > 0) {
    await db.delete(supplierProducts).where(inArray(supplierProducts.supplierId, userSupplierIds));
  }
  if (userProductIds.length > 0) {
    await db.delete(supplierProducts).where(inArray(supplierProducts.productId, userProductIds));
  }

  await db.delete(stockLogs).where(inArray(stockLogs.userId, uids));
  if (userProductIds.length > 0) {
    await db.delete(stockLogs).where(inArray(stockLogs.productId, userProductIds));
  }

  await db.delete(wasteLog).where(inArray(wasteLog.userId, uids));

  await db.delete(appointments).where(inArray(appointments.userId, uids));

  await db.delete(memberships).where(inArray(memberships.userId, uids));

  await db.delete(wifiVouchers).where(inArray(wifiVouchers.userId, uids));
  if (userSaleIds.length > 0) {
    await db.delete(wifiVouchers).where(inArray(wifiVouchers.saleId, userSaleIds));
  }

  await db.delete(notifications).where(inArray(notifications.userId, uids));

  await db.delete(timeLogs).where(inArray(timeLogs.userId, uids));

  if (userPayrollPeriodIds.length > 0) {
    await db.delete(payrollEntries).where(inArray(payrollEntries.periodId, userPayrollPeriodIds));
  }
  await db.delete(payrollEntries).where(inArray(payrollEntries.employeeUserId, uids));

  await db.delete(stockTransfers).where(inArray(stockTransfers.userId, uids));

  await db.delete(sales).where(inArray(sales.userId, uids));

  await db.delete(pendingOrders).where(inArray(pendingOrders.userId, uids));

  await db.delete(purchaseOrders).where(inArray(purchaseOrders.userId, uids));

  await db.delete(payrollPeriods).where(inArray(payrollPeriods.userId, uids));

  await db.delete(membershipPlans).where(inArray(membershipPlans.userId, uids));

  await db.delete(loyaltyRewards).where(inArray(loyaltyRewards.userId, uids));

  await db.delete(serviceStaff).where(inArray(serviceStaff.userId, uids));

  await db.delete(serviceRooms).where(inArray(serviceRooms.userId, uids));

  await db.delete(customers).where(inArray(customers.userId, uids));

  await db.delete(ingredients).where(inArray(ingredients.userId, uids));

  await db.delete(products).where(inArray(products.userId, uids));

  await db.delete(suppliers).where(inArray(suppliers.userId, uids));

  await db.delete(tables).where(inArray(tables.userId, uids));

  await db.delete(loyaltyTiers).where(inArray(loyaltyTiers.userId, uids));

  await db.delete(shifts).where(inArray(shifts.userId, uids));

  await db.delete(discountCodes).where(inArray(discountCodes.userId, uids));

  await db.delete(expenses).where(inArray(expenses.userId, uids));

  await db
    .update(auditLogs)
    .set({ metadata: { deleted: true } } as any)
    .where(inArray(auditLogs.userId, uids));

  await db.delete(userSettings).where(inArray(userSettings.userId, uids));

  await db.delete(userBranches).where(inArray(userBranches.userId, uids));
}

export async function deleteTenantShell(tenantId: string): Promise<void> {
  await db.execute(
    sql`UPDATE users SET active_branch_id = NULL, tenant_id = NULL WHERE tenant_id = ${tenantId}`,
  );

  await db
    .delete(userBranches)
    .where(
      inArray(
        userBranches.branchId,
        db.select({ id: branches.id }).from(branches).where(eq(branches.tenantId, tenantId)),
      ),
    );

  await db.delete(branches).where(eq(branches.tenantId, tenantId));

  await db.delete(rolePermissions).where(eq(rolePermissions.tenantId, tenantId));
  await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId));
  await db.delete(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));

  await db
    .update(auditLogs)
    .set({ metadata: { tenantDeleted: true } } as any)
    .where(eq(auditLogs.tenantId, tenantId));

  await db.delete(tenants).where(eq(tenants.id, tenantId));
}
