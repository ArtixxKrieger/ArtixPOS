import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import {
  Building2, Plus, Pencil, Trash2, Phone, MapPin,
  CheckCircle, XCircle, Star, Crown, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, useSetMainBranch, useSeedBranch, fetchBranchSeedTemplate, type Branch, type BranchSeedTemplate } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
  businessType: z.string().min(1, "Business type is required"),
  businessSubType: z.string().optional(),
});
type BranchForm = z.infer<typeof branchSchema>;

const BUSINESS_TYPES: { value: string; label: string }[] = [
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "retail", label: "Retail" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" },
];

const BUSINESS_SUBTYPES: Record<string, { value: string; label: string }[]> = {
  food_beverage: [
    { value: "cafe", label: "Cafe / Coffee Shop" },
    { value: "restaurant", label: "Restaurant" },
    { value: "bakery", label: "Bakery" },
    { value: "bar", label: "Bar / Pub" },
    { value: "food_truck", label: "Food Truck" },
  ],
  retail: [
    { value: "clothing", label: "Clothing / Fashion" },
    { value: "electronics", label: "Electronics" },
    { value: "grocery", label: "Grocery / Supermarket" },
    { value: "bookstore", label: "Bookstore" },
  ],
  services: [
    { value: "salon", label: "Salon / Barbershop" },
    { value: "gym", label: "Gym / Fitness Center" },
    { value: "spa", label: "Spa / Wellness" },
    { value: "clinic", label: "Clinic / Healthcare" },
    { value: "laundry", label: "Laundry / Dry Cleaning" },
    { value: "car_wash", label: "Car Wash / Auto Detailing" },
    { value: "pet_grooming", label: "Pet Grooming" },
    { value: "photography", label: "Photography / Studio" },
    { value: "cleaning", label: "Cleaning Service" },
    { value: "tutoring", label: "Tutoring / Education" },
    { value: "repair", label: "Repair & Maintenance" },
  ],
  other: [],
};

function BranchFormDialog({ open, onClose, branch }: { open: boolean; onClose: () => void; branch?: Branch }) {
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const seedBranch = useSeedBranch();
  const { toast } = useToast();

  // Two-step flow for creation: "form" → "seed" (skip "seed" when editing).
  const [step, setStep] = useState<"form" | "seed">("form");
  const [createdBranch, setCreatedBranch] = useState<Branch | null>(null);
  const [seedTemplate, setSeedTemplate] = useState<BranchSeedTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const form = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      isActive: branch?.isActive ?? true,
      businessType: branch?.businessType ?? "",
      businessSubType: branch?.businessSubType ?? "",
    },
  });

  const isEditing = !!branch;
  const selectedType = form.watch("businessType");
  const subtypeOptions = BUSINESS_SUBTYPES[selectedType] ?? [];

  // Reset internal step state whenever the dialog opens fresh.
  useEffect(() => {
    if (!open) {
      setStep("form");
      setCreatedBranch(null);
      setSeedTemplate(null);
    }
  }, [open]);

  function handleClose() {
    form.reset();
    setStep("form");
    setCreatedBranch(null);
    setSeedTemplate(null);
    onClose();
  }

  async function onSubmit(values: BranchForm) {
    try {
      const payload = {
        name: values.name,
        address: values.address,
        phone: values.phone,
        isActive: values.isActive,
        businessType: values.businessType,
        businessSubType: values.businessSubType ? values.businessSubType : null,
      };
      if (isEditing) {
        await updateBranch.mutateAsync({ id: branch.id, ...payload });
        toast({ title: "Branch updated" });
        handleClose();
        return;
      }

      const newBranch = await createBranch.mutateAsync(payload);
      toast({ title: "Branch created" });
      setCreatedBranch(newBranch);

      // Look up whether we have a starter catalog for this business type.
      setLoadingTemplate(true);
      try {
        const tpl = await fetchBranchSeedTemplate(newBranch.id);
        setSeedTemplate(tpl);
        if (tpl.available) {
          setStep("seed");
        } else {
          handleClose();
        }
      } catch {
        // No template / lookup failed — just close, branch was created fine.
        handleClose();
      } finally {
        setLoadingTemplate(false);
      }
    } catch (err: any) {
      toast({ title: err?.message ?? "Something went wrong", variant: "destructive" });
    }
  }

  async function handleSeed() {
    if (!createdBranch) return;
    try {
      const result = await seedBranch.mutateAsync({ branchId: createdBranch.id });
      toast({
        title: "Starter catalog added",
        description: `Loaded ${result.productsCreated} item${result.productsCreated === 1 ? "" : "s"}${result.tablesCreated ? ` and ${result.tablesCreated} table${result.tablesCreated === 1 ? "" : "s"}` : ""}.`,
      });
      handleClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to seed branch", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === "seed"
              ? "Set up your branch"
              : isEditing ? "Edit Branch" : "Create Branch"}
          </DialogTitle>
        </DialogHeader>

        {step === "seed" && createdBranch && seedTemplate?.available ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 p-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-violet-500/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-foreground" data-testid="text-seed-template-label">
                  {seedTemplate.label}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {seedTemplate.description}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    {seedTemplate.itemCount} items
                  </span>
                  {(seedTemplate.tableCount ?? 0) > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      {seedTemplate.tableCount} tables
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              We can pre-load <span className="font-semibold text-foreground">{createdBranch.name}</span> with a starter catalog so you can start ringing up sales right away. You can always edit or delete anything afterwards.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                data-testid="button-skip-seed"
                disabled={seedBranch.isPending}
              >
                Skip for now
              </Button>
              <Button
                type="button"
                onClick={handleSeed}
                disabled={seedBranch.isPending}
                data-testid="button-confirm-seed"
              >
                {seedBranch.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Add starter catalog</>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
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
            <FormField control={form.control} name="businessType" render={({ field }) => (
              <FormItem>
                <FormLabel>Business Type</FormLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue("businessSubType", "");
                  }}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-branch-business-type">
                      <SelectValue placeholder="What kind of business is this branch?" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} data-testid={`option-business-type-${t.value}`}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Each branch can be a different business — your salon and your cafe can live under one account.
                </p>
                <FormMessage />
              </FormItem>
            )} />
            {subtypeOptions.length > 0 && (
              <FormField control={form.control} name="businessSubType" render={({ field }) => (
                <FormItem>
                  <FormLabel>More specifically</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-branch-business-subtype">
                        <SelectValue placeholder="Choose a sub-category (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subtypeOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value} data-testid={`option-business-subtype-${t.value}`}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
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
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                data-testid="button-save-branch"
                type="submit"
                disabled={createBranch.isPending || updateBranch.isPending || loadingTemplate}
              >
                {createBranch.isPending || loadingTemplate ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {loadingTemplate ? "Loading..." : "Creating..."}</>
                ) : (
                  isEditing ? "Update" : "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        )}
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
  const [showUpgradeCard, setShowUpgradeCard] = useState(false);
  const isOwner = user?.role === "owner";
  const { toast } = useToast();
  const { isPro } = useSubscription();
  const [, setLocation] = useLocation();

  function handleAddBranch() {
    if (!isPro && branches.length >= 1) {
      setShowUpgradeCard(true);
    } else {
      setEditingBranch(undefined);
      setFormOpen(true);
    }
  }

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
            onClick={handleAddBranch}
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
              onClick={handleAddBranch}
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

      {/* Pro upgrade card — shown instead of form when free plan hits branch limit */}
      <Dialog open={showUpgradeCard} onOpenChange={setShowUpgradeCard}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Crown className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Pro Feature</span>
              </div>
              <h2 className="text-lg font-black text-foreground">Multiple Branches</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                The Free plan includes 1 branch. Upgrade to Pro to manage unlimited locations, staff across branches, and get advanced analytics per store.
              </p>
            </div>
            <div className="w-full space-y-2">
              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold shadow-md shadow-orange-500/20 border-0"
                onClick={() => { setShowUpgradeCard(false); setLocation("/billing"); }}
              >
                <Crown className="h-4 w-4 mr-2" /> Upgrade to Pro
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setShowUpgradeCard(false)}>
                Maybe later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
