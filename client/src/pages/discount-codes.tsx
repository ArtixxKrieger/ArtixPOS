import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { insertDiscountCodeSchema, type DiscountCode } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Tag, Plus, Trash2, Edit, Copy, ToggleLeft, ToggleRight, Percent, DollarSign } from "lucide-react";

const formSchema = insertDiscountCodeSchema.extend({
  code: z.string().min(1, "Code is required"),
  value: z.coerce.string().min(1, "Value is required"),
  minOrder: z.coerce.string().optional().nullable(),
  maxUses: z.coerce.number().optional().nullable(),
});

function CodeForm({
  initial,
  onSuccess,
  onClose,
}: {
  initial?: Partial<DiscountCode>;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!initial?.id;
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: initial?.code ?? "",
      type: (initial?.type as any) ?? "percentage",
      value: initial?.value ?? "",
      minOrder: initial?.minOrder ?? "",
      maxUses: initial?.maxUses ?? undefined,
      isActive: initial?.isActive ?? true,
      expiresAt: initial?.expiresAt ?? "",
    },
  });
  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) =>
      isEdit
        ? apiRequest("PUT", `/api/discount-codes/${initial!.id}`, data)
        : apiRequest("POST", "/api/discount-codes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-codes"] });
      toast({ title: isEdit ? "Code updated" : "Code created" });
      onSuccess();
    },
    onError: () => toast({ title: "Error saving code" }),
  });

  const typeValue = form.watch("type");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="code" render={({ field }) => (
          <FormItem>
            <FormLabel>Code *</FormLabel>
            <FormControl>
              <Input {...field} placeholder="e.g. SAVE10" className="uppercase font-mono" data-testid="input-discount-code" onChange={e => field.onChange(e.target.value.toUpperCase())} />
            </FormControl>
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="type" render={({ field }) => (
            <FormItem>
              <FormLabel>Type *</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-10 rounded-xl" data-testid="select-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="value" render={({ field }) => (
            <FormItem>
              <FormLabel>Value *</FormLabel>
              <FormControl>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {typeValue === "percentage" ? "%" : "#"}
                  </span>
                  <Input {...field} type="number" step="0.01" className="pl-7" placeholder="10" data-testid="input-discount-value" />
                </div>
              </FormControl>
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="minOrder" render={({ field }) => (
            <FormItem>
              <FormLabel>Min Order</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="number" placeholder="0.00" data-testid="input-discount-min-order" />
              </FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="maxUses" render={({ field }) => (
            <FormItem>
              <FormLabel>Max Uses</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="number" placeholder="Unlimited" data-testid="input-discount-max-uses" onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)} />
              </FormControl>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="expiresAt" render={({ field }) => (
          <FormItem>
            <FormLabel>Expiry Date (optional)</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} type="date" className="h-10 rounded-xl" data-testid="input-discount-expires" />
            </FormControl>
          </FormItem>
        )} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-discount-code">
            {mutation.isPending ? "Saving..." : isEdit ? "Update Code" : "Create Code"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function DiscountCodes() {
  const { data: codes = [], isLoading } = useQuery<DiscountCode[]>({ queryKey: ["/api/discount-codes"] });
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const currency = (settings as any)?.currency || "₱";

  const [showForm, setShowForm] = useState(false);
  const [editCode, setEditCode] = useState<DiscountCode | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/discount-codes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-codes"] });
      toast({ title: "Code deleted" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/discount-codes/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/discount-codes"] }),
  });

  const activeCodes = codes.filter(c => c.isActive);
  const totalUsed = codes.reduce((acc, c) => acc + (c.usedCount ?? 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map(i => <div key={i} className="h-20 skeleton-shimmer rounded-2xl" />)}
        </div>
        <div className="h-64 skeleton-shimmer rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 page-enter">

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-violet-500/8 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Tag className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Codes</p>
          </div>
          <p className="text-2xl font-bold">{activeCodes.length}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-blue-500/8 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Percent className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Used</p>
          </div>
          <p className="text-2xl font-bold">{totalUsed}</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">Discount Codes</h2>
        <Button onClick={() => setShowForm(true)} className="h-9 rounded-xl" data-testid="button-add-discount-code">
          <Plus className="h-4 w-4 mr-1" /> New Code
        </Button>
      </div>

      {/* List */}
      {codes.length === 0 ? (
        <div className="glass-card rounded-2xl py-16 text-center flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <Tag className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <p className="font-semibold">No discount codes</p>
          <p className="text-sm text-muted-foreground/70">Create codes to offer discounts at checkout</p>
          <Button onClick={() => setShowForm(true)} variant="outline" className="mt-2">
            <Plus className="h-4 w-4 mr-1" /> Create Code
          </Button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="divide-y divide-border/40">
            {codes.map(code => {
              const isExpired = code.expiresAt && new Date(code.expiresAt) < new Date();
              const isMaxed = code.maxUses && (code.usedCount ?? 0) >= code.maxUses;
              const status = !code.isActive ? "inactive" : isExpired ? "expired" : isMaxed ? "exhausted" : "active";
              const statusColors = {
                active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                inactive: "bg-secondary text-muted-foreground",
                expired: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                exhausted: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
              };
              return (
                <div key={code.id} data-testid={`discount-code-row-${code.id}`} className={["flex items-center gap-3 px-4 py-4", !code.isActive ? "opacity-60" : ""].join(" ")}>
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                    {code.type === "percentage" ? (
                      <Percent className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <DollarSign className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <code className="font-mono font-bold text-sm">{code.code}</code>
                      <span className={["text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide", statusColors[status]].join(" ")}>
                        {status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {code.type === "percentage" ? `${code.value}% off` : `${currency}${code.value} off`}
                      {code.minOrder && parseFloat(code.minOrder) > 0 ? ` · min ${currency}${code.minOrder}` : ""}
                      {code.maxUses ? ` · ${code.usedCount ?? 0}/${code.maxUses} used` : ` · ${code.usedCount ?? 0} used`}
                      {code.expiresAt ? ` · exp ${format(new Date(code.expiresAt), "MMM d")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { navigator.clipboard.writeText(code.code); toast({ title: "Code copied!" }); }}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors"
                      title="Copy code"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: code.id, isActive: !code.isActive })}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-primary transition-colors"
                      title={code.isActive ? "Deactivate" : "Activate"}
                    >
                      {code.isActive
                        ? <ToggleRight className="h-4 w-4 text-primary" />
                        : <ToggleLeft className="h-4 w-4" />
                      }
                    </button>
                    <button
                      onClick={() => setEditCode(code)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(code.id)}
                      disabled={deleteMutation.isPending}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={showForm || !!editCode} onOpenChange={open => { if (!open) { setShowForm(false); setEditCode(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editCode ? "Edit Code" : "Create Discount Code"}</DialogTitle></DialogHeader>
          <CodeForm
            initial={editCode ?? undefined}
            onSuccess={() => { setShowForm(false); setEditCode(null); }}
            onClose={() => { setShowForm(false); setEditCode(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
