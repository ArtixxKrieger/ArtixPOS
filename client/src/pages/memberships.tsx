import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import {
  insertMembershipPlanSchema, insertMembershipSchema,
  type MembershipPlan, type Membership, type Customer, type MembershipCheckIn
} from "@shared/schema";
import {
  BadgeCheck, Plus, Edit, Trash2, Search, Users, CreditCard,
  Calendar, CheckCircle2, QrCode, ChevronRight, Clock, Star
} from "lucide-react";

const BILLING_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly (3 mo.)",
  annual: "Annual",
  one_time: "One-time",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400",
  expired: "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500",
  cancelled: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400",
  paused: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400",
};

// ── Membership Plans ──────────────────────────────────────────────────────────

const planFormSchema = insertMembershipPlanSchema.extend({
  name: z.string().min(1, "Plan name is required"),
  price: z.string().min(1, "Price is required"),
  featuresText: z.string().optional(),
});

function PlanForm({ initial, onClose }: { initial?: MembershipPlan; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!initial?.id;
  const { data: settings } = useSettings();

  const form = useForm<z.infer<typeof planFormSchema>>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      price: initial?.price ?? "",
      billingCycle: (initial?.billingCycle as any) ?? "monthly",
      durationDays: initial?.durationDays ?? 30,
      maxCheckIns: initial?.maxCheckIns ?? null,
      isActive: initial?.isActive ?? true,
      featuresText: initial?.features?.join("\n") ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof planFormSchema>) => {
      const { featuresText, ...rest } = data;
      const features = featuresText ? featuresText.split("\n").map((f) => f.trim()).filter(Boolean) : [];
      if (isEdit) {
        await apiRequest("PUT", `/api/membership-plans/${initial!.id}`, { ...rest, features });
      } else {
        await apiRequest("POST", "/api/membership-plans", { ...rest, features });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership-plans"] });
      toast({ title: isEdit ? "Plan updated" : "Plan created" });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to save plan", variant: "destructive" }),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Plan Name</FormLabel>
            <FormControl><Input data-testid="input-plan-name" placeholder="e.g. Monthly Premium, Annual VIP" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl><Input data-testid="input-plan-description" placeholder="Brief description of what's included" {...field} value={field.value ?? ""} /></FormControl>
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="price" render={({ field }) => (
            <FormItem>
              <FormLabel>Price ({settings?.currency ?? "PHP"})</FormLabel>
              <FormControl><Input data-testid="input-plan-price" type="number" min={0} step={0.01} placeholder="0.00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="billingCycle" render={({ field }) => (
            <FormItem>
              <FormLabel>Billing</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value ?? "monthly"}>
                <FormControl><SelectTrigger data-testid="select-plan-billing"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.entries(BILLING_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="durationDays" render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (days)</FormLabel>
              <FormControl><Input data-testid="input-plan-duration" type="number" min={1} {...field} onChange={(e) => field.onChange(Number(e.target.value))} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="maxCheckIns" render={({ field }) => (
            <FormItem>
              <FormLabel>Max Check-ins</FormLabel>
              <FormControl><Input data-testid="input-plan-max-checkins" type="number" min={0} placeholder="Unlimited" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} /></FormControl>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="featuresText" render={({ field }) => (
          <FormItem>
            <FormLabel>Features (one per line)</FormLabel>
            <FormControl><Textarea data-testid="input-plan-features" placeholder={"Unlimited classes\nTowel service\nLocker access"} rows={3} {...field} value={field.value ?? ""} /></FormControl>
          </FormItem>
        )} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-plan">
            {mutation.isPending ? "Saving…" : isEdit ? "Update" : "Create Plan"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function PlanCard({ plan, onEdit, onDelete }: { plan: MembershipPlan; onEdit: () => void; onDelete: () => void }) {
  const { data: settings } = useSettings();
  return (
    <div data-testid={`card-plan-${plan.id}`} className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground">{plan.name}</p>
            {!plan.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
          </div>
          {plan.description && <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-lg font-bold text-primary">{formatCurrency(Number(plan.price), settings?.currency ?? "PHP")}</span>
            <Badge variant="outline" className="text-xs">{BILLING_LABELS[plan.billingCycle ?? "monthly"]}</Badge>
            <span className="text-xs text-muted-foreground">{plan.durationDays} days</span>
            {plan.maxCheckIns && <span className="text-xs text-muted-foreground">Max {plan.maxCheckIns} check-ins</span>}
          </div>
          {plan.features && (plan.features as string[]).length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {(plan.features as string[]).map((f, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />{f}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} data-testid={`button-edit-plan-${plan.id}`}><Edit className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} data-testid={`button-delete-plan-${plan.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

// ── Member Enrollment ─────────────────────────────────────────────────────────

const memberFormSchema = insertMembershipSchema.extend({
  customerId: z.number({ required_error: "Customer is required" }),
  planName: z.string().min(1),
  startDate: z.string().min(1),
});

function MemberForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: plans = [] } = useQuery<MembershipPlan[]>({ queryKey: ["/api/membership-plans"] });
  const { data: settings } = useSettings();

  const form = useForm<z.infer<typeof memberFormSchema>>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      customerId: undefined as any,
      planId: null,
      planName: "",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: "",
      status: "active",
      totalPaid: "0",
      notes: "",
    },
  });

  const selectedPlanId = form.watch("planId");
  const selectedPlan = (plans as MembershipPlan[]).find((p) => p.id === selectedPlanId);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof memberFormSchema>) => {
      await apiRequest("POST", "/api/memberships", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memberships"] });
      toast({ title: "Member enrolled" });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to enroll member", variant: "destructive" }),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="customerId" render={({ field }) => (
          <FormItem>
            <FormLabel>Customer</FormLabel>
            <Select onValueChange={(v) => field.onChange(Number(v))} defaultValue={field.value?.toString()}>
              <FormControl><SelectTrigger data-testid="select-member-customer"><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
              <SelectContent>
                {(customers as Customer[]).map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="planId" render={({ field }) => (
          <FormItem>
            <FormLabel>Membership Plan</FormLabel>
            <Select
              onValueChange={(v) => {
                const plan = (plans as MembershipPlan[]).find((p) => p.id === Number(v));
                field.onChange(Number(v));
                if (plan) {
                  form.setValue("planName", plan.name);
                  form.setValue("totalPaid", plan.price);
                  const start = form.getValues("startDate");
                  if (start && plan.durationDays) {
                    const end = new Date(start);
                    end.setDate(end.getDate() + plan.durationDays);
                    form.setValue("endDate", format(end, "yyyy-MM-dd"));
                  }
                }
              }}
              defaultValue={field.value?.toString()}
            >
              <FormControl><SelectTrigger data-testid="select-member-plan"><SelectValue placeholder="Select plan" /></SelectTrigger></FormControl>
              <SelectContent>
                {(plans as MembershipPlan[]).filter((p) => p.isActive).map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {formatCurrency(Number(p.price), settings?.currency ?? "PHP")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        {selectedPlan && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-sm">
            <p className="font-medium text-primary">{selectedPlan.name}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{selectedPlan.durationDays} days · {BILLING_LABELS[selectedPlan.billingCycle ?? "monthly"]}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="startDate" render={({ field }) => (
            <FormItem>
              <FormLabel>Start Date</FormLabel>
              <FormControl><Input data-testid="input-member-start" type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="endDate" render={({ field }) => (
            <FormItem>
              <FormLabel>End Date</FormLabel>
              <FormControl><Input data-testid="input-member-end" type="date" {...field} value={field.value ?? ""} /></FormControl>
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="totalPaid" render={({ field }) => (
          <FormItem>
            <FormLabel>Amount Paid ({settings?.currency ?? "PHP"})</FormLabel>
            <FormControl><Input data-testid="input-member-paid" type="number" min={0} step={0.01} {...field} value={field.value ?? "0"} /></FormControl>
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea data-testid="input-member-notes" placeholder="Any notes…" rows={2} {...field} value={field.value ?? ""} /></FormControl>
          </FormItem>
        )} />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-member">
            {mutation.isPending ? "Enrolling…" : "Enroll Member"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

type MemberWithCustomer = Membership & { customerName: string | null; customerPhone: string | null };

function MemberCard({ m, onCheckIn, onStatusChange, onDelete }: {
  m: MemberWithCustomer;
  onCheckIn: () => void;
  onStatusChange: (s: string) => void;
  onDelete: () => void;
}) {
  const { data: settings } = useSettings();
  const statusCls = STATUS_COLORS[m.status ?? "active"] ?? STATUS_COLORS.active;
  const isExpired = m.endDate && isBefore(parseISO(m.endDate), new Date());
  const daysLeft = m.endDate ? Math.ceil((parseISO(m.endDate).getTime() - Date.now()) / 86400000) : null;

  return (
    <div data-testid={`card-member-${m.id}`} className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground" data-testid={`text-member-name-${m.id}`}>{m.customerName ?? "Unknown"}</p>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>
              {m.status?.toUpperCase()}
            </span>
          </div>
          {m.customerPhone && <p className="text-xs text-muted-foreground mt-0.5">{m.customerPhone}</p>}
          <p className="text-sm font-medium text-primary mt-1">{m.planName}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {m.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(parseISO(m.startDate), "MMM d, yyyy")}</span>}
            {m.endDate && (
              <span className={`flex items-center gap-1 ${isExpired ? "text-red-500" : daysLeft && daysLeft <= 7 ? "text-amber-500" : ""}`}>
                <Clock className="h-3 w-3" />
                {isExpired ? "Expired" : `${daysLeft}d left`}
              </span>
            )}
            <span className="flex items-center gap-1"><QrCode className="h-3 w-3" />{m.checkInsUsed ?? 0} check-ins</span>
            {m.totalPaid && Number(m.totalPaid) > 0 && (
              <span>{formatCurrency(Number(m.totalPaid), settings?.currency ?? "PHP")}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {m.status === "active" && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={onCheckIn} data-testid={`button-checkin-${m.id}`}>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Check In
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} data-testid={`button-delete-member-${m.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="flex gap-1.5 mt-3 flex-wrap">
        {["active", "paused", "cancelled", "expired"].map((s) => (
          s !== m.status && (
            <button key={s} onClick={() => onStatusChange(s)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`button-member-status-${s}-${m.id}`}
            >
              → {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

export default function MembershipsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [planDialog, setPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | undefined>();
  const [memberDialog, setMemberDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "plan" | "member"; id: number; name: string } | undefined>();

  const { data: plans = [], isLoading: plansLoading } = useQuery<MembershipPlan[]>({ queryKey: ["/api/membership-plans"] });
  const { data: members = [], isLoading: membersLoading } = useQuery<MemberWithCustomer[]>({ queryKey: ["/api/memberships"] });

  const deletePlanMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/membership-plans/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/membership-plans"] }); setConfirmDelete(undefined); toast({ title: "Plan deleted" }); },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/memberships/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/memberships"] }); setConfirmDelete(undefined); toast({ title: "Membership removed" }); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PUT", `/api/memberships/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/memberships"] }),
  });

  const checkInMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/memberships/${id}/check-in`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/memberships"] }); toast({ title: "Check-in recorded!" }); },
    onError: () => toast({ title: "Check-in failed", variant: "destructive" }),
  });

  const filteredMembers = (members as MemberWithCustomer[]).filter((m) =>
    (m.customerName ?? "").toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    m.planName.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const activeCount = (members as MemberWithCustomer[]).filter((m) => m.status === "active").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Memberships</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeCount} active member{activeCount !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setMemberDialog(true)} data-testid="button-enroll-member">
          <Plus className="h-4 w-4 mr-1.5" /> Enroll
        </Button>
      </div>

      <Tabs defaultValue="members">
        <TabsList className="w-full">
          <TabsTrigger value="members" className="flex-1" data-testid="tab-members">Members</TabsTrigger>
          <TabsTrigger value="plans" className="flex-1" data-testid="tab-plans">Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="input-search-members" className="pl-9" placeholder="Search by name or plan…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {membersLoading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-24 bg-muted/40 rounded-2xl animate-pulse" />)}</div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-14">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-semibold">No members yet</p>
              <p className="text-sm text-muted-foreground mt-1">Enroll your first member to get started</p>
              <Button className="mt-4" onClick={() => setMemberDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> Enroll Member</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMembers.map((m) => (
                <MemberCard
                  key={m.id} m={m}
                  onCheckIn={() => checkInMutation.mutate(m.id)}
                  onStatusChange={(s) => statusMutation.mutate({ id: m.id, status: s })}
                  onDelete={() => setConfirmDelete({ type: "member", id: m.id, name: m.customerName ?? "Member" })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="plans" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => { setEditingPlan(undefined); setPlanDialog(true); }} data-testid="button-add-plan">
              <Plus className="h-4 w-4 mr-1.5" /> Add Plan
            </Button>
          </div>
          {plansLoading ? (
            <div className="space-y-3">{[1,2].map((i) => <div key={i} className="h-28 bg-muted/40 rounded-2xl animate-pulse" />)}</div>
          ) : (plans as MembershipPlan[]).length === 0 ? (
            <div className="text-center py-14">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-semibold">No plans yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create a membership plan to get started</p>
              <Button className="mt-4" onClick={() => setPlanDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> Create Plan</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {(plans as MembershipPlan[]).map((p) => (
                <PlanCard key={p.id} plan={p}
                  onEdit={() => { setEditingPlan(p); setPlanDialog(true); }}
                  onDelete={() => setConfirmDelete({ type: "plan", id: p.id, name: p.name })}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={planDialog} onOpenChange={(v) => { if (!v) setEditingPlan(undefined); setPlanDialog(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              {editingPlan ? "Edit Plan" : "Create Membership Plan"}
            </DialogTitle>
          </DialogHeader>
          <PlanForm initial={editingPlan} onClose={() => { setEditingPlan(undefined); setPlanDialog(false); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={memberDialog} onOpenChange={setMemberDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-primary" /> Enroll Member
            </DialogTitle>
          </DialogHeader>
          <MemberForm onClose={() => setMemberDialog(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? This cannot be undone.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(undefined)}>Cancel</Button>
            <Button variant="destructive" className="flex-1"
              disabled={deletePlanMutation.isPending || deleteMemberMutation.isPending}
              onClick={() => {
                if (confirmDelete?.type === "plan") deletePlanMutation.mutate(confirmDelete.id);
                else if (confirmDelete?.type === "member") deleteMemberMutation.mutate(confirmDelete.id);
              }}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
