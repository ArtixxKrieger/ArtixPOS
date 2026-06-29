import { db } from "../../db";
import {
  membershipPlans,
  memberships,
  membershipCheckIns,
  customers,
  type MembershipPlan,
  type InsertMembershipPlan,
  type Membership,
  type InsertMembership,
  type MembershipCheckIn,
  type InsertMembershipCheckIn,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getMembershipPlans(userId: string): Promise<MembershipPlan[]> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(membershipPlans.userId, userIds[0]), isNull(membershipPlans.deletedAt))
    : and(inArray(membershipPlans.userId, userIds), isNull(membershipPlans.deletedAt));
  return db.select().from(membershipPlans).where(condition).orderBy(desc(membershipPlans.createdAt));
}

export async function createMembershipPlan(userId: string, plan: InsertMembershipPlan): Promise<MembershipPlan> {
  const [created] = await db.insert(membershipPlans).values({ ...plan, userId } as any).returning();
  return created;
}

export async function updateMembershipPlan(id: number, userId: string, plan: Partial<InsertMembershipPlan>): Promise<MembershipPlan | undefined> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(membershipPlans.id, id), eq(membershipPlans.userId, userIds[0]), isNull(membershipPlans.deletedAt))
    : and(eq(membershipPlans.id, id), inArray(membershipPlans.userId, userIds), isNull(membershipPlans.deletedAt));
  const [existing] = await db.select().from(membershipPlans).where(condition);
  if (!existing) return undefined;
  const [updated] = await db.update(membershipPlans).set(plan as any).where(eq(membershipPlans.id, id)).returning();
  return updated;
}

export async function deleteMembershipPlan(id: number, userId: string): Promise<void> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(membershipPlans.id, id), eq(membershipPlans.userId, userIds[0]), isNull(membershipPlans.deletedAt))
    : and(eq(membershipPlans.id, id), inArray(membershipPlans.userId, userIds), isNull(membershipPlans.deletedAt));
  const [existing] = await db.select().from(membershipPlans).where(condition);
  if (!existing) return;
  await db.update(membershipPlans).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(eq(membershipPlans.id, id));
}

export async function getMemberships(userId: string): Promise<(Membership & { customerName: string | null; customerPhone: string | null })[]> {
  const userIds = await getTenantUserIds(userId);
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

export async function getMembership(id: number, userId: string): Promise<Membership | undefined> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1
    ? and(eq(memberships.id, id), eq(memberships.userId, userIds[0]))
    : and(eq(memberships.id, id), inArray(memberships.userId, userIds));
  const [m] = await db.select().from(memberships).where(condition);
  return m;
}

export async function createMembership(userId: string, m: InsertMembership): Promise<Membership> {
  const [created] = await db.insert(memberships).values({ ...m, userId } as any).returning();
  return created;
}

export async function updateMembership(id: number, userId: string, m: Partial<InsertMembership>): Promise<Membership | undefined> {
  const existing = await getMembership(id, userId);
  if (!existing) return undefined;
  const [updated] = await db.update(memberships).set(m as any).where(eq(memberships.id, id)).returning();
  return updated;
}

export async function deleteMembership(id: number, userId: string): Promise<void> {
  const existing = await getMembership(id, userId);
  if (!existing) return;
  await db.update(memberships).set({ deletedAt: new Date().toISOString() } as any).where(eq(memberships.id, id));
}

export async function checkInMember(userId: string, data: InsertMembershipCheckIn): Promise<MembershipCheckIn> {
  const userIds = await getTenantUserIds(userId);
  const [existingMembership] = await db.select({ userId: memberships.userId }).from(memberships)
    .where(eq(memberships.id, data.membershipId));
  if (!existingMembership || !userIds.includes(existingMembership.userId)) {
    throw new Error("Membership not found or access denied");
  }
  return await db.transaction(async (tx) => {
    const [checkIn] = await tx.insert(membershipCheckIns).values({ ...data, userId } as any).returning();
    await tx.update(memberships).set({
      checkInsUsed: sql`check_ins_used + 1`,
    } as any).where(eq(memberships.id, data.membershipId));
    return checkIn;
  });
}

export async function getCheckIns(membershipId: number, userId: string): Promise<MembershipCheckIn[]> {
  return db.select().from(membershipCheckIns)
    .where(and(eq(membershipCheckIns.membershipId, membershipId), eq(membershipCheckIns.userId, userId)))
    .orderBy(desc(membershipCheckIns.checkedInAt));
}
