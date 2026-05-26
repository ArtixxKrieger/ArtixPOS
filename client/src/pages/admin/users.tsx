import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Plus, Trash2, ShieldCheck, User2, CreditCard,
  Building2, Copy, Check, Clock, RefreshCw,
  ShieldOff, ShieldAlert, Wifi, WifiOff, KeyRound, Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  useTenantUsers, useDeleteUser, useUpdateUserRole,
  useAssignBranch, useRemoveBranch, useBranches,
  useEnsureTenant, useRevokeAccess, useRestoreAccess,
  type TenantUser,
} from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const ROLE_ICONS: Record<string, any> = {
  owner: ShieldCheck,
  manager: User2,
  admin: User2,
  cashier: CreditCard,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  manager: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  admin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  cashier: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

function getOnlineStatus(lastSeenAt: string | null): { label: string; color: string; dot: string } {
  if (!lastSeenAt) return { label: "Never", color: "text-muted-foreground/40", dot: "bg-muted-foreground/30" };
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < 5 * 60 * 1000) return { label: "Online", color: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" };
  if (diff < 60 * 60 * 1000) return { label: "Recently", color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-400" };
  return {
    label: formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true }),
    color: "text-muted-foreground/60",
    dot: "bg-muted-foreground/30",
  };
}

function BranchAssignDialog({ user, open, onClose }: { user: TenantUser; open: boolean; onClose: () => void }) {
  const { data: branches = [] } = useBranches();
  const assignBranch = useAssignBranch();
  const removeBranch = useRemoveBranch();
  const { toast } = useToast();

  async function toggle(branchId: number, currentlyAssigned: boolean) {
    try {
      if (currentlyAssigned) {
        await removeBranch.mutateAsync({ userId: user.id, branchId });
      } else {
        await assignBranch.mutateAsync({ userId: user.id, branchId });
      }
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to update assignment", variant: "destructive" });
    }
  }

  const isPending = assignBranch.isPending || removeBranch.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Branch Access — {user.name}</DialogTitle>
          <DialogDescription>Toggle which branches this staff member can access.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No branches created yet</p>
          ) : branches.map(branch => {
            const assigned = user.branches.includes(branch.id);
            return (
              <div key={branch.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors">
            <Checkbox
                  id={`assign-${branch.id}`}
                  checked={assigned}
                  disabled={isPending}
                  onCheckedChange={(checked) => toggle(branch.id, !!checked === false)}
                  className="shrink-0"
                  data-testid={`checkbox-branch-${branch.id}`}
                />
                <label htmlFor={`assign-${branch.id}`} className="flex-1 text-sm font-medium cursor-pointer flex items-center gap-2 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{branch.name}</span>
                </label>
                {assigned && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    Assigned
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PIN Management Dialog ─────────────────────────────────────────────────────

function PinManageDialog({ user, open, onClose }: { user: TenantUser; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  const setPin_ = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff-pin/set", { userId: user.id, pin });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? "Failed"); }
    },
    onSuccess: () => {
      toast({ title: "PIN set", description: `${user.name ?? "Staff"} can now clock in with their PIN.` });
      setPin(""); setConfirm("");
      onClose();
    },
    onError: (e: any) => toast({ title: e.message ?? "Failed to set PIN", variant: "destructive" }),
  });

  const removePin = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/staff-pin/${user.id}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? "Failed"); }
    },
    onSuccess: () => {
      toast({ title: "PIN removed" });
      onClose();
    },
    onError: (e: any) => toast({ title: e.message ?? "Failed", variant: "destructive" }),
  });

  const unlockPin = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/staff-pin/unlock/${user.id}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? "Failed"); }
    },
    onSuccess: () => toast({ title: "PIN unlocked" }),
    onError: (e: any) => toast({ title: e.message ?? "Failed", variant: "destructive" }),
  });

  const pinOk = /^\d{4,6}$/.test(pin) && pin === confirm;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            PIN Clock-in — {user.name}
          </DialogTitle>
          <DialogDescription>
            Set a 4–6 digit numeric PIN so {user.name?.split(" ")[0] ?? "staff"} can clock in at the register without a password.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">New PIN (4–6 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••"
              data-testid="input-staff-pin"
              className="w-full h-10 px-3 rounded-xl border border-border/50 bg-secondary/30 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={e => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••"
              data-testid="input-staff-pin-confirm"
              className="w-full h-10 px-3 rounded-xl border border-border/50 bg-secondary/30 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {pin && confirm && !pinOk && (
            <p className="text-xs text-destructive">PINs do not match or are not 4–6 digits</p>
          )}
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <div className="flex gap-2 flex-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={unlockPin.isPending}
              onClick={() => unlockPin.mutate()}
            >
              <Unlock className="h-3.5 w-3.5" /> Unlock
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={removePin.isPending}
              onClick={() => removePin.mutate()}
            >
              Remove PIN
            </Button>
          </div>
          <Button
            size="sm"
            disabled={!pinOk || setPin_.isPending}
            onClick={() => setPin_.mutate()}
            data-testid="button-set-pin"
          >
            {setPin_.isPending ? "Saving…" : "Set PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { data: tenantUsers = [], isLoading } = useTenantUsers();
  const { data: branches = [] } = useBranches();
  const deleteUser = useDeleteUser();
  const updateRole = useUpdateUserRole();
  const revokeAccess = useRevokeAccess();
  const restoreAccess = useRestoreAccess();
  const ensureTenant = useEnsureTenant();
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);
  const [branchAssignUser, setBranchAssignUser] = useState<TenantUser | null>(null);
  const [pinManageUser, setPinManageUser] = useState<TenantUser | null>(null);
  const isOwner = currentUser?.role === "owner";
  const { toast } = useToast();

  useEffect(() => {
    if (currentUser && !currentUser.tenantId) {
      ensureTenant.mutate();
    }
  }, [currentUser?.tenantId]);

  const branchName = (id: number) => branches.find(b => b.id === id)?.name ?? `Branch ${id}`;

  async function handleDelete() {
    if (!deletingUserId) return;
    try {
      await deleteUser.mutateAsync(deletingUserId);
      toast({ title: "Team member removed" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to remove user", variant: "destructive" });
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleRevoke(u: TenantUser) {
    try {
      if (u.isBanned) {
        await restoreAccess.mutateAsync(u.id);
        toast({ title: "Access restored", description: `${u.name ?? "User"} can now log in again.` });
      } else {
        await revokeAccess.mutateAsync(u.id);
        toast({ title: "Access revoked", description: `${u.name ?? "User"} can no longer log in.` });
      }
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to update access", variant: "destructive" });
    } finally {
      setRevokingUserId(null);
    }
  }

  return (
    <div className="space-y-5 page-enter pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/25 shrink-0">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black tracking-tight">Team</h2>
          <p className="text-xs text-muted-foreground font-medium">Manage staff roles and branch access</p>
        </div>
      </div>

      {tenantUsers.length === 0 ? (

        /* Empty state */
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-purple-500" strokeWidth={1.5} />
          </div>
          <p className="font-semibold text-foreground">No team members yet</p>
          <p className="text-sm text-muted-foreground mt-1">Staff accounts are added directly and log in with their PIN.</p>
        </div>

      ) : (

        /* User list */
        <div className="space-y-3">
          {tenantUsers.map(u => {
            const RoleIcon = ROLE_ICONS[u.role] ?? User2;
            const isSelf = u.id === currentUser?.id;
            const showActions = isOwner && !isSelf && u.role !== "owner";
            const onlineStatus = getOnlineStatus(u.lastSeenAt ?? null);

            return (
              <div
                key={u.id}
                data-testid={`card-user-${u.id}`}
                className={cn(
                  "glass-card rounded-2xl p-4",
                  u.isBanned && "opacity-60 border-rose-200 dark:border-rose-900/40"
                )}
              >
                {/* Top row: avatar + info */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar with online dot */}
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name ?? ""} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">
                          {(u.name ?? "?")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Online status dot */}
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                        onlineStatus.dot,
                        onlineStatus.label === "Online" && "animate-pulse"
                      )}
                    />
                  </div>

                  {/* Name + role + email */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm truncate max-w-[140px] sm:max-w-none" data-testid={`text-user-name-${u.id}`}>
                        {u.name ?? "Unnamed"}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/40 shrink-0">
                          You
                        </span>
                      )}
                      {u.isBanned && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 shrink-0 flex items-center gap-1">
                          <ShieldOff className="h-2.5 w-2.5" />
                          Access Revoked
                        </span>
                      )}
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                        ROLE_COLORS[u.role]
                      )}>
                        <RoleIcon className="h-2.5 w-2.5" />
                        {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email ?? `via ${u.provider}`}
                      </p>
                      {/* Online status text */}
                      <span className={cn("text-[10px] font-medium shrink-0 flex items-center gap-0.5", onlineStatus.color)}>
                        {onlineStatus.label === "Online" ? (
                          <Wifi className="h-2.5 w-2.5" />
                        ) : onlineStatus.label === "Never" ? (
                          <WifiOff className="h-2.5 w-2.5" />
                        ) : null}
                        {onlineStatus.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Branch badges */}
                {u.branches.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2.5 pl-[52px] flex-wrap">
                    {u.branches.map(bid => (
                      <span key={bid} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">
                        <Building2 className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[80px]">{branchName(bid)}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Action row */}
                {showActions && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/20 flex-wrap">
                    {/* Branch assign */}
                    <button
                      data-testid={`button-assign-branches-${u.id}`}
                      title="Manage branches"
                      onClick={() => setBranchAssignUser(u)}
                      className="h-8 px-3 flex items-center gap-1.5 rounded-xl bg-secondary/60 hover:bg-secondary text-xs font-semibold text-foreground transition-colors shrink-0"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Branches</span>
                    </button>

                    {/* PIN management (not for managers) */}
                    {u.role !== "manager" && (
                      <button
                        data-testid={`button-pin-${u.id}`}
                        title="Set clock-in PIN"
                        onClick={() => setPinManageUser(u)}
                        className="h-8 px-3 flex items-center gap-1.5 rounded-xl bg-secondary/60 hover:bg-secondary text-xs font-semibold text-foreground transition-colors shrink-0"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>PIN</span>
                      </button>
                    )}

                    {/* Role select */}
                    <Select
                      value={u.role}
                      onValueChange={async (role) => {
                        try {
                          await updateRole.mutateAsync({ id: u.id, role: role as any });
                          toast({ title: "Role updated" });
                        } catch (err: any) {
                          toast({ title: err?.message ?? "Failed to update role", variant: "destructive" });
                        }
                      }}
                    >
                      <SelectTrigger
                        data-testid={`select-role-${u.id}`}
                        className="h-8 w-auto min-w-[100px] max-w-[140px] text-xs border-border/40 bg-secondary/40 rounded-xl"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="cashier">Cashier</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Revoke / Restore access */}
                    <button
                      data-testid={`button-revoke-${u.id}`}
                      onClick={() => setRevokingUserId(u.id)}
                      title={u.isBanned ? "Restore access" : "Revoke access"}
                      className={cn(
                        "h-8 px-3 flex items-center gap-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0",
                        u.isBanned
                          ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {u.isBanned ? (
                        <><ShieldCheck className="h-3.5 w-3.5" /><span>Restore</span></>
                      ) : (
                        <><ShieldAlert className="h-3.5 w-3.5" /><span>Revoke</span></>
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      data-testid={`button-delete-user-${u.id}`}
                      onClick={() => setDeletingUserId(u.id)}
                      className="h-8 w-8 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 transition-colors ml-auto shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {branchAssignUser && (
        <BranchAssignDialog
          user={branchAssignUser}
          open={!!branchAssignUser}
          onClose={() => setBranchAssignUser(null)}
        />
      )}

      {pinManageUser && (
        <PinManageDialog
          user={pinManageUser}
          open={!!pinManageUser}
          onClose={() => setPinManageUser(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingUserId} onOpenChange={() => setDeletingUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this user from your organization. They will lose all access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke/Restore confirmation */}
      <AlertDialog open={!!revokingUserId} onOpenChange={() => setRevokingUserId(null)}>
        <AlertDialogContent>
          {(() => {
            const target = tenantUsers.find(u => u.id === revokingUserId);
            const isBanned = target?.isBanned ?? false;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{isBanned ? "Restore Access" : "Revoke Access"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isBanned
                      ? `${target?.name ?? "This user"} will be able to log in and use the system again.`
                      : `${target?.name ?? "This user"} will be immediately logged out and unable to access the system. Their data will be preserved.`
                    }
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => target && handleRevoke(target)}
                    className={isBanned
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-amber-600 text-white hover:bg-amber-700"
                    }
                  >
                    {isBanned ? "Restore Access" : "Revoke Access"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
