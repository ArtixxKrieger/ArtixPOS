import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Truck, Phone, Mail, MapPin, Pencil, Trash2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Supplier } from "@shared/schema";

interface SupplierForm {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}
const DEFAULT_FORM: SupplierForm = { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

export default function SuppliersPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(DEFAULT_FORM);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });

  const createMutation = useMutation({
    mutationFn: (data: SupplierForm) => apiRequest("POST", "/api/suppliers", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); toast({ title: "Supplier created" }); closeDialog(); },
    onError: () => toast({ title: "Failed to create supplier", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SupplierForm> }) => apiRequest("PUT", `/api/suppliers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); toast({ title: "Supplier updated" }); closeDialog(); },
    onError: () => toast({ title: "Failed to update supplier", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/suppliers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); toast({ title: "Supplier deleted" }); },
    onError: () => toast({ title: "Failed to delete supplier", variant: "destructive" }),
  });

  function openCreate() { setEditing(null); setForm(DEFAULT_FORM); setDialogOpen(true); }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
    });
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); setEditing(null); setForm(DEFAULT_FORM); }

  function handleSubmit() {
    if (!form.name.trim()) { toast({ title: "Supplier name is required", variant: "destructive" }); return; }
    const data = {
      name: form.name,
      contactPerson: form.contactPerson || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(form);
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (s.contactPerson ?? "").toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (s.phone ?? "").includes(debouncedSearch)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Suppliers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-supplier">
          <Plus className="h-4 w-4 mr-1" /> Add Supplier
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder="Search suppliers..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
        data-testid="input-supplier-search"
      />

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "No suppliers match your search" : "No suppliers yet"}</p>
          {!search && <p className="text-sm mt-1">Add suppliers to manage your purchases</p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(supplier => (
            <div
              key={supplier.id}
              data-testid={`card-supplier-${supplier.id}`}
              className="bg-card border border-border rounded-2xl p-4 space-y-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-base truncate">{supplier.name}</p>
                  {supplier.contactPerson && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <User className="h-3 w-3" />
                      <span>{supplier.contactPerson}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(supplier)} className="text-muted-foreground hover:text-foreground transition-colors p-1" data-testid={`button-edit-supplier-${supplier.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(supplier.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1" data-testid={`button-delete-supplier-${supplier.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {supplier.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{supplier.address}</span>
                  </div>
                )}
              </div>
              {supplier.notes && (
                <p className="text-xs text-muted-foreground italic border-t border-border pt-2">{supplier.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Business Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier Co." data-testid="input-supplier-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="John Smith" data-testid="input-supplier-contact" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555-0000" data-testid="input-supplier-phone" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@supplier.com" data-testid="input-supplier-email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Supply St" data-testid="input-supplier-address" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." rows={2} data-testid="input-supplier-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-supplier">
              {editing ? "Save Changes" : "Create Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
