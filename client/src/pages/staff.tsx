import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { insertServiceStaffSchema, type ServiceStaff } from "@shared/schema";
import {
  Users, Plus, Phone, Mail, Edit, Trash2, Search, Palette,
  CheckCircle2, XCircle, User
} from "lucide-react";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#06b6d4",
];

const formSchema = insertServiceStaffSchema.extend({
  name: z.string().min(1, "Name is required"),
});

function StaffForm({ initial, onClose }: { initial?: ServiceStaff; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!initial?.id;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initial?.name ?? "",
      specialty: initial?.specialty ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      color: initial?.color ?? "#6366f1",
      notes: initial?.notes ?? "",
      isActive: initial?.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (isEdit) {
        await apiRequest("PUT", `/api/service-staff/${initial!.id}`, data);
      } else {
        await apiRequest("POST", "/api/service-staff", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-staff"] });
      toast({ title: isEdit ? "Staff updated" : "Staff added" });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to save staff member", variant: "destructive" }),
  });

  const selectedColor = form.watch("color");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Full Name</FormLabel>
            <FormControl><Input data-testid="input-staff-name" placeholder="e.g. Maria Santos" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="specialty" render={({ field }) => (
          <FormItem>
            <FormLabel>Specialty / Role</FormLabel>
            <FormControl><Input data-testid="input-staff-specialty" placeholder="e.g. Hair Stylist, Personal Trainer" {...field} value={field.value ?? ""} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl><Input data-testid="input-staff-phone" placeholder="+63 9XX XXX XXXX" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input data-testid="input-staff-email" type="email" placeholder="staff@email.com" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="color" render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2"><Palette className="h-3.5 w-3.5" /> Calendar Color</FormLabel>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => field.onChange(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: selectedColor === c ? "#000" : "transparent" }}
                  data-testid={`color-option-${c}`}
                />
              ))}
            </div>
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea data-testid="input-staff-notes" placeholder="Any additional notes..." rows={2} {...field} value={field.value ?? ""} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-staff">
            {mutation.isPending ? "Saving…" : isEdit ? "Update" : "Add Staff"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function StaffCard({ staff, onEdit, onDelete }: { staff: ServiceStaff; onEdit: () => void; onDelete: () => void }) {
  return (
    <div data-testid={`card-staff-${staff.id}`} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md" style={{ backgroundColor: staff.color ?? "#6366f1" }}>
        {staff.name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-foreground" data-testid={`text-staff-name-${staff.id}`}>{staff.name}</p>
          <Badge variant={staff.isActive ? "default" : "secondary"} className="text-[10px]">
            {staff.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        {staff.specialty && (
          <p className="text-sm text-muted-foreground mt-0.5">{staff.specialty}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          {staff.phone && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" />{staff.phone}
            </span>
          )}
          {staff.email && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />{staff.email}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} data-testid={`button-edit-staff-${staff.id}`}><Edit className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} data-testid={`button-delete-staff-${staff.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceStaff | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<ServiceStaff | undefined>();

  const { data: staffList = [], isLoading } = useQuery<ServiceStaff[]>({ queryKey: ["/api/service-staff"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/service-staff/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-staff"] });
      toast({ title: "Staff member removed" });
      setConfirmDelete(undefined);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/service-staff/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/service-staff"] }),
  });

  const filtered = staffList.filter((s) =>
    s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (s.specialty ?? "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const active = filtered.filter((s) => s.isActive);
  const inactive = filtered.filter((s) => !s.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{staffList.length} team members</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }} data-testid="button-add-staff">
          <Plus className="h-4 w-4 mr-1.5" /> Add Staff
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search-staff"
          className="pl-9"
          placeholder="Search by name or specialty…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-muted/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground">No staff yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your first team member to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active ({active.length})</h2>
              </div>
              {active.map((s) => (
                <StaffCard
                  key={s.id}
                  staff={s}
                  onEdit={() => { setEditing(s); setDialogOpen(true); }}
                  onDelete={() => setConfirmDelete(s)}
                />
              ))}
            </div>
          )}
          {inactive.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Inactive ({inactive.length})</h2>
              </div>
              {inactive.map((s) => (
                <StaffCard
                  key={s.id}
                  staff={s}
                  onEdit={() => { setEditing(s); setDialogOpen(true); }}
                  onDelete={() => setConfirmDelete(s)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setEditing(undefined); } setDialogOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {editing ? "Edit Staff Member" : "Add Staff Member"}
            </DialogTitle>
          </DialogHeader>
          <StaffForm initial={editing} onClose={() => { setEditing(undefined); setDialogOpen(false); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Staff Member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to remove <strong>{confirmDelete?.name}</strong>? This cannot be undone.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(undefined)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(confirmDelete!.id)} data-testid="button-confirm-delete-staff">
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
