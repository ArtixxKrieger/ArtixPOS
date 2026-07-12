import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, nativeFetch, setNativeToken } from "@/lib/queryClient";

export interface OpeningHoursDay {
  open: string;
  close: string;
  closed: boolean;
}

export interface Branch {
  id: number;
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  color: string | null;
  timezone: string | null;
  taxRate: string | null;
  openingHours: Record<string, OpeningHoursDay> | null;
  isActive: boolean;
  isMain: boolean;
  businessType: string | null;
  businessSubType: string | null;
  createdAt: string;
}

export interface BranchStats {
  allTime: { revenue: number; orders: number };
  today: { revenue: number; orders: number };
  thisMonth: { revenue: number; orders: number };
  staffCount: number;
  topProducts: { name: string; qty: number }[];
  last7Days: { day: string; revenue: number; orders: number }[];
}

export interface TenantUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
  role: "owner" | "manager" | "admin" | "cashier" | "staff";
  tenantId: string | null;
  createdAt: string;
  branches: number[];
  isBanned: boolean;
  bannedAt: string | null;
  deletedAt: string | null;
  lastSeenAt: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  tenantId: string;
  userId: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RolePermission {
  id: number;
  tenantId: string;
  role: string;
  maxDiscountPercent: number;
  canRefund: boolean;
  canDeleteSale: boolean;
  canVoidOrder: boolean;
  updatedAt: string;
}

export interface BranchAnalytics {
  branch: Branch;
  totalRevenue: number;
  totalOrders: number;
  todayRevenue: number;
  todayOrders: number;
}

export function useTenant() {
  return useQuery<Tenant>({
    queryKey: ["/api/admin/tenant"],
  });
}

function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest("PUT", "/api/admin/tenant", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tenant"] });
    },
  });
}

export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: ["/api/admin/branches"],
    select: (data) => (Array.isArray(data) ? data : []),
  });
}

type BranchPayload = {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  color?: string | null;
  timezone?: string | null;
  taxRate?: string | null;
  openingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  isActive?: boolean;
  businessType?: string | null;
  businessSubType?: string | null;
};

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: BranchPayload): Promise<Branch> => {
      const res = await apiRequest("POST", "/api/admin/branches", data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/branches"] });
      qc.invalidateQueries({ queryKey: ["auth-me"] });
    },
  });
}

export function useBranchStats(branchId: number | null) {
  return useQuery<BranchStats>({
    queryKey: ["/api/admin/branches", branchId, "stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/branches/${branchId}/stats`);
      return res.json();
    },
    enabled: branchId !== null,
    staleTime: 60_000,
  });
}

export function useDuplicateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchId: number): Promise<Branch> => {
      const res = await apiRequest("POST", `/api/admin/branches/${branchId}/duplicate`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/branches"] });
    },
  });
}

export interface BranchSeedTemplate {
  available: boolean;
  label?: string;
  description?: string;
  itemCount?: number;
  tableCount?: number;
}

export async function fetchBranchSeedTemplate(branchId: number): Promise<BranchSeedTemplate> {
  const res = await apiRequest("GET", `/api/admin/branches/${branchId}/seed-template`);
  return res.json();
}

export function useSeedBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ branchId, templateKey }: { branchId: number; templateKey?: string }) => {
      const res = await apiRequest("POST", `/api/admin/branches/${branchId}/seed`, templateKey ? { templateKey } : {});
      return res.json() as Promise<{ ok: boolean; productsCreated: number; tablesCreated: number; template: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/tables"] });
    },
  });
}

export function useResetBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ branchId, reseed, templateKey }: { branchId: number; reseed?: boolean; templateKey?: string }) => {
      const res = await apiRequest("POST", `/api/admin/branches/${branchId}/reset`, {
        reseed: reseed ?? false,
        ...(templateKey ? { templateKey } : {}),
      });
      return res.json() as Promise<{
        ok: boolean;
        productsDeleted: number;
        tablesDeleted: number;
        productsCreated: number;
        tablesCreated: number;
        template: string | null;
      }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/tables"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/branches"] });
    },
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<BranchPayload>) =>
      apiRequest("PUT", `/api/admin/branches/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/branches"] });
    },
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/admin/branches/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/branches"] });
    },
  });
}

export function useSetMainBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/admin/branches/${id}/set-main`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/branches"] });
    },
  });
}

export function useTenantUsers() {
  return useQuery<TenantUser[]>({
    queryKey: ["/api/admin/users"],
  });
}

export function useCreateStaffUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; role: "manager" | "admin" | "cashier" | "staff"; branchIds?: number[]; pin?: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: "owner" | "manager" | "admin" | "cashier" | "staff" }) =>
      apiRequest("PUT", `/api/admin/users/${id}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useRevokeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/admin/users/${id}/ban`, { banned: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useRestoreAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/admin/users/${id}/ban`, { banned: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useAssignBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, branchId }: { userId: string; branchId: number }) =>
      apiRequest("POST", `/api/admin/users/${userId}/branches`, { branchId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useRemoveBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, branchId }: { userId: string; branchId: number }) =>
      apiRequest("DELETE", `/api/admin/users/${userId}/branches/${branchId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useBranchAnalytics() {
  return useQuery<BranchAnalytics[]>({
    queryKey: ["/api/admin/analytics"],
  });
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  entity?: string;
  startDate?: string;
  endDate?: string;
}

export function useAuditLogs(filters?: AuditLogFilters) {
  const params = new URLSearchParams();
  if (filters?.userId) params.set("userId", filters.userId);
  if (filters?.action) params.set("action", filters.action);
  if (filters?.entity) params.set("entity", filters.entity);
  if (filters?.startDate) params.set("startDate", filters.startDate);
  if (filters?.endDate) params.set("endDate", filters.endDate);
  const qs = params.toString();
  return useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit-logs", qs],
    queryFn: async () => {
      const res = await nativeFetch(`/api/admin/audit-logs${qs ? "?" + qs : ""}`);
      if (!res.ok) throw new Error(`Failed to fetch audit logs: ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
}

export function useRolePermissions() {
  return useQuery<RolePermission[]>({
    queryKey: ["/api/admin/permissions"],
  });
}

export function useUpdateRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, ...data }: { role: "manager" | "cashier"; maxDiscountPercent?: number; canRefund?: boolean; canDeleteSale?: boolean; canVoidOrder?: boolean }) =>
      apiRequest("PUT", `/api/admin/permissions/${role}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
    },
  });
}

export function useDeletedUsers(enabled = true) {
  return useQuery<TenantUser[]>({
    queryKey: ["/api/admin/users/deleted"],
    enabled,
  });
}

export function useRestoreDeletedUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/users/${id}/restore`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/users/deleted"] });
    },
  });
}

export function useMyPermissions() {
  return useQuery<{ role: string; maxDiscountPercent: number; canRefund: boolean; canDeleteSale: boolean; canVoidOrder: boolean }>({
    queryKey: ["/api/my-permissions"],
  });
}

export function useSwitchBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchId: number | null) => {
      const res = await apiRequest("POST", "/api/admin/switch-branch", { branchId });
      const data = await res.json().catch(() => ({}));

if (data?.token) {
        setNativeToken(data.token);
      }
      return data;
    },
    onSuccess: () => {

qc.clear();
    },
  });
}

export function useEnsureTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/ensure-tenant", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth-me"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/tenant"] });
    },
  });
}
