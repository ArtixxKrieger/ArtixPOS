import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2, Plus, Pencil, Trash2, Phone, MapPin,
  CheckCircle, XCircle, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, useSetMainBranch, type Branch } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});
type BranchForm = z.infer<typeof branchSchema>;

function BranchFormDialog({ open, onClose, branch }: { open: boolean; onClose: () => void; branch?: Branch }) {
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const { toast } = useToast();

  const form = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      isActive: branch?.isActive ?? true,
    },
  });

  const isEditing = !!branch;

  async function onSubmit(values: BranchForm) {
    try {
      if (isEditing) {
        await updateBranch.mutateAsync({ id: branch.id, ...values });
        toast({ title: "Branch updated" });
      } else {
        await createBranch.mutateAsync(values as { name: string; address?: string; phone?: string; isActive?: boolean });
        toast({ title: "Branch created" });
      }
      form.reset();
      onClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Something went wrong", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Branch" : "Create Branch"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Branch Name</FormLabel>
                <FormControl>
                  <Input data-testid="input-branch-name" placeholder="Main Branch" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input data-testid="input-branch-address" placeholder="123 Main St" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input data-testid="input-branch-phone" placeholder="+1 555 000 0000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex items-center gap-3 rounded-xl bg-secondary/40 border border-border/30 p-3">
                <div className="flex-1">
                  <FormLabel>Active</FormLabel>
                  <p className="text-xs text-muted-foreground">Inactive branches are hidden from staff</p>
                </div>
                <FormControl>
                  <Switch data-testid="switch-branch-active" checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                data-testid="button-save-branch"
                type="submit"
                disabled={createBranch.isPending || updateBranch.isPending}
              >
                {isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Branches() {
  const { user } = useAuth();
  const { data: branches = [], isLoading } = useBranches();
  const deleteBranch = useDeleteBranch();
  const setMainBranch = useSetMainBranch();
  const [formOpen, setFormOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | undefined>();
  const [deletingBranchId, setDeletingBranchId] = useState<number | null>(null);
  const isOwner = user?.role === "owner";
  const { toast } = useToast();

  async function handleDelete() {
    if (!deletingBranchId) return;
    try {
      await deleteBranch.mutateAsync(deletingBranchId);
      toast({ title: "Branch deleted" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to delete branch", variant: "destructive" });
    } finally {
      setDeletingBranchId(null);
    }
  }

  async function handleSetMain(id: number) {
    try {
      await setMainBranch.mutateAsync(id);
      toast({ title: "Main branch updated" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to set main branch", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5 page-enter pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 shrink-0">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black tracking-tight">Branches</h2>
          <p className="text-xs text-muted-foreground font-medium">Manage your store locations</p>
        </div>
        {isOwner && (
          <button
            data-testid="button-create-branch"
            onClick={() => { setEditingBranch(undefined); setFormOpen(true); }}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Branch</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 skeleton-shimmer rounded-2xl" />
          ))}
        </div>
      ) : branches.length === 0 ? (

        /* Empty state */
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
          </div>
          <p className="font-semibold text-foreground">No branches yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Create your first location to start managing your stores</p>
          {isOwner && (
            <button
              onClick={() => { setEditingBranch(undefined); setFormOpen(true); }}
              className="flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" /> Create your first branch
            </button>
          )}
        </div>

      ) : (

        /* Branch cards grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map(branch => (
            <div
              key={branch.id}
              data-testid={`card-branch-${branch.id}`}
              className={cn(
                "glass-card rounded-2xl overflow-hidden flex flex-col",
                branch.isMain && "ring-2 ring-primary/30"
              )}
            >
              {/* Card header */}
              <div className="p-4 flex items-start gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                  branch.isMain ? "bg-primary/10" : "bg-blue-500/10"
                )}>
                  <Building2 className={cn("h-5 w-5", branch.isMain ? "text-primary" : "text-blue-500")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className="font-bold text-sm truncate"
                      data-testid={`text-branch-name-${branch.id}`}
                    >
                      {branch.name}
                    </p>
                    {branch.isMain && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        <Star className="h-2.5 w-2.5 fill-primary" /> Main
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    branch.isActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-secondary text-muted-foreground"
                  )}>
                    {branch.isActive
                      ? <><CheckCircle className="h-2.5 w-2.5" /> Active</>
                      : <><XCircle className="h-2.5 w-2.5" /> Inactive</>
                    }
                  </span>
                </div>
              </div>

              {/* Address & phone */}
              {(branch.address || branch.phone) && (
                <div className="px-4 pb-3 space-y-1.5 border-t border-border/20 pt-3">
                  {branch.address && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="break-words min-w-0">{branch.address}</span>
                    </div>
                  )}
                  {branch.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{branch.phone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              {isOwner && (
                <div className="mt-auto px-4 pb-4 pt-3 flex gap-2 border-t border-border/20">
                  {!branch.isMain && (
                    <button
                      data-testid={`button-set-main-branch-${branch.id}`}
                      onClick={() => handleSetMain(branch.id)}
                      disabled={setMainBranch.isPending}
                      className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors shrink-0"
                    >
                      <Star className="h-3.5 w-3.5" /> Set Main
                    </button>
                  )}
                  <button
                    data-testid={`button-edit-branch-${branch.id}`}
                    onClick={() => { setEditingBranch(branch); setFormOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground text-xs font-semibold transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    data-testid={`button-delete-branch-${branch.id}`}
                    onClick={() => setDeletingBranchId(branch.id)}
                    className="h-8 w-8 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BranchFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        branch={editingBranch}
      />

      <AlertDialog open={!!deletingBranchId} onOpenChange={() => setDeletingBranchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the branch and remove all user assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
