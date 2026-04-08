import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Users, Plus, Trash2, ShieldCheck, User2, CreditCard,
  Building2, Link2, Copy, Check, Clock, RefreshCw, Send,
  ShieldOff, ShieldAlert, Wifi, WifiOff,
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
  useCreateInvite, useEnsureTenant, useRevokeAccess, useRestoreAccess,
  type TenantUser, type InviteResult,
} from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const inviteSchema = z.object({
  role: z.enum(["manager", "admin", "cashier"]),
  branchIds: z.array(z.number()).default([]),
});
type InviteForm = z.infer<typeof inviteSchema>;

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

function InviteLinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: branches = [] } = useBranches();
  const createInvite = useCreateInvite();
  const { toast } = useToast();
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "cashier", branchIds: [] },
  });

  async function onSubmit(values: InviteForm) {
    try {
      const data = await createInvite.mutateAsync({ role: values.role, branchIds: values.branchIds });
      setResult(data);
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to create invite", variant: "destructive" });
    }
  }

  function copyLink() {
    if (!result) return;
    navigator.clipboard.writeText(result.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: "Link copied to clipboard" });
    });
  }

  function handleClose() {
    setResult(null);
    setCopied(false);
    form.reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Invite Staff Member
          </DialogTitle>
          <DialogDescription>
            Generate a one-time invite link. Share it with your staff — when they sign in, they'll automatically join your team.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-invite-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {branches.length > 0 && (
                <FormField control={form.control} name="branchIds" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign to Branches <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <div className="space-y-2 rounded-xl border border-border/40 p-3 bg-secondary/30">
                      {branches.map(branch => (
                        <div key={branch.id} className="flex items-center gap-2.5">
                          <Checkbox
                            id={`branch-${branch.id}`}
                            checked={field.value.includes(branch.id)}
                            onCheckedChange={(checked) => {
                              if (checked) field.onChange([...field.value, branch.id]);
                              else field.onChange(field.value.filter((id: number) => id !== branch.id));
                            }}
                            className="shrink-0"
                          />
                          <label htmlFor={`branch-${branch.id}`} className="text-sm cursor-pointer select-none flex items-center gap-1.5 min-w-0">
                            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{branch.name}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button data-testid="button-generate-invite" type="submit" disabled={createInvite.isPending}>
                  {createInvite.isPending
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
                    : <><Link2 className="h-4 w-4 mr-2" /> Generate Link</>
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-primary">Invite link ready!</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={result.link}
                  className="text-xs h-9 bg-background border-border/60 font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-9 w-9 p-0"
                  onClick={copyLink}
                  data-testid="button-copy-invite-link"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                Expires {formatDistanceToNow(new Date(result.expiresAt), { addSuffix: true })} · One-time use only
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Share this link with your staff. When they click it and sign in, they'll automatically join your team.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setResult(null); form.reset(); }}>
                Generate Another
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
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

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { data: tenantUsers = [], isLoading } = useTenantUsers();
  const { data: branches = [] } = useBranches();
  const deleteUser = useDeleteUser();
  const updateRole = useUpdateUserRole();
  const revokeAccess = useRevokeAccess();
  const restoreAccess = useRestoreAccess();
  const ensureTenant = useEnsureTenant();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);
  const [branchAssignUser, setBranchAssignUser] = useState<TenantUser | null>(null);
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
        {isOwner && (
          <button
            data-testid="button-invite-staff"
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Invite Staff</span>
            <span className="sm:hidden">Invite</span>
          </button>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 skeleton-shimmer rounded-2xl" />)}
        </div>
      ) : tenantUsers.length === 0 ? (

        /* Empty state */
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-purple-500" strokeWidth={1.5} />
          </div>
          <p className="font-semibold text-foreground">No team members yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Invite staff via a link — they sign in with their own Google or Facebook account</p>
          {isOwner && (
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <Send className="h-4 w-4" /> Send Invite Link
            </button>
          )}
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

      <InviteLinkDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {branchAssignUser && (
        <BranchAssignDialog
          user={branchAssignUser}
          open={!!branchAssignUser}
          onClose={() => setBranchAssignUser(null)}
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
