import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Banknote, Clock, TrendingUp, Users, Pencil, Save, Calendar, Wallet } from "lucide-react";

type WageType = "none" | "hourly" | "monthly" | "commission";

type StaffWage = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  wageType: WageType | null;
  wageRate: string | null;
  commissionPercent: string | null;
};

type PayrollEntry = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  wageType: WageType;
  wageRate: number;
  commissionPercent: number;
  hoursWorked: number;
  salesAmount: number;
  payout: number;
  notes: string;
};

type PayrollResponse = {
  from: string;
  to: string;
  entries: PayrollEntry[];
  totals: { totalPayout: number; totalHours: number; totalCommissionable: number; staffCount: number };
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  admin: "Admin",
  cashier: "Cashier",
};

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/40 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${accent || ""}`} />
        <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-xl font-bold tabular-nums ${accent || "text-foreground"}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PayrollPage() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";
  const currency = (settings as any)?.currency || "₱";

  const [from, setFrom] = useState(todayISO(-30));
  const [to, setTo] = useState(todayISO());
  const [editingUser, setEditingUser] = useState<StaffWage | null>(null);
  const [editForm, setEditForm] = useState<{ wageType: WageType; wageRate: string; commissionPercent: string }>({
    wageType: "none",
    wageRate: "0",
    commissionPercent: "0",
  });

  const { data: staff = [], isLoading: staffLoading } = useQuery<StaffWage[]>({
    queryKey: ["/api/payroll/staff"],
  });

  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;

  const { data: payroll, isLoading: payrollLoading } = useQuery<PayrollResponse>({
    queryKey: ["/api/payroll/compute", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/compute?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`, {
        credentials: "include",
        headers: (() => {
          const t = localStorage.getItem("cafebara_native_token");
          return t ? { Authorization: `Bearer ${t}` } : {};
        })(),
      });
      if (!res.ok) throw new Error("Failed to compute payroll");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; data: { wageType: WageType; wageRate: string; commissionPercent: string } }) => {
      const res = await apiRequest("PUT", `/api/payroll/staff/${vars.id}`, vars.data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/compute"] });
      setEditingUser(null);
      toast({ title: "Wage settings updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err?.message, variant: "destructive" });
    },
  });

  const openEdit = (s: StaffWage) => {
    setEditForm({
      wageType: (s.wageType ?? "none") as WageType,
      wageRate: s.wageRate ?? "0",
      commissionPercent: s.commissionPercent ?? "0",
    });
    setEditingUser(s);
  };

  const saveEdit = () => {
    if (!editingUser) return;
    updateMutation.mutate({ id: editingUser.id, data: editForm });
  };

  const entriesByUser = useMemo(() => {
    const map = new Map<string, PayrollEntry>();
    payroll?.entries.forEach((e) => map.set(e.userId, e));
    return map;
  }, [payroll]);

  if (!isOwner) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <p className="text-sm text-muted-foreground">Payroll is available to owners only.</p>
      </div>
    );
  }

  const totals = payroll?.totals ?? { totalPayout: 0, totalHours: 0, totalCommissionable: 0, staffCount: 0 };
  const fmt = (n: number) => `${currency}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-5xl space-y-5 page-enter">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white p-6 md:p-8 shadow-xl">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold leading-tight">Payroll</h1>
            <p className="text-white/80 text-sm mt-1">Track hours, commissions, and total payout for any pay period.</p>
          </div>
        </div>
      </div>

      {/* Date range */}
      <div className="rounded-2xl bg-card border border-border/40 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pay Period</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase font-semibold text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-sm mt-1" data-testid="input-payroll-from" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-semibold text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-sm mt-1" data-testid="input-payroll-to" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Banknote} label="Total Payout" value={fmt(totals.totalPayout)} sub="due this period" accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={Clock} label="Total Hours" value={totals.totalHours.toFixed(1)} sub="across hourly staff" />
        <StatCard icon={TrendingUp} label="Commission Sales" value={fmt(totals.totalCommissionable)} sub="commissionable revenue" />
        <StatCard icon={Users} label="Staff" value={String(totals.staffCount)} sub="on payroll" />
      </div>

      {/* Staff table */}
      <div className="rounded-2xl bg-card border border-border/40 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30">
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Staff Payroll</h2>
        </div>

        {staffLoading || payrollLoading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : staff.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No staff members yet. Add staff in <span className="font-semibold">Admin → Team</span>.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {staff.map((s) => {
              const entry = entriesByUser.get(s.id);
              const wt = (s.wageType ?? "none") as WageType;
              return (
                <div key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30" data-testid={`row-payroll-${s.id}`}>
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {(s.name || s.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{s.name || s.email}</p>
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">
                        {ROLE_LABELS[s.role] ?? s.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {wt === "none" && "No wage configured"}
                      {wt === "hourly" && `Hourly • ${currency}${parseFloat(s.wageRate || "0").toFixed(2)}/hr`}
                      {wt === "monthly" && `Monthly • ${currency}${parseFloat(s.wageRate || "0").toLocaleString()}/mo`}
                      {wt === "commission" && `Commission • ${parseFloat(s.commissionPercent || "0").toFixed(1)}% of sales`}
                    </p>
                    {entry && entry.notes && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic truncate">{entry.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(entry?.payout ?? 0)}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {entry && entry.hoursWorked > 0 && `${entry.hoursWorked.toFixed(1)} hrs · `}
                      {entry && entry.salesAmount > 0 && `${fmt(entry.salesAmount)} sales`}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(s)}
                    className="h-8 w-8 shrink-0"
                    data-testid={`button-edit-wage-${s.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Wage Settings — {editingUser?.name || editingUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Wage Type</label>
              <Select
                value={editForm.wageType}
                onValueChange={(v) => setEditForm({ ...editForm, wageType: v as WageType })}
              >
                <SelectTrigger data-testid="select-wage-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No wage</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="monthly">Monthly Salary</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editForm.wageType !== "none" && editForm.wageType !== "commission" && (
              <div>
                <label className="text-xs font-semibold mb-1.5 block">
                  {editForm.wageType === "hourly" ? `Rate per hour (${currency})` : `Monthly amount (${currency})`}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.wageRate}
                  onChange={(e) => setEditForm({ ...editForm, wageRate: e.target.value })}
                  data-testid="input-wage-rate"
                />
              </div>
            )}

            {editForm.wageType === "commission" && (
              <div>
                <label className="text-xs font-semibold mb-1.5 block">Commission percentage</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={editForm.commissionPercent}
                  onChange={(e) => setEditForm({ ...editForm, commissionPercent: e.target.value })}
                  data-testid="input-commission-percent"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Cashier earns this % of every sale they ring up.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingUser(null)} className="flex-1">Cancel</Button>
              <Button onClick={saveEdit} disabled={updateMutation.isPending} className="flex-1" data-testid="button-save-wage">
                <Save className="h-3.5 w-3.5 mr-2" />
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
