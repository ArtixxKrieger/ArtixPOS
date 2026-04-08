import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays, subDays, isToday, parseISO, parse } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { getBusinessFeatures } from "@/lib/business-features";
import { insertAppointmentSchema, type Appointment, type ServiceStaff, type Customer, type ServiceRoom } from "@shared/schema";
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Clock, User,
  Edit, Trash2, CheckCircle2, Tag, CreditCard,
  Banknote, Smartphone, Building2, X, BadgeCheck, Zap,
  DoorOpen, Receipt,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled:   { label: "Scheduled",   color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" },
  confirmed:   { label: "Confirmed",   color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800" },
  in_progress: { label: "In Progress", color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" },
  completed:   { label: "Completed",   color: "text-green-600 dark:text-green-400",   bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800" },
  cancelled:   { label: "Cancelled",   color: "text-slate-500",                       bg: "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700" },
  no_show:     { label: "No Show",     color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800" },
};

const PAYMENT_METHODS = [
  { value: "cash",          label: "Cash",          icon: Banknote },
  { value: "card",          label: "Card",          icon: CreditCard },
  { value: "gcash",         label: "GCash",         icon: Smartphone },
  { value: "maya",          label: "Maya",          icon: Smartphone },
  { value: "bank_transfer", label: "Bank Transfer", icon: Building2 },
];

const formSchema = insertAppointmentSchema.extend({
  title:     z.string().min(1, "Service is required"),
  date:      z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
});

// ─── Checkout / Payment Dialog ────────────────────────────────────────────────

function CheckoutDialog({
  appt, staff, customers, onClose,
}: {
  appt: Appointment;
  staff: ServiceStaff[];
  customers: Customer[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const currency = settings?.currency ?? "₱";
  const { data: rooms = [] } = useQuery<ServiceRoom[]>({ queryKey: ["/api/service-rooms"] });

  const assignedStaff = (staff as ServiceStaff[]).find((s) => s.id === appt.staffId);
  const customer      = (customers as Customer[]).find((c) => c.id === appt.customerId);
  const assignedRoom  = (rooms as ServiceRoom[]).find((r) => r.id === appt.roomId);

  const basePrice = Number(appt.price ?? 0);
  const [tip, setTip]                               = useState(Number(appt.tip ?? 0));
  const [discountCode, setDiscountCode]             = useState("");
  const [appliedDiscount, setAppliedDiscount]       = useState<{ code: string; amount: number } | null>(null);
  const [paymentMethod, setPaymentMethod]           = useState("cash");
  const [cashGiven, setCashGiven]                   = useState("");
  const [codeError, setCodeError]                   = useState("");

  const subtotal = basePrice + tip;
  const discount = appliedDiscount?.amount ?? 0;
  const total    = Math.max(0, subtotal - discount);
  const change   = paymentMethod === "cash" && Number(cashGiven) > 0
    ? Math.max(0, Number(cashGiven) - total)
    : 0;

  const validateDiscountMutation = useMutation({
    mutationFn: (params: { code: string; orderTotal: number }) =>
      apiRequest("POST", "/api/discount-codes/validate", params).then((r) => r.json()),
    onSuccess: (data: any) => {
      setAppliedDiscount({ code: data.code, amount: data.discountAmount });
      setCodeError("");
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().then((d: any) => d.message).catch(() => null);
      setCodeError(msg || "Invalid or expired discount code");
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const saleItems: any[] = [
        { id: appt.id, name: appt.title, price: String(basePrice), quantity: 1, category: "Service" },
      ];
      if (tip > 0) {
        saleItems.push({ id: -1, name: "Tip", price: String(tip), quantity: 1, category: "Tip" });
      }
      await apiRequest("POST", "/api/sales", {
        items: saleItems,
        subtotal: String(subtotal),
        tax: "0",
        discount: String(discount),
        discountCode: appliedDiscount?.code ?? null,
        loyaltyDiscount: "0",
        total: String(total),
        paymentMethod,
        paymentAmount: paymentMethod === "cash" ? cashGiven || String(total) : String(total),
        changeAmount: paymentMethod === "cash" ? String(change) : "0",
        customerId: appt.customerId ?? null,
        notes: `Appointment #${appt.id} – ${appt.title}`,
      });
      await apiRequest("PUT", `/api/appointments/${appt.id}`, {
        status: "completed",
        tip: String(tip),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      toast({ title: "Payment confirmed!", description: `Sale recorded · ${formatCurrency(total, currency)}` });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Could not process payment", variant: "destructive" }),
  });

  const canPay = paymentMethod !== "cash" || !cashGiven || Number(cashGiven) >= total;

  const quickAmounts = useMemo(() => {
    if (total <= 0) return [];
    const units = [50, 100, 200, 500, 1000];
    const res: number[] = [];
    for (const u of units) {
      const r = Math.ceil(total / u) * u;
      if (r >= total && !res.includes(r) && res.length < 4) res.push(r);
    }
    return res;
  }, [total]);

  return (
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
      {/* Summary card */}
      <div className="rounded-xl bg-muted/40 border border-border p-3 space-y-1.5">
        <p className="font-semibold text-foreground text-base">{appt.title}</p>
        {customer && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0" />{customer.name}
            {customer.phone ? <span className="text-xs">· {customer.phone}</span> : null}
          </p>
        )}
        {assignedStaff && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: assignedStaff.color ?? "#6366f1" }} />
            {assignedStaff.name}
          </p>
        )}
        {assignedRoom && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <DoorOpen className="h-3.5 w-3.5 shrink-0" />{assignedRoom.name}
          </p>
        )}
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" />
          {appt.startTime} · {appt.duration ?? 60} min
        </p>
      </div>

      {/* Tip */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Tip ({currency})</label>
        <Input
          data-testid="input-checkout-tip"
          type="number" min={0} step={0.01}
          value={tip}
          onChange={(e) => setTip(Number(e.target.value))}
        />
      </div>

      {/* Discount code */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Discount Code</label>
        {appliedDiscount ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 px-3 py-2">
            <BadgeCheck className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400 flex-1">
              {appliedDiscount.code} — {formatCurrency(appliedDiscount.amount, currency)} off
            </span>
            <button onClick={() => { setAppliedDiscount(null); setDiscountCode(""); }}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              data-testid="input-checkout-discount-code"
              placeholder="Enter code"
              value={discountCode}
              className={codeError ? "border-destructive" : ""}
              onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setCodeError(""); }}
            />
            <Button
              type="button" variant="outline"
              disabled={!discountCode || validateDiscountMutation.isPending}
              onClick={() => validateDiscountMutation.mutate({ code: discountCode, orderTotal: subtotal })}
              data-testid="button-apply-discount"
            >
              <Tag className="h-4 w-4" />
            </Button>
          </div>
        )}
        {codeError && <p className="text-xs text-destructive mt-1">{codeError}</p>}
      </div>

      {/* Total breakdown */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Service</span><span>{formatCurrency(basePrice, currency)}</span>
        </div>
        {tip > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Tip</span><span>+{formatCurrency(tip, currency)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-green-600 dark:text-green-400">
            <span>Discount</span><span>−{formatCurrency(discount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-foreground text-base border-t border-border pt-1.5 mt-0.5">
          <span>Total</span><span>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      {/* Payment method */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Payment Method</label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              data-testid={`button-pay-${value}`}
              onClick={() => { setPaymentMethod(value); setCashGiven(""); }}
              className={[
                "flex flex-col items-center gap-1 rounded-xl border py-2.5 px-1 text-xs font-medium transition-all",
                paymentMethod === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Cash change calculator */}
      {paymentMethod === "cash" && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground block">Cash Given ({currency})</label>
          <Input
            data-testid="input-checkout-cash"
            type="number" min={0} step={0.01}
            placeholder={String(total)}
            value={cashGiven}
            onChange={(e) => setCashGiven(e.target.value)}
          />
          <div className="flex gap-1.5 flex-wrap">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                onClick={() => setCashGiven(String(amt))}
                data-testid={`button-quick-cash-${amt}`}
                className="text-xs px-2.5 py-1 rounded-lg border border-border bg-muted hover:bg-accent text-foreground transition-colors"
              >
                {formatCurrency(amt, currency)}
              </button>
            ))}
          </div>
          {cashGiven && Number(cashGiven) >= total && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2">
              <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">Change</span>
              <span className="text-base font-bold text-blue-700 dark:text-blue-300">{formatCurrency(change, currency)}</span>
            </div>
          )}
          {cashGiven && Number(cashGiven) < total && (
            <p className="text-xs text-destructive font-medium">
              Short by {formatCurrency(total - Number(cashGiven), currency)}
            </p>
          )}
        </div>
      )}

      {/* Confirm button */}
      <Button
        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
        disabled={completeMutation.isPending || !canPay}
        onClick={() => completeMutation.mutate()}
        data-testid="button-confirm-payment"
      >
        {completeMutation.isPending ? "Processing…" : `Confirm Payment · ${formatCurrency(total, currency)}`}
      </Button>
    </div>
  );
}

// ─── Booking Form ─────────────────────────────────────────────────────────────

function AppointmentForm({
  initial, defaultDate, onClose,
}: {
  initial?: Appointment;
  defaultDate: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!initial?.id;
  const { data: staff = [] }     = useQuery<ServiceStaff[]>({ queryKey: ["/api/service-staff"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: rooms = [] }     = useQuery<ServiceRoom[]>({ queryKey: ["/api/service-rooms"] });
  const { data: settings }       = useSettings();

  const { terminology, quickSuggestions } = getBusinessFeatures(
    (settings as any)?.businessType,
    (settings as any)?.businessSubType,
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title:       initial?.title ?? "",
      serviceType: initial?.serviceType ?? "",
      date:        initial?.date ?? defaultDate,
      startTime:   initial?.startTime ?? "09:00",
      endTime:     initial?.endTime ?? "",
      duration:    initial?.duration ?? 60,
      status:      (initial?.status as any) ?? "scheduled",
      customerId:  initial?.customerId ?? null,
      staffId:     initial?.staffId ?? null,
      roomId:      initial?.roomId ?? null,
      price:       initial?.price ?? "0",
      tip:         initial?.tip ?? "0",
      notes:       initial?.notes ?? "",
    },
  });

  const watchedDate      = form.watch("date");
  const watchedStartTime = form.watch("startTime");
  const watchedDuration  = form.watch("duration");

  // Fetch appointments for the form's currently selected date — this is the source of truth
  // for conflict checking. We fetch separately from the parent so changing the date in the form
  // immediately triggers a fresh lookup.
  const { data: dateAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", watchedDate],
    queryFn: async () => {
      if (!watchedDate) return [];
      const res = await apiRequest("GET", `/api/appointments?date=${watchedDate}`);
      return res.json();
    },
    enabled: !!watchedDate,
  });

  // For each room, check if it's occupied at the selected time slot
  const roomAvailability = useMemo(() => {
    const booked = new Set<number>();
    if (!watchedDate || !watchedStartTime || !watchedDuration) return booked;

    const slotStart = parse(`${watchedDate} ${watchedStartTime}`, "yyyy-MM-dd HH:mm", new Date());
    const slotEnd   = new Date(slotStart.getTime() + Number(watchedDuration) * 60_000);

    for (const a of dateAppointments as Appointment[]) {
      if (!a.roomId) continue;
      if (a.id === initial?.id) continue; // ignore self when editing
      if (a.status === "cancelled" || a.status === "no_show") continue;

      const aStart = parse(`${a.date} ${a.startTime}`, "yyyy-MM-dd HH:mm", new Date());
      const aEnd   = new Date(aStart.getTime() + Number(a.duration ?? 60) * 60_000);

      if (slotStart < aEnd && slotEnd > aStart) {
        booked.add(a.roomId);
      }
    }
    return booked;
  }, [dateAppointments, watchedDate, watchedStartTime, watchedDuration, initial?.id]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (isEdit) {
        await apiRequest("PUT", `/api/appointments/${initial!.id}`, data);
      } else {
        await apiRequest("POST", "/api/appointments", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: isEdit ? `${terminology.entry} updated` : `${terminology.entry} booked` });
      onClose();
    },
    onError: () =>
      toast({ title: "Error", description: `Failed to save ${terminology.entry.toLowerCase()}`, variant: "destructive" }),
  });

  const activeStaff = (staff as ServiceStaff[]).filter((s) => s.isActive);
  const currency    = settings?.currency ?? "₱";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">

        {/* Service / quick chips */}
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>{terminology.service}</FormLabel>
            <FormControl>
              <Input
                data-testid="input-appt-title"
                placeholder={quickSuggestions[0] ? `e.g. ${quickSuggestions[0]}` : `Enter ${terminology.service.toLowerCase()}`}
                {...field}
              />
            </FormControl>
            <FormMessage />
            {quickSuggestions.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {quickSuggestions.map((s) => (
                  <button
                    key={s} type="button"
                    onClick={() => form.setValue("title", s)}
                    data-testid={`chip-service-${s.replace(/\s+/g, "-").toLowerCase()}`}
                    className={[
                      "text-xs px-2.5 py-1 rounded-full border transition-all flex items-center gap-0.5",
                      field.value === s
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    ].join(" ")}
                  >
                    <Zap className="h-2.5 w-2.5 shrink-0" />{s}
                  </button>
                ))}
              </div>
            )}
          </FormItem>
        )} />

        {/* Date & time */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl><Input data-testid="input-appt-date" type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="startTime" render={({ field }) => (
            <FormItem>
              <FormLabel>Start Time</FormLabel>
              <FormControl><Input data-testid="input-appt-start-time" type="time" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Duration & status */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="duration" render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (min)</FormLabel>
              <FormControl>
                <Input data-testid="input-appt-duration" type="number" min={5} step={5}
                  {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value ?? "scheduled"}>
                <FormControl><SelectTrigger data-testid="select-appt-status"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Customer */}
        <FormField control={form.control} name="customerId" render={({ field }) => (
          <FormItem>
            <FormLabel>{terminology.customer}</FormLabel>
            <Select
              onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
              defaultValue={field.value?.toString() ?? "none"}
            >
              <FormControl>
                <SelectTrigger data-testid="select-appt-customer">
                  <SelectValue placeholder={`Select ${terminology.customer.toLowerCase()} (optional)`} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">Walk-in / No {terminology.customer.toLowerCase()}</SelectItem>
                {(customers as Customer[]).map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        {/* Staff */}
        {activeStaff.length > 0 && (
          <FormField control={form.control} name="staffId" render={({ field }) => (
            <FormItem>
              <FormLabel>{terminology.staff}</FormLabel>
              <Select
                onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                defaultValue={field.value?.toString() ?? "none"}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-appt-staff">
                    <SelectValue placeholder={`Select ${terminology.staff.toLowerCase()} (optional)`} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Any available</SelectItem>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: s.color ?? "#6366f1" }} />
                        {s.name}{s.specialty ? ` (${s.specialty})` : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        )}

        {/* Rooms — card grid with live availability */}
        {(rooms as ServiceRoom[]).length > 0 && (
          <FormField control={form.control} name="roomId" render={({ field }) => (
            <FormItem>
              <FormLabel>{terminology.room}</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                {/* "Any" option */}
                <button
                  type="button"
                  onClick={() => field.onChange(null)}
                  data-testid="room-card-none"
                  className={[
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all text-left",
                    field.value === null
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                  ].join(" ")}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 shrink-0" />
                  Any available
                </button>

                {(rooms as ServiceRoom[]).map((r) => {
                  const isBooked   = roomAvailability.has(r.id);
                  const isSelected = field.value === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={isBooked && !isSelected}
                      onClick={() => { if (!isBooked || isSelected) field.onChange(isSelected ? null : r.id); }}
                      data-testid={`room-card-${r.id}`}
                      className={[
                        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all text-left",
                        isBooked && !isSelected
                          ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-muted-foreground opacity-60 cursor-not-allowed"
                          : isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:border-green-400",
                      ].join(" ")}
                    >
                      <span className={["h-2.5 w-2.5 rounded-full shrink-0", isBooked ? "bg-red-500" : "bg-green-500"].join(" ")} />
                      <span className="truncate flex-1">{r.name}</span>
                      {isBooked && <span className="text-[10px] text-red-500 shrink-0">Booked</span>}
                      {!isBooked && <span className="text-[10px] text-green-600 shrink-0">Free</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Free at this time</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> Booked at this time</span>
              </p>
            </FormItem>
          )} />
        )}

        {/* Price & tip */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="price" render={({ field }) => (
            <FormItem>
              <FormLabel>Price ({currency})</FormLabel>
              <FormControl>
                <Input data-testid="input-appt-price" type="number" min={0} step={0.01}
                  {...field} value={field.value ?? "0"} />
              </FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="tip" render={({ field }) => (
            <FormItem>
              <FormLabel>Tip ({currency})</FormLabel>
              <FormControl>
                <Input data-testid="input-appt-tip" type="number" min={0} step={0.01}
                  {...field} value={field.value ?? "0"} />
              </FormControl>
            </FormItem>
          )} />
        </div>

        {/* Notes */}
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl>
              <Textarea data-testid="input-appt-notes" placeholder="Special requests, preferences…" rows={2}
                {...field} value={field.value ?? ""} />
            </FormControl>
          </FormItem>
        )} />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-appt">
            {mutation.isPending ? "Saving…" : isEdit ? `Update` : terminology.bookButton}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── Appointment Card ─────────────────────────────────────────────────────────

function AppointmentCard({
  appt, staff, customers, rooms, terminology,
  onEdit, onStatusChange, onDelete, onCheckout,
}: {
  appt: Appointment;
  staff: ServiceStaff[];
  customers: Customer[];
  rooms: ServiceRoom[];
  terminology: ReturnType<typeof getBusinessFeatures>["terminology"];
  onEdit: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
  onCheckout: () => void;
}) {
  const { data: settings } = useSettings();
  const currency       = settings?.currency ?? "₱";
  const sc             = STATUS_CONFIG[appt.status ?? "scheduled"] ?? STATUS_CONFIG.scheduled;
  const assignedStaff  = staff.find((s) => s.id === appt.staffId);
  const customer       = customers.find((c) => c.id === appt.customerId);
  const assignedRoom   = rooms.find((r) => r.id === appt.roomId);
  const isCompleted    = appt.status === "completed";
  const isCancelled    = appt.status === "cancelled" || appt.status === "no_show";

  const totalPaid = Number(appt.price ?? 0) + Number(appt.tip ?? 0);

  return (
    <div data-testid={`card-appointment-${appt.id}`} className={`border rounded-2xl p-4 transition-all ${sc.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Status badge + time */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}>
              {sc.label}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />{appt.startTime} · {appt.duration ?? 60} min
            </span>
          </div>

          {/* Title */}
          <p className="font-semibold text-foreground text-base">{appt.title}</p>

          {/* Customer */}
          {customer && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <User className="h-3.5 w-3.5 shrink-0" />
              {customer.name}{customer.phone ? ` · ${customer.phone}` : ""}
            </p>
          )}

          {/* Staff */}
          {assignedStaff && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: assignedStaff.color ?? "#6366f1" }} />
              {assignedStaff.name}{assignedStaff.specialty ? ` · ${assignedStaff.specialty}` : ""}
            </p>
          )}

          {/* Room / Station / Chair — always shown when assigned */}
          {assignedRoom && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <DoorOpen className="h-3.5 w-3.5 shrink-0" />
              {terminology.room}: <span className="font-medium text-foreground">{assignedRoom.name}</span>
            </p>
          )}

          {/* Price (shown only on completed) — NO dollar icon, formatCurrency already includes ₱ */}
          {isCompleted && totalPaid > 0 && (
            <p className="text-sm font-semibold text-green-600 dark:text-green-400 mt-1.5 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 shrink-0" />
              {formatCurrency(totalPaid, currency)}
              {Number(appt.tip ?? 0) > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  (incl. {formatCurrency(Number(appt.tip), currency)} tip)
                </span>
              )}
            </p>
          )}
        </div>

        {/* Action icons */}
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}
            data-testid={`button-edit-appt-${appt.id}`}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete} data-testid={`button-delete-appt-${appt.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Notes */}
      {appt.notes && (
        <p className="text-xs text-muted-foreground mt-2 italic">"{appt.notes}"</p>
      )}

      {/* Status action buttons — hidden for terminal states */}
      {!isCompleted && !isCancelled && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {/* Checkout / Complete — green and prominent */}
          <button
            onClick={onCheckout}
            data-testid={`button-checkout-${appt.id}`}
            className="text-[11px] px-3 py-1 rounded-full bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors flex items-center gap-1 shadow-sm"
          >
            <CheckCircle2 className="h-3 w-3" /> → Completed
          </button>

          {/* Other status transitions */}
          {["confirmed", "in_progress", "cancelled", "no_show"].map((s) =>
            s !== appt.status && (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                data-testid={`button-status-${s}-${appt.id}`}
                className="text-[11px] px-2 py-0.5 rounded-full bg-background/70 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                → {STATUS_CONFIG[s]?.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [dialogOpen, setDialogOpen]       = useState(false);
  const [editing, setEditing]             = useState<Appointment | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<Appointment | undefined>();
  const [checkoutAppt, setCheckoutAppt]   = useState<Appointment | undefined>();
  const [filterStaff, setFilterStaff]     = useState<string>("all");
  const [filterStatus, setFilterStatus]   = useState<string>("all");

  const { data: settings } = useSettings();
  const { terminology } = getBusinessFeatures(
    (settings as any)?.businessType,
    (settings as any)?.businessSubType,
  );

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", selectedDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/appointments?date=${selectedDate}`);
      return res.json();
    },
  });

  const { data: staff = [] }     = useQuery<ServiceStaff[]>({ queryKey: ["/api/service-staff"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: rooms = [] }     = useQuery<ServiceRoom[]>({ queryKey: ["/api/service-rooms"] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      apiRequest("PUT", `/api/appointments/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: `${terminology.entry} deleted` });
      setConfirmDelete(undefined);
    },
  });

  const parsedDate      = parseISO(selectedDate);
  const isSelectedToday = isToday(parsedDate);

  const filtered = (appointments as Appointment[]).filter((a) => {
    if (filterStaff !== "all" && a.staffId?.toString() !== filterStaff) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    return true;
  });

  const scheduled  = filtered.filter((a) => a.status === "scheduled" || a.status === "confirmed");
  const inProgress = filtered.filter((a) => a.status === "in_progress");
  const done       = filtered.filter((a) => a.status === "completed" || a.status === "cancelled" || a.status === "no_show");

  const completedToday = (appointments as Appointment[]).filter((a) => a.status === "completed");
  const totalRevenue   = completedToday.reduce((s, a) => s + Number(a.price ?? 0) + Number(a.tip ?? 0), 0);
  const currency       = settings?.currency ?? "₱";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{terminology.page}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} {filtered.length !== 1 ? terminology.entryPlural.toLowerCase() : terminology.entry.toLowerCase()} today
            {totalRevenue > 0 && ` · ${formatCurrency(totalRevenue, currency)} earned`}
          </p>
        </div>
        <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }} data-testid="button-add-appointment">
          <Plus className="h-4 w-4 mr-1.5" /> {terminology.bookButton}
        </Button>
      </div>

      {/* Date navigator */}
      <div className="flex items-center justify-between bg-card border border-border rounded-2xl p-3">
        <Button variant="ghost" size="icon"
          onClick={() => setSelectedDate(format(subDays(parsedDate, 1), "yyyy-MM-dd"))}
          data-testid="button-prev-day">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-foreground">{format(parsedDate, "EEEE, MMMM d")}</p>
          {isSelectedToday && <Badge variant="default" className="text-[10px] mt-0.5">Today</Badge>}
        </div>
        <Button variant="ghost" size="icon"
          onClick={() => setSelectedDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"))}
          data-testid="button-next-day">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
          const d          = format(addDays(new Date(), offset), "yyyy-MM-dd");
          const isSelected = d === selectedDate;
          const today      = isToday(parseISO(d));
          return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              data-testid={`button-day-${d}`}
              className={[
                "flex flex-col items-center min-w-[48px] py-2 px-1 rounded-xl text-xs font-medium transition-all",
                isSelected
                  ? "bg-primary text-white shadow-md shadow-primary/30"
                  : today
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <span className="text-[10px] uppercase">{format(parseISO(d), "EEE")}</span>
              <span className="text-base font-bold leading-tight">{format(parseISO(d), "d")}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      {(staff as ServiceStaff[]).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Select value={filterStaff} onValueChange={setFilterStaff}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-filter-staff">
              <SelectValue placeholder={`All ${terminology.staff}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {terminology.staff}</SelectItem>
              {(staff as ServiceStaff[]).map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-filter-status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <CalendarDays className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground">{terminology.emptyState}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {terminology.bookButton} a new {terminology.entry.toLowerCase()} for {format(parsedDate, "MMMM d")}
          </p>
          <Button className="mt-4" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> {terminology.bookButton} {terminology.entry}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {inProgress.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                In Progress ({inProgress.length})
              </h2>
              <div className="space-y-2">
                {inProgress.map((a) => (
                  <AppointmentCard key={a.id} appt={a}
                    staff={staff as ServiceStaff[]} customers={customers as Customer[]} rooms={rooms as ServiceRoom[]}
                    terminology={terminology}
                    onEdit={() => { setEditing(a); setDialogOpen(true); }}
                    onStatusChange={(s) => statusMutation.mutate({ id: a.id, status: s })}
                    onDelete={() => setConfirmDelete(a)}
                    onCheckout={() => setCheckoutAppt(a)}
                  />
                ))}
              </div>
            </section>
          )}
          {scheduled.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Upcoming ({scheduled.length})
              </h2>
              <div className="space-y-2">
                {scheduled.map((a) => (
                  <AppointmentCard key={a.id} appt={a}
                    staff={staff as ServiceStaff[]} customers={customers as Customer[]} rooms={rooms as ServiceRoom[]}
                    terminology={terminology}
                    onEdit={() => { setEditing(a); setDialogOpen(true); }}
                    onStatusChange={(s) => statusMutation.mutate({ id: a.id, status: s })}
                    onDelete={() => setConfirmDelete(a)}
                    onCheckout={() => setCheckoutAppt(a)}
                  />
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Done / Closed ({done.length})
              </h2>
              <div className="space-y-2">
                {done.map((a) => (
                  <AppointmentCard key={a.id} appt={a}
                    staff={staff as ServiceStaff[]} customers={customers as Customer[]} rooms={rooms as ServiceRoom[]}
                    terminology={terminology}
                    onEdit={() => { setEditing(a); setDialogOpen(true); }}
                    onStatusChange={(s) => statusMutation.mutate({ id: a.id, status: s })}
                    onDelete={() => setConfirmDelete(a)}
                    onCheckout={() => setCheckoutAppt(a)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Book / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setEditing(undefined); setDialogOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              {editing ? `Edit ${terminology.entry}` : `${terminology.bookButton} ${terminology.entry}`}
            </DialogTitle>
          </DialogHeader>
          <AppointmentForm
            initial={editing}
            defaultDate={selectedDate}
            onClose={() => { setEditing(undefined); setDialogOpen(false); }}
          />
        </DialogContent>
      </Dialog>

      {/* Checkout / payment dialog */}
      <Dialog open={!!checkoutAppt} onOpenChange={(v) => { if (!v) setCheckoutAppt(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Complete {terminology.entry}
            </DialogTitle>
          </DialogHeader>
          {checkoutAppt && (
            <CheckoutDialog
              appt={checkoutAppt}
              staff={staff as ServiceStaff[]}
              customers={customers as Customer[]}
              onClose={() => setCheckoutAppt(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete {terminology.entry}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{confirmDelete?.title}</strong> on {confirmDelete?.date} at {confirmDelete?.startTime}?
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(undefined)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={deleteMutation.isPending}
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
