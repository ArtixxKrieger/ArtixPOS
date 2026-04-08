import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { insertCustomerSchema, type Customer } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Search, Phone, Mail, Trash2, Edit, ShoppingBag, X, Star
} from "lucide-react";

function useCustomers() {
  return useQuery<Customer[]>({ queryKey: ["/api/customers"] });
}

const formSchema = insertCustomerSchema.extend({
  name: z.string().min(1, "Name is required"),
});

function CustomerForm({
  initial,
  onSuccess,
  onClose,
}: {
  initial?: Partial<Customer>;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!initial?.id;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initial?.name ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (isEdit) {
        await apiRequest("PUT", `/api/customers/${initial!.id}`, data);
      } else {
        await apiRequest("POST", "/api/customers", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: isEdit ? "Customer updated" : "Customer added" });
      onSuccess();
    },
    onError: () => toast({ title: "Error saving customer" }),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name *</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Customer name" data-testid="input-customer-name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="+1 234 567 8900" data-testid="input-customer-phone" />
              </FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="email" placeholder="email@example.com" data-testid="input-customer-email" />
              </FormControl>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} placeholder="Any notes about this customer..." rows={2} data-testid="input-customer-notes" />
            </FormControl>
          </FormItem>
        )} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-customer">
            {mutation.isPending ? "Saving..." : isEdit ? "Update" : "Add Customer"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function CustomerDetailPanel({ customer, onClose, currency }: { customer: Customer; onClose: () => void; currency: string }) {
  const { data: sales = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", customer.id, "sales"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customer.id}/sales`, { credentials: "include" });
      return res.json();
    },
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-2xl font-black text-primary">{customer.name[0].toUpperCase()}</span>
        </div>
        <div>
          <h3 className="font-bold text-lg">{customer.name}</h3>
          {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
          {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-emerald-500/8 to-transparent">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Spent</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(customer.totalSpent ?? "0", currency)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-primary/8 to-transparent">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Visits</p>
          <p className="text-xl font-bold text-primary tabular-nums">{customer.visitCount ?? 0}</p>
        </div>
      </div>

      {customer.notes && (
        <div className="glass-card rounded-xl p-3 bg-amber-500/5 border border-amber-500/10">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Notes</p>
          <p className="text-sm text-muted-foreground">{customer.notes}</p>
        </div>
      )}

      {/* Purchase history */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Purchase History</p>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 text-center py-4">No purchases yet</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
            {[...sales].reverse().map(s => (
              <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 text-sm">
                <div>
                  <p className="font-medium">{format(new Date(s.createdAt), "MMM d, yyyy")}</p>
                  <p className="text-xs text-muted-foreground">{(s.items as any[]).length} item(s)</p>
                </div>
                <p className="font-bold text-primary tabular-nums">{formatCurrency(s.total, currency)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Customers() {
  const { data: customers = [], isLoading } = useCustomers();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const currency = (settings as any)?.currency || "₱";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/customers/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/customers"] });
      const previous = queryClient.getQueryData<Customer[]>(["/api/customers"]);
      queryClient.setQueryData<Customer[]>(["/api/customers"], (old = []) => old.filter(c => c.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/customers"], ctx.previous);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer deleted" });
      setDetailCustomer(null);
    },
  });

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (c.phone || "").includes(debouncedSearch) ||
    (c.email || "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((acc, c) => acc + parseNumeric(c.totalSpent), 0);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="h-24 skeleton-shimmer rounded-2xl" />
        <div className="h-12 skeleton-shimmer rounded-2xl" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 skeleton-shimmer rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 page-enter">

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-primary/8 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Customers</p>
          </div>
          <p className="text-2xl font-bold">{totalCustomers}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-emerald-500/8 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Star className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(totalRevenue, currency)}
          </p>
        </div>
      </div>

      {/* Search & Add */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10 rounded-xl border-border bg-background"
            data-testid="input-search-customers"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button onClick={() => setShowForm(true)} className="h-10 rounded-xl" data-testid="button-add-customer">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {/* Customer List */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl py-20 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <Users className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="font-semibold">{search ? "No customers found" : "No customers yet"}</p>
          <p className="text-sm text-muted-foreground/70">
            {search ? "Try a different search" : "Add your first customer to get started"}
          </p>
          {!search && (
            <Button onClick={() => setShowForm(true)} variant="outline" className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> Add Customer
            </Button>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="divide-y divide-border/40">
            {filtered.map(customer => (
              <button
                key={customer.id}
                data-testid={`customer-row-${customer.id}`}
                onClick={() => setDetailCustomer(customer)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="font-bold text-sm text-primary">{customer.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{customer.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {customer.phone && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />{customer.phone}
                      </span>
                    )}
                    {customer.email && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3" />{customer.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary tabular-nums">{formatCurrency(customer.totalSpent ?? "0", currency)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    <ShoppingBag className="h-2.5 w-2.5 inline mr-0.5" />{customer.visitCount ?? 0} visits
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm || !!editCustomer} onOpenChange={open => {
        if (!open) { setShowForm(false); setEditCustomer(null); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <CustomerForm
            initial={editCustomer ?? undefined}
            onSuccess={() => { setShowForm(false); setEditCustomer(null); }}
            onClose={() => { setShowForm(false); setEditCustomer(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Customer Detail Dialog */}
      <Dialog open={!!detailCustomer} onOpenChange={open => { if (!open) setDetailCustomer(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Customer Details</DialogTitle>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => { setEditCustomer(detailCustomer); setDetailCustomer(null); }}
                  data-testid="button-edit-customer"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive/70 hover:text-destructive"
                  onClick={() => detailCustomer && deleteMutation.mutate(detailCustomer.id)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-customer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          {detailCustomer && (
            <CustomerDetailPanel customer={detailCustomer} onClose={() => setDetailCustomer(null)} currency={currency} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
