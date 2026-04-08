import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Branch {
  id: number;
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  isMain: boolean;
  createdAt: string;
}

export interface TenantUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
  role: "owner" | "manager" | "admin" | "cashier";
  tenantId: string | null;
  createdAt: string;
  branches: number[];
  isBanned: boolean;
  bannedAt: string | null;
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
  metadata: Record<string, any> | null;
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

// ─── Tenant ───────────────────────────────────────────────────────────────────

export function useTenant() {
  return useQuery<Tenant>({
    queryKey: ["/api/admin/tenant"],
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest("PUT", "/api/admin/tenant", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tenant"] });
    },
  });
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: ["/api/admin/branches"],
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; address?: string; phone?: string; isActive?: boolean }) =>
      apiRequest("POST", "/api/admin/branches", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/branches"] });
    },
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; address?: string | null; phone?: string | null; isActive?: boolean }) =>
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

// ─── Users ────────────────────────────────────────────────────────────────────

export function useTenantUsers() {
  return useQuery<TenantUser[]>({
    queryKey: ["/api/admin/users"],
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; role: "manager" | "admin" | "cashier"; password: string; branchIds?: number[] }) =>
      apiRequest("POST", "/api/admin/users", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: "owner" | "manager" | "admin" | "cashier" }) =>
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

// ─── Analytics ────────────────────────────────────────────────────────────────

export function useBranchAnalytics() {
  return useQuery<BranchAnalytics[]>({
    queryKey: ["/api/admin/analytics"],
  });
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

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
    queryFn: () =>
      fetch(`/api/admin/audit-logs${qs ? "?" + qs : ""}`, { credentials: "include" }).then(r => r.json()),
  });
}

// ─── Role Permissions ─────────────────────────────────────────────────────────

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

export function useMyPermissions() {
  return useQuery<{ role: string; maxDiscountPercent: number; canRefund: boolean; canDeleteSale: boolean; canVoidOrder: boolean }>({
    queryKey: ["/api/my-permissions"],
  });
}

// ─── Branch Switch ────────────────────────────────────────────────────────────

export function useSwitchBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branchId: number | null) =>
      apiRequest("POST", "/api/admin/switch-branch", { branchId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth-me"] });
    },
  });
}

// ─── Invite Tokens ────────────────────────────────────────────────────────────

export interface InviteResult {
  token: string;
  link: string;
  expiresAt: string;
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { role: "manager" | "admin" | "cashier"; branchIds?: number[] }): Promise<InviteResult> =>
      apiRequest("POST", "/api/admin/invite", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/invites"] });
    },
  });
}

export function useRedeemInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiRequest("POST", "/api/admin/invite/redeem", { token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth-me"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/tenant"] });
    },
  });
}

// ─── Ensure tenant ────────────────────────────────────────────────────────────

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
