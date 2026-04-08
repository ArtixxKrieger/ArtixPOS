import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, LayoutGrid, Pencil, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Table } from "@shared/schema";

const STATUS_CONFIG = {
  available: { label: "Available", class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  occupied:  { label: "Occupied",  class: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  reserved:  { label: "Reserved",  class: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
} as const;

type TableStatus = keyof typeof STATUS_CONFIG;

interface TableForm { name: string; seats: number; status: TableStatus }
const DEFAULT_FORM: TableForm = { name: "", seats: 4, status: "available" };

export default function TablesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Table | null>(null);
  const [form, setForm] = useState<TableForm>(DEFAULT_FORM);

  const { data: tables = [], isLoading } = useQuery<Table[]>({ queryKey: ["/api/tables"] });

  const createMutation = useMutation({
    mutationFn: (data: TableForm) => apiRequest("POST", "/api/tables", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tables"] }); toast({ title: "Table created" }); closeDialog(); },
    onError: () => toast({ title: "Failed to create table", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TableForm> }) => apiRequest("PUT", `/api/tables/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tables"] }); toast({ title: "Table updated" }); closeDialog(); },
    onError: () => toast({ title: "Failed to update table", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tables/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tables"] }); toast({ title: "Table deleted" }); },
    onError: () => toast({ title: "Failed to delete table", variant: "destructive" }),
  });

  function openCreate() { setEditing(null); setForm(DEFAULT_FORM); setDialogOpen(true); }
  function openEdit(t: Table) { setEditing(t); setForm({ name: t.name, seats: t.seats ?? 4, status: (t.status as TableStatus) ?? "available" }); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditing(null); setForm(DEFAULT_FORM); }

  function handleSubmit() {
    if (!form.name.trim()) { toast({ title: "Table name is required", variant: "destructive" }); return; }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  }

  function quickStatus(table: Table, status: TableStatus) {
    updateMutation.mutate({ id: table.id, data: { status } });
  }

  const counts = { available: 0, occupied: 0, reserved: 0 };
  for (const t of tables) counts[(t.status as TableStatus) ?? "available"]++;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" /> Table Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{tables.length} table{tables.length !== 1 ? "s" : ""} total</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-table">
          <Plus className="h-4 w-4 mr-1" /> Add Table
        </Button>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_CONFIG) as TableStatus[]).map(s => (
          <div key={s} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${STATUS_CONFIG[s].class}`}>
            <span className="capitalize">{STATUS_CONFIG[s].label}</span>
            <span className="font-bold">{counts[s]}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tables yet</p>
          <p className="text-sm mt-1">Add tables to manage dine-in orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {tables.map((table) => {
            const status = (table.status as TableStatus) ?? "available";
            const cfg = STATUS_CONFIG[status];
            return (
              <div
                key={table.id}
                data-testid={`card-table-${table.id}`}
                className="relative bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <p className="font-semibold text-base leading-tight">{table.name}</p>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(table)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5" data-testid={`button-edit-table-${table.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(table.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5" data-testid={`button-delete-table-${table.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>{table.seats ?? 4} seats</span>
                </div>
                <Badge className={`${cfg.class} border text-xs w-fit`}>{cfg.label}</Badge>
                {/* Quick status change */}
                <div className="flex gap-1">
                  {(Object.keys(STATUS_CONFIG) as TableStatus[]).filter(s => s !== status).map(s => (
                    <button
                      key={s}
                      onClick={() => quickStatus(table, s)}
                      className="flex-1 text-[9px] font-medium py-1 px-1 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`button-status-${s}-${table.id}`}
                    >
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Table" : "Add Table"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Table Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Table 1, Booth A"
                data-testid="input-table-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Seats</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.seats}
                onChange={e => setForm(f => ({ ...f, seats: Number(e.target.value) }))}
                data-testid="input-table-seats"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TableStatus }))}>
                <SelectTrigger data-testid="select-table-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-table"
            >
              {editing ? "Save Changes" : "Create Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
