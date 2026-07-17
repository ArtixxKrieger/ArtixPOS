import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, Plus, Pencil, Trash2, Clock, ChevronDown, ChevronUp,
  Users, LayoutGrid, List, Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
  return (m ?? 0) === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
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

// ─── avatar initials ────────────────────────────────────────────────
function Avatar({ name, email, size = "md" }: { name: string | null; email: string | null; size?: "sm" | "md" }) {
  const letter = (name || email || "?")[0].toUpperCase();
  return (
    <div className={cn(
      "rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0",
      size === "sm" ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-sm",
    )}>
      {letter}
    </div>
  );
}

// ─── Week grid ───────────────────────────────────────────────────────
function WeekGrid({
  employees,
  byEmployee,
  onAdd,
  onEdit,
}: {
  employees: Employee[];
  byEmployee: Map<string, Schedule[]>;
  onAdd: (userId: string, dow: number) => void;
  onEdit: (s: Schedule) => void;
}) {
  // coverage = how many employees are scheduled each day
  const coverage = useMemo(() => {
    const counts = Array(7).fill(0);
    for (const [, scheds] of byEmployee) {
      const days = new Set(scheds.map(s => s.dayOfWeek));
      days.forEach(d => counts[d]++);
    }
    return counts;
  }, [byEmployee]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border/60">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-40 whitespace-nowrap">
              Employee
            </th>
            {DOW_LABELS.map((d, i) => (
              <th key={d} className={cn(
                "text-center px-2 py-2.5 text-xs font-semibold min-w-[88px]",
                i === 0 || i === 6 ? "text-muted-foreground/60" : "text-muted-foreground",
              )}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, empIdx) => {
            const empScheds = byEmployee.get(emp.id) ?? [];
            return (
              <tr
                key={emp.id}
                className={cn("border-b border-border/30", empIdx % 2 === 1 && "bg-secondary/20")}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={emp.name} email={emp.email} size="sm" />
                    <span className="text-xs font-medium truncate max-w-[100px]">{emp.name ?? emp.email}</span>
                  </div>
                </td>
                {[0, 1, 2, 3, 4, 5, 6].map(dow => {
                  const dayShifts = empScheds.filter(s => s.dayOfWeek === dow);
                  return (
                    <td key={dow} className="px-1 py-1.5 align-top">
                      <div className="flex flex-col gap-0.5">
                        {dayShifts.map(s => (
                          <button
                            key={s.id}
                            onClick={() => onEdit(s)}
                            className="w-full text-[10px] leading-tight bg-primary/12 text-primary rounded-md px-1.5 py-1 hover:bg-primary/20 transition-colors font-semibold text-center"
                            title={`${fmt12(s.startTime)}–${fmt12(s.endTime)}\nClick to edit`}
                          >
                            {fmt12(s.startTime)}
                            <span className="text-primary/60 mx-0.5">–</span>
                            {fmt12(s.endTime)}
                          </button>
                        ))}
                        <button
                          onClick={() => onAdd(emp.id, dow)}
                          className="w-full text-[11px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-md py-0.5 transition-colors"
                          title={`Add shift on ${DOW_FULL[dow]} for ${emp.name ?? emp.email}`}
                        >
                          +
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {/* Coverage footer */}
        <tfoot>
          <tr className="border-t border-border/60 bg-secondary/30">
            <td className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Coverage
            </td>
            {coverage.map((n, dow) => (
              <td key={dow} className="text-center py-2">
                {n > 0 ? (
                  <span className={cn(
                    "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold",
                    n >= 3 ? "bg-emerald-500/15 text-emerald-600" :
                    n >= 1 ? "bg-primary/10 text-primary" :
                    "text-muted-foreground/40",
                  )}>
                    {n}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/25">—</span>
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── List view (original accordion) ─────────────────────────────────
function ListView({
  employees,
  byEmployee,
  expandedEmployees,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}: {
  employees: Employee[];
  byEmployee: Map<string, Schedule[]>;
  expandedEmployees: Set<string>;
  onToggle: (id: string) => void;
  onAdd: (userId: string, dow?: number) => void;
  onEdit: (s: Schedule) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-3">
      {employees.map(emp => {
        const empSchedules = (byEmployee.get(emp.id) ?? []).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
        const isExpanded = expandedEmployees.has(emp.id);
        return (
          <div key={emp.id} className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
              onClick={() => onToggle(emp.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={emp.name} email={emp.email} />
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{emp.name ?? emp.email}</p>
                  {emp.name && <p className="text-[11px] text-muted-foreground truncate">{emp.email}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {empSchedules.length > 0 ? (
                  <div className="flex gap-1">
                    {empSchedules.map(s => (
                      <Badge key={s.id} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-0">
                        {DOW_LABELS[s.dayOfWeek]}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground italic">No schedule</span>
                )}
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border/60">
                {empSchedules.length === 0 ? (
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2">No shifts assigned yet</p>
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => onAdd(emp.id)}>
                      <Plus className="h-3 w-3" /> Add first shift
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {empSchedules.map(s => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
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
                            onClick={() => onEdit(s)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(s.id)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-2.5">
                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 text-muted-foreground" onClick={() => onAdd(emp.id)}>
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
  );
}

// ─── Main page ───────────────────────────────────────────────────────
export default function SchedulesPage() {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "grid">("grid");
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

  const totalShifts = schedules.length;
  const staffWithSchedule = useMemo(() => new Set(schedules.map(s => s.userId)).size, [schedules]);

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

  function openAdd(presetUserId?: string, presetDow?: number) {
    setEditingId(null);
    setForm({
      ...BLANK_FORM,
      userId: presetUserId ?? "",
      dayOfWeek: presetDow ?? 1,
    });
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
      if (n.has(uid)) { n.delete(uid); } else { n.add(uid); }
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
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Shift Schedules
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Recurring weekly shifts per employee. The time clock flags late arrivals and early departures automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-xl p-0.5">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                view === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <Button onClick={() => openAdd()} size="sm" className="gap-1" data-testid="button-add-schedule">
            <Plus className="h-4 w-4" /> Add Shift
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      {!isLoading && employees.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1 text-xs">
            <Users className="h-3 w-3" /> {employees.length} employees
          </Badge>
          <Badge variant="secondary" className="gap-1 text-xs">
            <CalendarDays className="h-3 w-3" /> {totalShifts} shifts
          </Badge>
          {staffWithSchedule < employees.length && (
            <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-400/40 bg-amber-500/8">
              {employees.length - staffWithSchedule} unscheduled
            </Badge>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && employees.length === 0 && (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <Users className="h-9 w-9 mx-auto opacity-30" />
          <p className="text-sm">No active employees found. Add team members first.</p>
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

      {/* Views */}
      {!isLoading && employees.length > 0 && (
        view === "grid" ? (
          <WeekGrid
            employees={employees}
            byEmployee={byEmployee}
            onAdd={openAdd}
            onEdit={openEdit}
          />
        ) : (
          <ListView
            employees={employees}
            byEmployee={byEmployee}
            expandedEmployees={expandedEmployees}
            onToggle={toggleExpand}
            onAdd={(uid, dow) => openAdd(uid, dow)}
            onEdit={openEdit}
            onDelete={setDeletingId}
          />
        )
      )}

      {/* Add / Edit dialog */}
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

            <div className="rounded-xl bg-secondary/50 border border-border/50 p-3 space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Effective Period
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">From</Label>
                  <Input
                    type="date"
                    value={form.effectiveFrom}
                    onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                    className="rounded-xl text-sm bg-background"
                    data-testid="input-effective-from"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    To <span className="font-normal text-muted-foreground">(opt.)</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.effectiveTo}
                    onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))}
                    className="rounded-xl text-sm bg-background"
                    data-testid="input-effective-to"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Leave "To" blank for an ongoing recurring shift.
              </p>
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

      {/* Delete confirm dialog */}
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
