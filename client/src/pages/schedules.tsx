import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, Pencil, Trash2, Clock, ChevronDown, ChevronUp, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Employee = { id: string; name: string | null; email: string | null; role: string | null };
type Schedule = {
  id: number;
  userId: string;
  branchId: number | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  userName: string | null;
  userEmail: string | null;
};

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = (h ?? 0) >= 12 ? "PM" : "AM";
  const h12 = (h ?? 0) % 12 || 12;
  return (m ?? 0) === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const BLANK_FORM = {
  userId: "",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "17:00",
  effectiveFrom: todayIso(),
  effectiveTo: "",
};

export default function SchedulesPage() {
  const { toast } = useToast();
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });

  const { data: employees = [], isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ["/api/staff-schedules/employees"],
  });

  const { data: schedules = [], isLoading: schedLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/staff-schedules"],
  });

  const byEmployee = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of schedules) {
      if (!map.has(s.userId)) map.set(s.userId, []);
      map.get(s.userId)!.push(s);
    }
    return map;
  }, [schedules]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof BLANK_FORM) => {
      const payload: Record<string, unknown> = {
        ...data,
        dayOfWeek: Number(data.dayOfWeek),
        effectiveTo: data.effectiveTo || null,
        tenantId: "__auto__",
      };
      if (editingId) {
        return (await apiRequest("PUT", `/api/staff-schedules/${editingId}`, payload)).json();
      }
      return (await apiRequest("POST", "/api/staff-schedules", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-schedules"] });
      setShowForm(false);
      setEditingId(null);
      toast({ title: editingId ? "Schedule updated" : "Schedule added" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message ?? "Failed to save schedule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/staff-schedules/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-schedules"] });
      setDeletingId(null);
      toast({ title: "Schedule removed" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message ?? "Failed to delete", variant: "destructive" });
    },
  });

  function openAdd(presetUserId?: string) {
    setEditingId(null);
    setForm({ ...BLANK_FORM, userId: presetUserId ?? "" });
    setShowForm(true);
  }

  function openEdit(s: Schedule) {
    setEditingId(s.id);
    setForm({
      userId: s.userId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveFrom: s.effectiveFrom,
      effectiveTo: s.effectiveTo ?? "",
    });
    setShowForm(true);
  }

  function toggleExpand(uid: string) {
    setExpandedEmployees(prev => {
      const n = new Set(prev);
      n.has(uid) ? n.delete(uid) : n.add(uid);
      return n;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.userId) return toast({ title: "Select an employee", variant: "destructive" });
    if (form.startTime >= form.endTime) return toast({ title: "End time must be after start time", variant: "destructive" });
    createMutation.mutate(form);
  }

  const isLoading = empLoading || schedLoading;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Shift Schedules
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set recurring weekly shifts per employee. The time clock flags late arrivals and early departures automatically.
          </p>
        </div>
        <Button onClick={() => openAdd()} size="sm" className="shrink-0 gap-1" data-testid="button-add-schedule">
          <Plus className="h-4 w-4" /> Add Shift
        </Button>
      </div>

      {/* Empty state */}
      {!isLoading && employees.length === 0 && (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <Users className="h-9 w-9 mx-auto opacity-30" />
          <p className="text-sm">No employees found. Add team members first.</p>
        </div>
      )}

      {/* Employee cards */}
      {!isLoading && employees.length > 0 && (
        <div className="space-y-3">
          {employees.map(emp => {
            const empSchedules = (byEmployee.get(emp.id) ?? []).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
            const isExpanded = expandedEmployees.has(emp.id);
            return (
              <div key={emp.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Employee header row */}
                <button
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
                  onClick={() => toggleExpand(emp.id)}
                  data-testid={`button-expand-emp-${emp.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      {(emp.name || emp.email || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{emp.name ?? emp.email}</p>
                      {emp.name && <p className="text-[11px] text-muted-foreground truncate">{emp.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {empSchedules.length > 0 ? (
                      <div className="flex gap-1">
                        {empSchedules.map(s => (
                          <span key={s.id} className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-md">
                            {DOW_LABELS[s.dayOfWeek]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">No schedule</span>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded shifts */}
                {isExpanded && (
                  <div className="border-t border-border/60">
                    {empSchedules.length === 0 ? (
                      <div className="px-4 py-4 text-center">
                        <p className="text-xs text-muted-foreground mb-2">No shifts assigned yet</p>
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => openAdd(emp.id)}>
                          <Plus className="h-3 w-3" /> Add first shift
                        </Button>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/40">
                        {empSchedules.map(s => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-schedule-${s.id}`}>
                            <div className="w-8 text-center">
                              <span className="text-[11px] font-bold text-primary">{DOW_LABELS[s.dayOfWeek]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                {fmt12(s.startTime)} – {fmt12(s.endTime)}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                From {s.effectiveFrom}{s.effectiveTo ? ` to ${s.effectiveTo}` : " · ongoing"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openEdit(s)}
                                data-testid={`button-edit-schedule-${s.id}`}
                                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingId(s.id)}
                                data-testid={`button-delete-schedule-${s.id}`}
                                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="px-4 py-2.5">
                          <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 text-muted-foreground" onClick={() => openAdd(emp.id)}>
                            <Plus className="h-3 w-3" /> Add another day
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Edit Shift" : "Add Shift"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Employee</Label>
              <Select value={form.userId} onValueChange={v => setForm(f => ({ ...f, userId: v }))} disabled={!!editingId}>
                <SelectTrigger className="rounded-xl text-sm" data-testid="select-employee">
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name ?? e.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Day of Week</Label>
              <Select value={String(form.dayOfWeek)} onValueChange={v => setForm(f => ({ ...f, dayOfWeek: Number(v) }))}>
                <SelectTrigger className="rounded-xl text-sm" data-testid="select-day-of-week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOW_FULL.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Start Time</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  className="rounded-xl text-sm"
                  data-testid="input-start-time"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">End Time</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className="rounded-xl text-sm"
                  data-testid="input-end-time"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Effective From</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  className="rounded-xl text-sm"
                  data-testid="input-effective-from"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Effective To <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  type="date"
                  value={form.effectiveTo}
                  onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))}
                  className="rounded-xl text-sm"
                  data-testid="input-effective-to"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full rounded-xl"
              disabled={createMutation.isPending}
              data-testid="button-submit-schedule"
            >
              {createMutation.isPending ? "Saving…" : editingId ? "Save Changes" : "Add Shift"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deletingId} onOpenChange={open => { if (!open) setDeletingId(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Remove shift?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This recurring shift will be removed. Existing time logs are unaffected.</p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteMutation.isPending}
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              data-testid="button-confirm-delete-schedule"
            >
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
