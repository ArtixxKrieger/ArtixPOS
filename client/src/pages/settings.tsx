import { useEffect, useState } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type InsertUserSetting } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Save, LogOut, Trash2, CreditCard, Plus, X, Banknote, ChevronRight, Ticket, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  food_beverage: "Food & Beverage",
  retail: "Retail",
  services: "Services",
  other: "Other",
};

const SUBTYPE_LABELS: Record<string, string> = {
  cafe: "Cafe / Coffee Shop", restaurant: "Restaurant", bakery: "Bakery",
  bar: "Bar / Pub", food_truck: "Food Truck", clothing: "Clothing / Fashion",
  electronics: "Electronics", grocery: "Grocery / Supermarket", bookstore: "Bookstore",
  salon: "Salon / Barbershop", gym: "Gym / Fitness Center", spa: "Spa / Wellness",
  clinic: "Clinic / Healthcare", laundry: "Laundry / Dry Cleaning", car_wash: "Car Wash / Auto Detailing",
  pet_grooming: "Pet Grooming", photography: "Photography / Studio", cleaning: "Cleaning Service",
  tutoring: "Tutoring / Education", repair: "Repair & Maintenance", other: "Other",
};

const settingsSchema = z.object({
  storeName: z.string().min(1, "Store name is required"),
  taxRate: z.string().refine(v => !isNaN(Number(v)) && Number(v) >= 0, { message: "Must be 0 or greater" }),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  emailContact: z.union([z.string().email("Enter a valid email"), z.literal(""), z.undefined()]),
  receiptFooter: z.string().optional().or(z.literal("")),
  loyaltyPointsPerUnit: z.string().refine(v => !isNaN(Number(v)) && Number(v) >= 0, { message: "Must be 0 or greater" }),
  loyaltyRedemptionRate: z.string().refine(v => !isNaN(Number(v)) && Number(v) >= 1, { message: "Must be at least 1" }),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-1 pt-2 pb-1">
      {children}
    </p>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/20 last:border-0">
      <div className="shrink-0 pt-1.5">
        <p className="text-sm font-medium text-foreground leading-none">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1 max-w-[55%]">
        {children}
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showPaymentManager, setShowPaymentManager] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);

  const DEFAULT_METHODS = [
    { id: "cash", label: "Cash", isCash: true },
    { id: "card", label: "Card", isCash: false },
    { id: "gcash", label: "GCash", isCash: false },
    { id: "maya", label: "Maya", isCash: false },
  ];

  type PaymentMethod = { id: string; label: string; isCash: boolean };
  const [pmethods, setPmethods] = useState<PaymentMethod[]>([]);
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodIsCash, setNewMethodIsCash] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);

  const isOwner = user?.role === "owner";

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete account");
      queryClient.clear();
      window.location.href = "/login";
    } catch {
      toast({ title: "Failed to delete account", description: "Please try again.", variant: "destructive" });
      setIsDeleting(false);
    }
  };

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      storeName: "", taxRate: "0", address: "", phone: "",
      emailContact: "", receiptFooter: "", loyaltyPointsPerUnit: "1", loyaltyRedemptionRate: "100",
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        storeName: (settings as any).storeName || "",
        taxRate: (settings as any).taxRate || "0",
        address: (settings as any).address || "",
        phone: (settings as any).phone || "",
        emailContact: (settings as any).emailContact || "",
        receiptFooter: (settings as any).receiptFooter || "",
        loyaltyPointsPerUnit: (settings as any).loyaltyPointsPerUnit?.toString() || "1",
        loyaltyRedemptionRate: (settings as any).loyaltyRedemptionRate?.toString() || "100",
      });
      const saved = (settings as any).paymentMethods;
      setPmethods(saved?.length ? saved : DEFAULT_METHODS);
    }
  }, [settings, form]);

  const savePaymentMethods = async (updated: PaymentMethod[]) => {
    setSavingMethods(true);
    try {
      await updateSettings.mutateAsync({ paymentMethods: updated } as any);
      toast({ title: "Payment methods saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingMethods(false);
    }
  };

  const addPaymentMethod = () => {
    const label = newMethodName.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (pmethods.find(m => m.id === id)) {
      toast({ title: "Method already exists", variant: "destructive" });
      return;
    }
    const updated = [...pmethods, { id, label, isCash: newMethodIsCash }];
    setPmethods(updated);
    savePaymentMethods(updated);
    setNewMethodName("");
    setNewMethodIsCash(false);
  };

  const deletePaymentMethod = (id: string) => {
    if (pmethods.length <= 1) {
      toast({ title: "At least one payment method required", variant: "destructive" });
      return;
    }
    const updated = pmethods.filter(m => m.id !== id);
    setPmethods(updated);
    savePaymentMethods(updated);
  };

  const togglePaymentCash = (id: string) => {
    const updated = pmethods.map(m => m.id === id ? { ...m, isCash: !m.isCash } : m);
    setPmethods(updated);
    savePaymentMethods(updated);
  };

  const onSubmit = (data: SettingsFormData) => {
    const payload: Partial<InsertUserSetting> = {
      storeName: data.storeName,
      taxRate: data.taxRate,
      address: data.address,
      phone: data.phone,
      emailContact: data.emailContact,
      receiptFooter: data.receiptFooter,
      loyaltyPointsPerUnit: data.loyaltyPointsPerUnit,
      loyaltyRedemptionRate: data.loyaltyRedemptionRate,
    };
    updateSettings.mutate(payload, {
      onSuccess: () => toast({ title: "Settings saved" })
    });
  };

  const redeemVoucher = async () => {
    const code = voucherCode.trim();
    if (!code) return;
    setRedeemingVoucher(true);
    try {
      const res = await apiRequest("POST", "/api/subscription/redeem-voucher", { code });
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription/payments"] });
      setVoucherCode("");
      toast({
        title: "Voucher applied",
        description: data.periodEnd ? `Pro is active until ${new Date(data.periodEnd).toLocaleDateString()}.` : "Your Pro access has been activated.",
      });
    } catch (err: any) {
      toast({
        title: "Voucher not applied",
        description: err?.message || "Please check the code and try again.",
        variant: "destructive",
      });
    } finally {
      setRedeemingVoucher(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-lg space-y-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const businessSubType = (settings as any)?.businessSubType;
  const businessType = (settings as any)?.businessType;
  const businessLabel = businessSubType && businessSubType !== "other"
    ? SUBTYPE_LABELS[businessSubType] ?? businessSubType
    : BUSINESS_TYPE_LABELS[businessType] ?? businessType;

  return (
    <div className="max-w-lg page-enter space-y-1">

      {/* Owner settings */}
      {isOwner && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>

            {/* Store */}
            <SectionLabel>Store</SectionLabel>
            <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
              <SettingRow label="Store Name">
                <FormField control={form.control} name="storeName" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} value={field.value || ""} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3" placeholder="Store name" data-testid="input-store-name" />
                    </FormControl>
                    <FormMessage className="text-right text-[10px]" />
                  </FormItem>
                )} />
              </SettingRow>

              {businessLabel && (
                <div className="flex items-center justify-between py-2.5 border-b border-border/20">
                  <p className="text-sm font-medium text-foreground">Business Type</p>
                  <p className="text-sm text-muted-foreground truncate max-w-[55%] text-right">{businessLabel}</p>
                </div>
              )}

              <SettingRow label="Tax Rate" hint="Applied at checkout">
                <FormField control={form.control} name="taxRate" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} value={field.value || "0"} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-7" data-testid="input-tax-rate" />
                      </FormControl>
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                    </div>
                    <FormMessage className="text-right text-[10px]" />
                  </FormItem>
                )} />
              </SettingRow>

              <SettingRow label="Receipt Footer" hint="Shown on receipts">
                <FormField control={form.control} name="receiptFooter" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} value={field.value || ""} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3" placeholder="e.g. Thank you!" data-testid="input-receipt-footer" />
                    </FormControl>
                  </FormItem>
                )} />
              </SettingRow>
            </div>

            {/* Loyalty */}
            <SectionLabel>Loyalty Points</SectionLabel>
            <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
              <SettingRow label="Points per 1 unit spent">
                <FormField control={form.control} name="loyaltyPointsPerUnit" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} value={field.value || "1"} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3" data-testid="input-loyalty-points-per-unit" />
                    </FormControl>
                    <FormMessage className="text-right text-[10px]" />
                  </FormItem>
                )} />
              </SettingRow>

              <SettingRow label="Points for 1 unit discount">
                <FormField control={form.control} name="loyaltyRedemptionRate" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="number" step="1" min="1" {...field} value={field.value || "100"} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3" data-testid="input-loyalty-redemption-rate" />
                    </FormControl>
                    <FormMessage className="text-right text-[10px]" />
                  </FormItem>
                )} />
              </SettingRow>
            </div>

            {/* Contact */}
            <SectionLabel>Contact</SectionLabel>
            <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
              <SettingRow label="Address">
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea {...field} value={field.value || ""} className="text-sm rounded-lg bg-secondary/60 border-none resize-none text-right min-h-[56px] py-1.5 pr-3" rows={2} placeholder="Store address" />
                    </FormControl>
                  </FormItem>
                )} />
              </SettingRow>

              <SettingRow label="Phone">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} value={field.value || ""} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3" placeholder="+63 912 345 6789" />
                    </FormControl>
                  </FormItem>
                )} />
              </SettingRow>

              <SettingRow label="Email">
                <FormField control={form.control} name="emailContact" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="email" {...field} value={field.value || ""} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3" placeholder="hello@store.com" />
                    </FormControl>
                    <FormMessage className="text-right text-[10px]" />
                  </FormItem>
                )} />
              </SettingRow>
            </div>

            <Button
              type="submit"
              className="w-full h-10 rounded-xl font-semibold mt-3 bg-primary text-white shadow-md shadow-primary/20 hover:opacity-90 transition-all"
              disabled={updateSettings.isPending}
              data-testid="button-save-settings"
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              {updateSettings.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Form>
      )}

      {/* Payment Methods */}
      {isOwner && (
        <>
          <SectionLabel>Plan Voucher</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-start gap-2.5">
                <Ticket className="h-4 w-4 text-violet-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Voucher Code</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Enter a Pro voucher code when one is available.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={voucherCode}
                  onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && redeemVoucher()}
                  placeholder="ENTER CODE"
                  className="h-9 text-sm rounded-xl bg-secondary/60 border-none uppercase tracking-wider"
                  data-testid="input-voucher-code"
                />
                <Button
                  type="button"
                  onClick={redeemVoucher}
                  disabled={!voucherCode.trim() || redeemingVoucher}
                  className="h-9 rounded-xl px-3"
                  data-testid="button-redeem-voucher"
                >
                  {redeemingVoucher ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                </Button>
              </div>
            </div>
          </div>

          <SectionLabel>Checkout</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowPaymentManager(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
              data-testid="button-open-payment-methods"
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Payment Methods</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{pmethods.length} active</span>
                <ChevronRight className={["h-4 w-4 text-muted-foreground transition-transform duration-200", showPaymentManager ? "rotate-90" : ""].join(" ")} />
              </div>
            </button>

            {showPaymentManager && (
              <div className="border-t border-border/20 px-4 py-3 space-y-2">
                {pmethods.map(m => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium">{m.label}</span>
                    <button
                      data-testid={`toggle-cash-${m.id}`}
                      onClick={() => togglePaymentCash(m.id)}
                      className={[
                        "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors",
                        m.isCash
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-secondary text-muted-foreground",
                      ].join(" ")}
                    >
                      <Banknote className="h-3 w-3" />
                      {m.isCash ? "Cash" : "Digital"}
                    </button>
                    <button
                      data-testid={`button-delete-method-${m.id}`}
                      onClick={() => deletePaymentMethod(m.id)}
                      disabled={savingMethods}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-destructive rounded transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 pt-1 border-t border-border/15">
                  <Input
                    value={newMethodName}
                    onChange={e => setNewMethodName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addPaymentMethod()}
                    placeholder="Add method..."
                    className="h-8 text-sm rounded-lg bg-secondary/60 border-none flex-1"
                    data-testid="input-new-payment-method"
                  />
                  <button
                    data-testid="toggle-new-method-cash"
                    onClick={() => setNewMethodIsCash(v => !v)}
                    className={[
                      "flex items-center gap-1 px-2 rounded-lg text-[10px] font-bold border transition-colors shrink-0",
                      newMethodIsCash
                        ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
                        : "bg-secondary text-muted-foreground border-border/40",
                    ].join(" ")}
                  >
                    <Banknote className="h-3 w-3" />
                    {newMethodIsCash ? "Cash" : "Digital"}
                  </button>
                  <Button
                    onClick={addPaymentMethod}
                    disabled={!newMethodName.trim() || savingMethods}
                    size="sm"
                    className="h-8 px-2.5 rounded-lg"
                    data-testid="button-add-payment-method"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Account */}
      <SectionLabel>Account</SectionLabel>
      <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
        {user && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name ?? ""} className="h-8 w-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{(user.name ?? "?")[0].toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate leading-none">{user.name ?? "User"}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email ?? `via ${user.provider}`}</p>
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded-full">
              {user.role}
            </span>
          </div>
        )}

        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors border-b border-border/20"
        >
          <LogOut className="h-4 w-4 text-muted-foreground" />
          Sign Out
        </button>

        {isOwner && (
          <button
            onClick={() => { setDeleteConfirmText(""); setShowDeleteConfirm(true); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete Account
          </button>
        )}
      </div>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirmText(""); setShowDeleteConfirm(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and <strong>all your data</strong> — products, sales, orders, and settings. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-1">
            <p className="text-sm text-muted-foreground mb-2">
              Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="h-10 rounded-xl font-mono"
              data-testid="input-delete-confirm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmText !== "DELETE"}
              data-testid="button-confirm-delete-account"
            >
              {isDeleting ? "Deleting…" : "Yes, delete everything"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
