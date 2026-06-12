import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Trash2, ShieldCheck, User2, CreditCard,
  Building2, Check, Clock, UserPlus,
  ShieldOff, ShieldAlert, Wifi, WifiOff, KeyRound, Unlock,
  RotateCcw, AlertTriangle, Lock,
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
  useEnsureTenant, useRevokeAccess, useRestoreAccess, useCreateStaffUser,
  useDeletedUsers, useRestoreDeletedUser,
  type TenantUser,
} from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription, FREE_LIMITS } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const addStaffSchema = z.object({
  name:      z.string().min(1, "Name is required"),
  role:      z.enum(["manager", "admin", "cashier", "staff"]),
  branchIds: z.array(z.number()).min(1, "Assign at least one branch"),
  pin:       z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits").optional().or(z.literal("")),
});
type AddStaffForm = z.infer<typeof addStaffSchema>;

function AddStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: branches = [] } = useBranches();
  const createStaff = useCreateStaffUser();
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const [hadPin, setHadPin] = useState(false);

  const form = useForm<AddStaffForm>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: { name: "", role: "staff", branchIds: [] as number[], pin: "" },
  });

  async function onSubmit(values: AddStaffForm) {
    try {
      const pin = values.pin && values.pin.length >= 4 ? values.pin : undefined;
      await createStaff.mutateAsync({ name: values.name, role: values.role, branchIds: values.branchIds, pin });
      setHadPin(!!pin);
      setDone(true);
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to add staff member", variant: "destructive" });
    }
  }

  function handleClose() {
    setDone(false);
    setHadPin(false);
    form.reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Add Staff Member
          </DialogTitle>
          <DialogDescription>
            Staff sign in with a PIN on the shared device — no app account needed.
          </DialogDescription>
        </DialogHeader>

        {!done ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input data-testid="input-staff-name" placeholder="e.g. Maria Cruz" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-staff-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="staff">Employee — clock in/out only</SelectItem>
                      <SelectItem value="cashier">Cashier — POS access</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="pin" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Clock-in PIN
                    <span className="text-muted-foreground font-normal ml-1">(optional — can set later)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-staff-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="4–6 digits"
                      {...field}
                      onChange={e => field.onChange(e.target.value.replace(/\D/g, ""))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="branchIds" render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign to Branch</FormLabel>
                  {branches.length === 0 ? (
                    <p className="text-xs text-muted-foreground bg-secondary/40 rounded-xl px-3 py-2 border border-border/40">
                      No branches yet — create a branch first before adding staff.
                    </p>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-border/40 p-3 bg-secondary/30">
                      {branches.map(branch => (
                        <div key={branch.id} className="flex items-center gap-2.5">
                          <Checkbox
                            id={`add-branch-${branch.id}`}
                            checked={field.value.includes(branch.id)}
                            onCheckedChange={(checked) => {
                              if (checked) field.onChange([...field.value, branch.id]);
                              else field.onChange(field.value.filter((id: number) => id !== branch.id));
                            }}
                          />
                          <label htmlFor={`add-branch-${branch.id}`} className="text-sm cursor-pointer select-none flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            {branch.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button data-testid="button-create-staff" type="submit" disabled={createStaff.isPending}>
                  {createStaff.isPending ? "Adding…" : "Add Staff Member"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {form.getValues("name")} added!
                </p>
              </div>
              <div className="space-y-2 mt-1">
                {hadPin ? (
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Their PIN is set — they're ready to clock in.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    No PIN set yet — tap the <span className="font-semibold">PIN</span> button on their card to set one before their first shift.
                  </p>
                )}
                <div className="mt-2 rounded-lg bg-emerald-100/60 dark:bg-emerald-900/30 border border-emerald-200/60 dark:border-emerald-800/40 px-3 py-2">
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide mb-0.5">How they clock in</p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Open <span className="font-mono font-semibold">artixpos.com/staff-clock-in</span> on your store device, pick their name, and enter their PIN. Shift starts automatically.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-done-add-staff">Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ROLE_ICONS: Record<string, any> = {
  owner: ShieldCheck,
  manager: User2,
  admin: User2,
  cashier: CreditCard,
  staff: Clock,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  manager: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  admin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  cashier: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  staff: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  admin: "Admin",
  cashier: "Cashier",
  staff: "Employee",
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
  const { isPro, isBusiness } = useSubscription();
  const { data: tenantUsers = [], isLoading: _isLoading } = useTenantUsers();
  const { data: deletedUsers = [] } = useDeletedUsers(isBusiness);
  const { data: branches = [] } = useBranches();
  const deleteUser = useDeleteUser();
  const updateRole = useUpdateUserRole();
  const revokeAccess = useRevokeAccess();
  const restoreAccess = useRestoreAccess();
  const restoreDeleted = useRestoreDeletedUser();
  const ensureTenant = useEnsureTenant();
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);
  const [branchAssignUser, setBranchAssignUser] = useState<TenantUser | null>(null);
  const [pinManageUser, setPinManageUser] = useState<TenantUser | null>(null);
  const isOwner = currentUser?.role === "owner";
  const { toast } = useToast();

  const staffLimit = isBusiness ? Infinity : isPro ? 15 : FREE_LIMITS.staff;
  const nonOwnerCount = tenantUsers.filter(u => u.role !== "owner").length;
  const atLimit = isFinite(staffLimit) && nonOwnerCount >= staffLimit;

  useEffect(() => {
    if (currentUser && !currentUser.tenantId) {
      ensureTenant.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {isOwner && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {nonOwnerCount}
              {isFinite(staffLimit) ? ` / ${staffLimit}` : ""} staff
            </span>
            {atLimit && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-300/30">
                <Lock className="h-2.5 w-2.5" />
                Limit reached
              </span>
            )}
          </div>
          <button
            data-testid="button-add-staff"
            onClick={() => setAddStaffOpen(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Staff</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      )}

      {tenantUsers.length === 0 ? (

        /* Empty state */
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-purple-500" strokeWidth={1.5} />
          </div>
          <p className="font-semibold text-foreground">No team members yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Add staff by name and PIN — no accounts needed. They clock in at <span className="font-medium text-foreground/70">artixpos.com/staff-clock-in</span>.</p>
          {isOwner && (
            <button
              onClick={() => setAddStaffOpen(true)}
              className="flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <UserPlus className="h-4 w-4" /> Add First Staff Member
            </button>
          )}
        </div>

      ) : (

        /* User list */
        <div className="space-y-3">
          {[...tenantUsers].sort((a, b) => {
            const roleOrder: Record<string, number> = { owner: 0, manager: 1, admin: 2, cashier: 3, staff: 4 };
            return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
          }).map(u => {
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
                        {ROLE_LABELS[u.role] ?? (u.role.charAt(0).toUpperCase() + u.role.slice(1))}
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

                {/* My PIN — owner can set their own PIN for the kiosk */}
                {isSelf && isOwner && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/20">
                    <button
                      data-testid={`button-pin-self-${u.id}`}
                      title="Set your kiosk PIN"
                      onClick={() => setPinManageUser(u)}
                      className="h-8 px-3 flex items-center gap-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-300/30 transition-colors shrink-0"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Set My Kiosk PIN</span>
                    </button>
                    <p className="text-[11px] text-muted-foreground">Lets you unlock the kiosk screen with your PIN</p>
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
                        <SelectItem value="staff">Employee</SelectItem>
                        <SelectItem value="cashier">Cashier</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
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

      <AddStaffDialog open={addStaffOpen} onClose={() => setAddStaffOpen(false)} />

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
          {(() => {
            const target = tenantUsers.find(u => u.id === deletingUserId);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Remove {target?.name ?? "Team Member"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>
                        {target?.name ?? "This person"} will lose access immediately.
                        {isBusiness
                          ? " As a Business subscriber, you can restore them from the Recently Deleted section below for up to 30 days."
                          : " This is permanent and cannot be undone."
                        }
                      </p>
                      {!isBusiness && (
                        <p className="text-xs text-muted-foreground/70">
                          Deleting frees up a staff slot. Upgrade to Business to get a 30-day restore window.
                        </p>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
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
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>
                        {isBanned
                          ? `${target?.name ?? "This person"} will be able to log in and use the system again.`
                          : `${target?.name ?? "This person"} will be blocked from logging in immediately.`
                        }
                      </p>
                      {!isBanned && (
                        <p className="text-xs text-muted-foreground/70">
                          They'll still appear in your team list and count toward your staff limit. Use <strong>Delete</strong> instead if you want to free up a slot permanently.
                        </p>
                      )}
                    </div>
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

      {/* Recently Deleted — Business plan only */}
      {isBusiness && deletedUsers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">Recently Deleted</h3>
            <span className="text-xs text-muted-foreground/60">· restored within 30 days</span>
          </div>
          <div className="space-y-2">
            {deletedUsers.map(u => (
              <div
                key={u.id}
                data-testid={`card-deleted-user-${u.id}`}
                className="glass-card rounded-2xl p-4 opacity-60 border-dashed"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-muted-foreground">
                      {(u.name ?? "?")[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{u.name ?? "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">
                      Deleted {u.deletedAt ? formatDistanceToNow(new Date(u.deletedAt), { addSuffix: true }) : "recently"}
                    </p>
                  </div>
                  <button
                    data-testid={`button-restore-deleted-${u.id}`}
                    onClick={async () => {
                      try {
                        await restoreDeleted.mutateAsync(u.id);
                        toast({ title: "Staff member restored", description: `${u.name ?? "User"} has been restored to your team.` });
                      } catch {
                        toast({ title: "Failed to restore", variant: "destructive" });
                      }
                    }}
                    disabled={restoreDeleted.isPending}
                    className="h-8 px-3 flex items-center gap-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-300/30 transition-colors shrink-0 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
