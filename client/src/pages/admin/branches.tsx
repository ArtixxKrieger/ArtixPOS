import { useState, useEffect } from "react";
import { Sparkles, Loader2, RotateCcw, Copy, ExternalLink, Mail, Globe, Clock, TrendingUp, Users, ShoppingCart, DollarSign, BarChart2, ChevronRight, X, Info, Percent, Check, Share2, Link2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import {
  Building2, Plus, Pencil, Trash2, Phone, MapPin,
  CheckCircle, XCircle, Star, Crown, Lock, Sparkles as SparklesIcon,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch,
  useSetMainBranch, useSeedBranch, useResetBranch, useDuplicateBranch,
  useBranchStats, useSwitchBranch,
  fetchBranchSeedTemplate, type Branch, type BranchSeedTemplate,
} from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const DEFAULT_OPENING_HOURS: Record<string, { open: string; close: string; closed: boolean }> = Object.fromEntries(
  DAYS.map(({ key }) => [key, { open: "09:00", close: "18:00", closed: key === "sun" }])
);

const BRANCH_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#84cc16",
  "#f97316", "#6366f1",
];

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Toronto", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Tokyo", "Asia/Manila", "Australia/Sydney", "Pacific/Auckland",
];

const BUSINESS_TYPES: { value: string; label: string }[] = [
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "retail", label: "Retail" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" },
];

const BUSINESS_SUBTYPES: Record<string, { value: string; label: string }[]> = {
  food_beverage: [
    { value: "cafe", label: "Cafe / Coffee Shop" },
    { value: "restaurant", label: "Restaurant" },
    { value: "bakery", label: "Bakery" },
    { value: "bar", label: "Bar / Pub" },
    { value: "food_truck", label: "Food Truck" },
  ],
  retail: [
    { value: "clothing", label: "Clothing / Fashion" },
    { value: "electronics", label: "Electronics" },
    { value: "grocery", label: "Grocery / Supermarket" },
    { value: "bookstore", label: "Bookstore" },
  ],
  services: [
    { value: "salon", label: "Salon / Barbershop" },
    { value: "gym", label: "Gym / Fitness Center" },
    { value: "spa", label: "Spa / Wellness" },
    { value: "clinic", label: "Clinic / Healthcare" },
    { value: "laundry", label: "Laundry / Dry Cleaning" },
    { value: "car_wash", label: "Car Wash / Auto Detailing" },
    { value: "pet_grooming", label: "Pet Grooming" },
    { value: "photography", label: "Photography / Studio" },
    { value: "cleaning", label: "Cleaning Service" },
    { value: "tutoring", label: "Tutoring / Education" },
    { value: "repair", label: "Repair & Maintenance" },
  ],
  other: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function isOpenNow(openingHours: Branch["openingHours"], timezone?: string | null): boolean | null {
  if (!openingHours) return null;
  const now = timezone
    ? new Date(new Date().toLocaleString("en-US", { timeZone: timezone }))
    : new Date();
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()];
  const dayHours = openingHours[dayKey];
  if (!dayHours || dayHours.closed) return false;
  const [oh, om] = dayHours.open.split(":").map(Number);
  const [ch, cm] = dayHours.close.split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  return nowMins >= openMins && nowMins < closeMins;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  website: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  timezone: z.string().optional(),
  taxRate: z.string().optional(),
  openingHours: z.record(z.object({ open: z.string(), close: z.string(), closed: z.boolean() })).optional(),
  isActive: z.boolean().default(true),
  businessType: z.string().min(1, "Business type is required"),
  businessSubType: z.string().optional(),
}).superRefine((val, ctx) => {
  const subtypes = BUSINESS_SUBTYPES[val.businessType] ?? [];
  if (subtypes.length > 0 && !val.businessSubType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessSubType"],
      message: "Please pick what kind of business this is",
    });
  }
});

// Edit schema: name/businessType/businessSubType are locked and not re-validated
const branchEditSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  website: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  timezone: z.string().optional(),
  taxRate: z.string().optional(),
  openingHours: z.record(z.object({ open: z.string(), close: z.string(), closed: z.boolean() })).optional(),
  isActive: z.boolean().default(true),
  businessType: z.string().optional(),
  businessSubType: z.string().optional(),
});

type BranchForm = z.infer<typeof branchSchema>;

// ─── Opening Hours Editor ─────────────────────────────────────────────────────

function OpeningHoursEditor({
  value,
  onChange,
}: {
  value: Record<string, { open: string; close: string; closed: boolean }>;
  onChange: (v: Record<string, { open: string; close: string; closed: boolean }>) => void;
}) {
  function update(key: string, field: "open" | "close" | "closed", val: string | boolean) {
    onChange({ ...value, [key]: { ...value[key], [field]: val } });
  }

  function copyMonToAll() {
    const mon = value["mon"];
    if (!mon) return;
    const updated = { ...value };
    DAYS.forEach(({ key }) => { if (key !== "mon") updated[key] = { ...mon }; });
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const day = value[key] ?? { open: "09:00", close: "18:00", closed: false };
        return (
          <div key={key} className="flex items-center gap-2 rounded-xl bg-secondary/30 px-3 py-2">
            <span className="w-8 text-xs font-bold text-muted-foreground">{label}</span>
            <Switch
              data-testid={`switch-hours-${key}`}
              checked={!day.closed}
              onCheckedChange={(v) => update(key, "closed", !v)}
              className="scale-75"
            />
            {!day.closed ? (
              <>
                <input
                  data-testid={`input-hours-open-${key}`}
                  type="time"
                  value={day.open}
                  onChange={(e) => update(key, "open", e.target.value)}
                  className="flex-1 bg-background border border-border/40 rounded-lg px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <input
                  data-testid={`input-hours-close-${key}`}
                  type="time"
                  value={day.close}
                  onChange={(e) => update(key, "close", e.target.value)}
                  className="flex-1 bg-background border border-border/40 rounded-lg px-2 py-1 text-xs"
                />
              </>
            ) : (
              <span className="flex-1 text-xs text-muted-foreground italic">Closed</span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={copyMonToAll}
        className="text-[11px] text-primary font-semibold hover:underline"
      >
        Copy Mon hours to all days
      </button>
    </div>
  );
}

// ─── Color Picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hexInput, setHexInput] = useState(value || BRANCH_COLORS[0]);

  useEffect(() => {
    setHexInput(value || BRANCH_COLORS[0]);
  }, [value]);

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value;
    if (v && !v.startsWith("#")) v = "#" + v;
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  }

  const displayColor = /^#[0-9a-fA-F]{6}$/.test(value) ? value : BRANCH_COLORS[0];
  const fg = contrastColor(displayColor);

  return (
    <div className="space-y-4">
      {/* Swatch preview + hex input */}
      <div className="flex items-center gap-3">
        <div
          className="h-14 w-14 rounded-2xl shrink-0 shadow-lg border-2 border-white/20 flex items-center justify-center"
          style={{ backgroundColor: displayColor }}
        >
          <span className="text-lg font-black" style={{ color: fg }}>A</span>
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Custom hex code</p>
          <Input
            value={hexInput}
            onChange={handleHexInput}
            placeholder={BRANCH_COLORS[0]}
            className="font-mono text-sm h-9"
            maxLength={7}
            data-testid="input-color-hex"
          />
        </div>
      </div>

      {/* Preset grid */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground mb-2">Presets</p>
        <div className="grid grid-cols-5 gap-2">
          {BRANCH_COLORS.map((c) => {
            const selected = value === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setHexInput(c); }}
                data-testid={`color-swatch-${c.replace("#", "")}`}
                className="h-11 rounded-xl transition-all duration-150 flex items-center justify-center"
                style={{
                  backgroundColor: c,
                  outline: selected ? `3px solid ${c}` : "none",
                  outlineOffset: selected ? "2px" : "0",
                  transform: selected ? "scale(1.08)" : "scale(1)",
                  boxShadow: selected ? `0 4px 14px ${c}66` : "0 1px 4px rgba(0,0,0,0.18)",
                }}
              >
                {selected && <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Color Live Preview ───────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const lum = relativeLuminance(...rgb);
  return lum > 0.179 ? "#1a1a2e" : "#ffffff";
}

function alphaHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}

function ColorPreview({ color, name }: { color: string; name: string }) {
  const displayColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#8b5cf6";
  const fg = contrastColor(displayColor);
  const bg12 = alphaHex(displayColor, 0.12);
  const bg20 = alphaHex(displayColor, 0.20);
  const branchLabel = name || "Branch Name";

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: alphaHex(displayColor, 0.3) }}
      data-testid="color-preview-panel"
    >
      {/* Header strip */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: displayColor }}
      >
        <div
          className="h-8 w-8 rounded-xl flex items-center justify-center text-sm font-black"
          style={{ backgroundColor: "rgba(255,255,255,0.22)", color: fg }}
        >
          {branchLabel.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: fg }}>{branchLabel}</p>
          <p className="text-[10px] opacity-75" style={{ color: fg }}>Live preview</p>
        </div>
        {/* Active badge */}
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.22)", color: fg }}
        >
          Active
        </span>
      </div>

      {/* Body */}
      <div
        className="px-4 py-3 space-y-3"
        style={{ backgroundColor: bg12 }}
      >
        {/* Buttons row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold shadow-sm transition-opacity"
            style={{ backgroundColor: displayColor, color: fg }}
          >
            <ShoppingCart className="h-3 w-3" />
            New Sale
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold border"
            style={{ borderColor: alphaHex(displayColor, 0.5), color: displayColor, backgroundColor: bg20 }}
          >
            <TrendingUp className="h-3 w-3" />
            Analytics
          </button>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: bg20, color: displayColor }}
          >
            Open Now
          </span>
        </div>

        {/* Mini stat cards */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Today", value: "$0.00" },
            { label: "Orders", value: "0" },
            { label: "Staff", value: "0" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-2 text-center space-y-0.5"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${alphaHex(displayColor, 0.18)}` }}
            >
              <p className="text-xs font-black" style={{ color: displayColor }}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Sidebar nav hint */}
        <div className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ backgroundColor: bg20 }}>
          <div className="h-3.5 w-3.5 rounded" style={{ backgroundColor: displayColor }} />
          <span className="text-[10px] font-semibold" style={{ color: displayColor }}>
            Sidebar & nav use this color
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Branch Form Dialog ───────────────────────────────────────────────────────

function BranchFormDialog({ open, onClose, branch }: { open: boolean; onClose: () => void; branch?: Branch }) {
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const seedBranch = useSeedBranch();
  const { toast } = useToast();

  const [step, setStep] = useState<"form" | "seed">("form");
  const [activeTab, setActiveTab] = useState("basic");
  const [createdBranch, setCreatedBranch] = useState<Branch | null>(null);
  const [seedTemplate, setSeedTemplate] = useState<BranchSeedTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const form = useForm<BranchForm>({
    resolver: zodResolver(isEditing ? branchEditSchema : branchSchema),
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      email: branch?.email ?? "",
      website: branch?.website ?? "",
      description: branch?.description ?? "",
      color: branch?.color ?? BRANCH_COLORS[0],
      timezone: branch?.timezone ?? "",
      taxRate: branch?.taxRate ?? "",
      openingHours: (branch?.openingHours as any) ?? DEFAULT_OPENING_HOURS,
      isActive: branch?.isActive ?? true,
      businessType: branch?.businessType ?? "",
      businessSubType: branch?.businessSubType ?? "",
    },
  });

  const isEditing = !!branch;
  const selectedType = form.watch("businessType");
  const watchedColor = form.watch("color");
  const watchedName = form.watch("name");
  const subtypeOptions = BUSINESS_SUBTYPES[selectedType] ?? [];

  useEffect(() => {
    if (!open) {
      setStep("form");
      setActiveTab("basic");
      setCreatedBranch(null);
      setSeedTemplate(null);
    }
  }, [open]);

  function handleClose() {
    form.reset();
    setStep("form");
    setActiveTab("basic");
    setCreatedBranch(null);
    setSeedTemplate(null);
    onClose();
  }

  async function onSubmit(values: BranchForm) {
    try {
      const payload = {
        name: values.name,
        address: values.address || null,
        phone: values.phone || null,
        email: values.email || null,
        website: values.website || null,
        description: values.description || null,
        color: values.color || null,
        timezone: values.timezone || null,
        taxRate: values.taxRate || null,
        openingHours: values.openingHours || null,
        isActive: values.isActive,
        businessType: values.businessType,
        businessSubType: values.businessSubType || null,
      };
      if (isEditing) {
        await updateBranch.mutateAsync({ id: branch.id, ...(payload as any) });
        toast({ title: "Branch updated" });
        handleClose();
        return;
      }
      const newBranch = await createBranch.mutateAsync(payload as any);
      toast({ title: "Branch created" });
      setCreatedBranch(newBranch);
      setLoadingTemplate(true);
      try {
        const tpl = await fetchBranchSeedTemplate(newBranch.id);
        setSeedTemplate(tpl);
        if (tpl.available) setStep("seed");
        else handleClose();
      } catch {
        handleClose();
      } finally {
        setLoadingTemplate(false);
      }
    } catch (err: any) {
      toast({ title: err?.message ?? "Something went wrong", variant: "destructive" });
    }
  }

  async function handleSeed() {
    if (!createdBranch) return;
    try {
      const result = await seedBranch.mutateAsync({ branchId: createdBranch.id });
      toast({
        title: "Starter catalog added",
        description: `Loaded ${result.productsCreated} item${result.productsCreated === 1 ? "" : "s"}${result.tablesCreated ? ` and ${result.tablesCreated} table${result.tablesCreated === 1 ? "" : "s"}` : ""}.`,
      });
      handleClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to seed branch", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "seed" ? "Set up your branch" : isEditing ? "Edit Branch" : "Create Branch"}
          </DialogTitle>
        </DialogHeader>

        {step === "seed" && createdBranch && seedTemplate?.available ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 p-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm" data-testid="text-seed-template-label">{seedTemplate.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{seedTemplate.description}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">{seedTemplate.itemCount} items</span>
                  {(seedTemplate.tableCount ?? 0) > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">{seedTemplate.tableCount} tables</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Pre-load <span className="font-semibold text-foreground">{createdBranch.name}</span> with a starter catalog so you can start selling right away.
            </p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={seedBranch.isPending} data-testid="button-skip-seed">Skip for now</Button>
              <Button type="button" onClick={handleSeed} disabled={seedBranch.isPending} data-testid="button-confirm-seed">
                {seedBranch.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</> : <><Sparkles className="h-4 w-4 mr-2" />Add catalog</>}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full grid grid-cols-4 h-9">
                  <TabsTrigger value="basic" className="text-xs">Basic</TabsTrigger>
                  <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
                  <TabsTrigger value="hours" className="text-xs">Hours</TabsTrigger>
                  <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
                </TabsList>

                {/* Basic Tab */}
                <TabsContent value="basic" className="space-y-3 mt-3">
                  {/* Color picker row */}
                  <FormField control={form.control} name="color" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch Color</FormLabel>
                      <FormControl>
                        <ColorPicker value={field.value ?? BRANCH_COLORS[0]} onChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )} />

                  {/* Live preview */}
                  <ColorPreview
                    color={watchedColor ?? BRANCH_COLORS[0]}
                    name={watchedName ?? ""}
                  />

                  {!isEditing && (
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch Name</FormLabel>
                        <FormControl>
                          <Input data-testid="input-branch-name" placeholder="Main Branch" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  {!isEditing && (
                    <FormField control={form.control} name="businessType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Type</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={(v) => { field.onChange(v); form.setValue("businessSubType", ""); }}>
                          <FormControl>
                            <SelectTrigger data-testid="select-branch-business-type">
                              <SelectValue placeholder="What kind of business?" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BUSINESS_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value} data-testid={`option-business-type-${t.value}`}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  {!isEditing && subtypeOptions.length > 0 && (
                    <FormField control={form.control} name="businessSubType" render={({ field }) => (
                      <FormItem className="rounded-2xl border border-border/40 bg-secondary/30 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <FormLabel className="text-xs font-bold uppercase tracking-wider text-primary">
                            What kind of {BUSINESS_TYPES.find(t => t.value === selectedType)?.label.toLowerCase()}?
                          </FormLabel>
                        </div>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-branch-business-subtype">
                              <SelectValue placeholder="Pick a type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subtypeOptions.map((t) => (
                              <SelectItem key={t.value} value={t.value} data-testid={`option-business-subtype-${t.value}`}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex items-center gap-3 rounded-xl bg-secondary/40 border border-border/30 p-3">
                      <div className="flex-1">
                        <FormLabel>Active</FormLabel>
                        <p className="text-xs text-muted-foreground">Inactive branches are hidden from staff</p>
                      </div>
                      <FormControl>
                        <Switch data-testid="switch-branch-active" checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )} />
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-3 mt-3">
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem>
                      <FormLabel><MapPin className="h-3.5 w-3.5 inline mr-1" />Address</FormLabel>
                      <FormControl>
                        <Input data-testid="input-branch-address" placeholder="123 Main St, City" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel><Phone className="h-3.5 w-3.5 inline mr-1" />Phone</FormLabel>
                        <FormControl>
                          <Input data-testid="input-branch-phone" placeholder="+1 555 000 0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel><Mail className="h-3.5 w-3.5 inline mr-1" />Email</FormLabel>
                        <FormControl>
                          <Input data-testid="input-branch-email" placeholder="branch@store.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="website" render={({ field }) => (
                    <FormItem>
                      <FormLabel><Globe className="h-3.5 w-3.5 inline mr-1" />Website</FormLabel>
                      <FormControl>
                        <Input data-testid="input-branch-website" placeholder="https://yourstore.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel><Info className="h-3.5 w-3.5 inline mr-1" />Notes / Description</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="input-branch-description"
                          placeholder="Internal notes about this branch…"
                          className="resize-none text-sm"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </TabsContent>

                {/* Hours Tab */}
                <TabsContent value="hours" className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Set when this branch is open. The "Open Now" badge on the card uses these hours.</p>
                  <FormField control={form.control} name="openingHours" render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <OpeningHoursEditor
                          value={(field.value ?? DEFAULT_OPENING_HOURS) as Record<string, { open: string; close: string; closed: boolean }>}
                          onChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-3 mt-3">
                  <FormField control={form.control} name="timezone" render={({ field }) => (
                    <FormItem>
                      <FormLabel><Clock className="h-3.5 w-3.5 inline mr-1" />Timezone</FormLabel>
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-branch-timezone">
                            <SelectValue placeholder="Select timezone" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">Used to display "Open Now" based on local time.</p>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="taxRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel><Percent className="h-3.5 w-3.5 inline mr-1" />Tax Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-branch-tax-rate"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="e.g. 8.5"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-[11px] text-muted-foreground">Override the default tax rate for this branch specifically.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                </TabsContent>
              </Tabs>

              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button
                  data-testid="button-save-branch"
                  type="submit"
                  disabled={createBranch.isPending || updateBranch.isPending || loadingTemplate}
                >
                  {createBranch.isPending || loadingTemplate ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{loadingTemplate ? "Loading…" : "Creating…"}</>
                  ) : (
                    isEditing ? "Update" : "Create"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Branch Detail Drawer ─────────────────────────────────────────────────────

function BranchDetailDrawer({
  branch,
  open,
  onClose,
  onEdit,
}: {
  branch: Branch | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { data: stats, isLoading: statsLoading } = useBranchStats(open && branch ? branch.id : null);
  const switchBranch = useSwitchBranch();
  const { user } = useAuth();
  const { toast } = useToast();

  const openStatus = branch ? isOpenNow(branch.openingHours, branch.timezone) : null;
  const color = branch?.color ?? "#8b5cf6";

  async function handleSwitch() {
    if (!branch) return;
    try {
      await switchBranch.mutateAsync(branch.id);
      toast({ title: `Switched to ${branch.name}` });
      onClose();
      setTimeout(() => window.location.reload(), 150);
    } catch (err: any) {
      toast({ title: "Could not switch branch", variant: "destructive" });
    }
  }

  function handleCopyLink() {
    if (!branch) return;
    const url = `${window.location.origin}/b/${branch.id}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied!", description: url });
    }).catch(() => {
      toast({ title: "Could not copy link", variant: "destructive" });
    });
  }

  const chartData = stats?.last7Days.map((d) => ({
    day: new Date(d.day).toLocaleDateString("en-US", { weekday: "short" }),
    revenue: d.revenue,
    orders: d.orders,
  })) ?? [];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Header with color stripe */}
        {branch && (
          <>
            <div className="h-2 w-full" style={{ backgroundColor: color }} />
            <div className="p-5 space-y-4">
              <SheetHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0" style={{ backgroundColor: color }}>
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <SheetTitle className="text-lg font-black">{branch.name}</SheetTitle>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {branch.isMain && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            <Star className="h-2.5 w-2.5 fill-primary" />Main
                          </span>
                        )}
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                          branch.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"
                        )}>
                          {branch.isActive ? <><CheckCircle className="h-2.5 w-2.5" />Active</> : <><XCircle className="h-2.5 w-2.5" />Inactive</>}
                        </span>
                        {openStatus !== null && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                            openStatus ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-500"
                          )}>
                            <Clock className="h-2.5 w-2.5" />{openStatus ? "Open Now" : "Closed"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {user?.role === "owner" && branch.id !== user?.activeBranchId && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSwitch} disabled={switchBranch.isPending} data-testid="button-switch-branch-drawer">
                        {switchBranch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Switch"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={handleCopyLink} data-testid="button-share-branch-drawer" title="Copy shareable link">
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onEdit} data-testid="button-edit-branch-drawer">
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              {/* Contact info */}
              <div className="grid grid-cols-1 gap-1.5">
                {branch.address && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{branch.address}</span>
                  </div>
                )}
                {branch.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{branch.phone}</span>
                  </div>
                )}
                {branch.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <a href={`mailto:${branch.email}`} className="hover:underline">{branch.email}</a>
                  </div>
                )}
                {branch.website && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <a href={branch.website} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                      {branch.website.replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                )}
                {branch.timezone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{branch.timezone.replace(/_/g, " ")}</span>
                  </div>
                )}
                {branch.taxRate && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Percent className="h-3.5 w-3.5 shrink-0" />
                    <span>{branch.taxRate}% tax rate</span>
                  </div>
                )}
              </div>

              {branch.description && (
                <div className="rounded-xl bg-secondary/40 border border-border/30 p-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">{branch.description}</p>
                </div>
              )}

              {/* Stats */}
              {statsLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-20 skeleton-shimmer rounded-2xl" />)}
                </div>
              ) : stats ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-card rounded-2xl p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                        <DollarSign className="h-3.5 w-3.5 text-emerald-500" />Today's Revenue
                      </div>
                      <p className="text-xl font-black text-foreground" data-testid="text-branch-today-revenue">{fmt(stats.today.revenue)}</p>
                      <p className="text-[11px] text-muted-foreground">{stats.today.orders} orders</p>
                    </div>
                    <div className="glass-card rounded-2xl p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                        <TrendingUp className="h-3.5 w-3.5 text-blue-500" />This Month
                      </div>
                      <p className="text-xl font-black text-foreground">{fmt(stats.thisMonth.revenue)}</p>
                      <p className="text-[11px] text-muted-foreground">{stats.thisMonth.orders} orders</p>
                    </div>
                    <div className="glass-card rounded-2xl p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                        <ShoppingCart className="h-3.5 w-3.5 text-violet-500" />All-Time Orders
                      </div>
                      <p className="text-xl font-black text-foreground">{stats.allTime.orders.toLocaleString()}</p>
                      <p className="text-[11px] text-muted-foreground">{fmt(stats.allTime.revenue)} total</p>
                    </div>
                    <div className="glass-card rounded-2xl p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                        <Users className="h-3.5 w-3.5 text-amber-500" />Staff Assigned
                      </div>
                      <p className="text-xl font-black text-foreground">{stats.staffCount}</p>
                      <p className="text-[11px] text-muted-foreground">team member{stats.staffCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>

                  {/* 7-day chart */}
                  {chartData.length > 0 && (
                    <div className="glass-card rounded-2xl p-4 space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5" />Last 7 Days Revenue
                      </p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={chartData} barSize={20}>
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip
                            formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]}
                            contentStyle={{ fontSize: 11, borderRadius: 8 }}
                          />
                          <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                            {chartData.map((_, i) => (
                              <Cell key={i} fill={color} fillOpacity={0.7 + i * 0.04} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Top products */}
                  {stats.topProducts.length > 0 && (
                    <div className="glass-card rounded-2xl p-4 space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Top Products</p>
                      <div className="space-y-1.5">
                        {stats.topProducts.map((p, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium truncate">{p.name}</span>
                                <span className="text-[11px] text-muted-foreground shrink-0">{p.qty} sold</span>
                              </div>
                              <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${(p.qty / stats.topProducts[0].qty) * 100}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              {/* Opening Hours summary */}
              {branch.openingHours && (
                <div className="glass-card rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />Opening Hours
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {DAYS.map(({ key, label }) => {
                      const h = branch.openingHours![key];
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="w-7 text-muted-foreground font-medium">{label}</span>
                          {!h || h.closed
                            ? <span className="text-rose-500 font-medium">Closed</span>
                            : <span className="text-foreground">{h.open} – {h.close}</span>
                          }
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Seed / Reset dialogs (compact) ──────────────────────────────────────────

function BranchSeedDialog({ branch, open, onClose }: { branch: Branch | null; open: boolean; onClose: () => void }) {
  const seedBranch = useSeedBranch();
  const { toast } = useToast();
  const [template, setTemplate] = useState<BranchSeedTemplate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !branch) { setTemplate(null); return; }
    setLoading(true);
    fetchBranchSeedTemplate(branch.id).then(setTemplate).catch(() => setTemplate({ available: false })).finally(() => setLoading(false));
  }, [open, branch]);

  async function handleSeed() {
    if (!branch) return;
    try {
      const result = await seedBranch.mutateAsync({ branchId: branch.id });
      toast({ title: "Starter catalog added", description: `Loaded ${result.productsCreated} items.` });
      onClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to seed branch", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Set up catalog</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !template?.available ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">No starter template available for this business type.</p>
            <DialogFooter><Button onClick={onClose} variant="ghost">Close</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 p-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
                <SparklesIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-sm" data-testid="text-seed-template-label-existing">{template.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">{template.itemCount} items</span>
                  {(template.tableCount ?? 0) > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">{template.tableCount} tables</span>}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={seedBranch.isPending}>Cancel</Button>
              <Button type="button" onClick={handleSeed} disabled={seedBranch.isPending} data-testid="button-confirm-seed-existing">
                {seedBranch.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding…</> : <><SparklesIcon className="h-4 w-4 mr-2" />Add catalog</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const TEMPLATE_GROUPS = BUSINESS_TYPES
  .filter(t => (BUSINESS_SUBTYPES[t.value] ?? []).length > 0)
  .map(t => ({ type: t.value, label: t.label }));

function BranchResetDialog({ branch, open, onClose }: { branch: Branch | null; open: boolean; onClose: () => void }) {
  const resetBranch = useResetBranch();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [reseed, setReseed] = useState(true);
  const [templateKey, setTemplateKey] = useState("");

  useEffect(() => { if (!open) { setConfirmText(""); setReseed(true); setTemplateKey(""); } }, [open]);

  const expected = branch?.name ?? "";
  const canReset = !!branch && confirmText.trim() === expected.trim() && expected.length > 0;

  async function handleReset() {
    if (!branch || !canReset) return;
    try {
      const result = await resetBranch.mutateAsync({ branchId: branch.id, reseed, templateKey: reseed && templateKey ? templateKey : undefined });
      toast({ title: "Branch reset", description: `Removed ${result.productsDeleted} products.` });
      onClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to reset branch", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset Branch</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-2xl bg-rose-500/5 border border-rose-500/20 p-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-sm">This will wipe the catalog</p>
              <p className="text-xs text-muted-foreground mt-1">Every product and table on <span className="font-semibold text-foreground">{branch?.name}</span> will be permanently deleted. Sales history is kept.</p>
            </div>
          </div>

          <div className="rounded-xl bg-secondary/40 border border-border/30 p-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold">Re-seed after reset</p>
                <p className="text-xs text-muted-foreground">Repopulate with a fresh starter catalog.</p>
              </div>
              <Switch data-testid="switch-reset-reseed" checked={reseed} onCheckedChange={setReseed} />
            </div>
            {reseed && (
              <Select value={templateKey || "auto"} onValueChange={(v) => setTemplateKey(v === "auto" ? "" : v)}>
                <SelectTrigger data-testid="select-reset-template" className="bg-background">
                  <SelectValue placeholder="Match this branch's business type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto — match branch type</SelectItem>
                  {TEMPLATE_GROUPS.map(group => (
                    <SelectGroup key={group.type}>
                      <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.label}</SelectLabel>
                      {(BUSINESS_SUBTYPES[group.type] ?? []).map(opt => (
                        <SelectItem key={opt.value} value={opt.value} data-testid={`option-reset-template-${opt.value}`}>{opt.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Type <span className="font-mono text-foreground">{expected}</span> to confirm</label>
            <Input data-testid="input-reset-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={expected} autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={resetBranch.isPending}>Cancel</Button>
          <Button type="button" onClick={handleReset} disabled={!canReset || resetBranch.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-reset">
            {resetBranch.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting…</> : <><RotateCcw className="h-4 w-4 mr-2" />Reset branch</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Branch Card ──────────────────────────────────────────────────────────────

function BranchCard({
  branch,
  isOwner,
  onViewDetail,
  onEdit,
  onDelete,
  onSetMain,
  onSeed,
  onReset,
  onDuplicate,
}: {
  branch: Branch;
  isOwner: boolean;
  onViewDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetMain: () => void;
  onSeed: () => void;
  onReset: () => void;
  onDuplicate: () => void;
}) {
  const { user } = useAuth();
  const switchBranch = useSwitchBranch();
  const { toast } = useToast();
  const { data: stats } = useBranchStats(branch.id);

  const color = branch.color ?? "#8b5cf6";
  const openStatus = isOpenNow(branch.openingHours, branch.timezone);
  const isActive = branch.id === user?.activeBranchId;

  async function handleSwitch() {
    try {
      await switchBranch.mutateAsync(branch.id);
      toast({ title: `Switched to ${branch.name}` });
      setTimeout(() => window.location.reload(), 150);
    } catch {
      toast({ title: "Could not switch", variant: "destructive" });
    }
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/b/${branch.id}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied!", description: url });
    }).catch(() => {
      toast({ title: "Could not copy link", variant: "destructive" });
    });
  }

  return (
    <div
      data-testid={`card-branch-${branch.id}`}
      className={cn(
        "glass-card rounded-2xl overflow-hidden flex flex-col transition-all hover:shadow-lg",
        branch.isMain && "ring-2 ring-primary/30",
        isActive && "ring-2 ring-emerald-500/40"
      )}
    >
      {/* Color stripe */}
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
          style={{ backgroundColor: color }}
        >
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={onViewDetail}
            className="font-bold text-sm truncate hover:underline text-left w-full"
            data-testid={`text-branch-name-${branch.id}`}
          >
            {branch.name}
          </button>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {branch.isMain && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                <Star className="h-2.5 w-2.5 fill-primary" />Main
              </span>
            )}
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle className="h-2.5 w-2.5" />Viewing
              </span>
            )}
            <span className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
              branch.isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-secondary text-muted-foreground"
            )}>
              {branch.isActive ? <><CheckCircle className="h-2.5 w-2.5" />Active</> : <><XCircle className="h-2.5 w-2.5" />Inactive</>}
            </span>
            {openStatus !== null && branch.openingHours && (
              <span className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                openStatus ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-500"
              )}>
                <Clock className="h-2.5 w-2.5" />{openStatus ? "Open" : "Closed"}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onViewDetail}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary/60 text-muted-foreground transition-colors shrink-0"
          data-testid={`button-view-branch-${branch.id}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Quick stats */}
      {stats && (
        <div className="px-4 pb-3 grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-xs font-black text-foreground">{fmt(stats.today.revenue)}</p>
            <p className="text-[10px] text-muted-foreground">Today</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-black text-foreground">{stats.today.orders}</p>
            <p className="text-[10px] text-muted-foreground">Orders</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-black text-foreground">{stats.staffCount}</p>
            <p className="text-[10px] text-muted-foreground">Staff</p>
          </div>
        </div>
      )}

      {/* Address/phone */}
      {(branch.address || branch.phone) && (
        <div className="px-4 pb-3 space-y-1 border-t border-border/20 pt-2">
          {branch.address && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="truncate">{branch.address}</span>
            </div>
          )}
          {branch.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{branch.phone}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isOwner && (
        <div className="mt-auto px-4 pb-4 pt-3 border-t border-border/20 space-y-2">
          {/* Primary actions */}
          <div className="flex gap-2">
            {!isActive && user?.role === "owner" && (
              <button
                data-testid={`button-switch-branch-${branch.id}`}
                onClick={handleSwitch}
                disabled={switchBranch.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold transition-colors"
              >
                <Building2 className="h-3.5 w-3.5" />Switch to
              </button>
            )}
            <button
              data-testid={`button-edit-branch-${branch.id}`}
              onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground text-xs font-semibold transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />Edit
            </button>
            <button
              data-testid={`button-delete-branch-${branch.id}`}
              onClick={onDelete}
              className="h-8 w-8 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 transition-colors shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Secondary actions */}
          <div className="flex gap-2 flex-wrap">
            {!branch.isMain && (
              <button
                data-testid={`button-set-main-branch-${branch.id}`}
                onClick={onSetMain}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-colors"
              >
                <Star className="h-3 w-3" />Set Main
              </button>
            )}
            {branch.businessType && (
              <button
                data-testid={`button-seed-branch-${branch.id}`}
                onClick={onSeed}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 text-[11px] font-semibold transition-colors"
              >
                <SparklesIcon className="h-3 w-3" />Seed
              </button>
            )}
            <button
              data-testid={`button-duplicate-branch-${branch.id}`}
              onClick={onDuplicate}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-semibold transition-colors"
            >
              <Copy className="h-3 w-3" />Duplicate
            </button>
            <button
              data-testid={`button-reset-branch-${branch.id}`}
              onClick={onReset}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-semibold transition-colors"
            >
              <RotateCcw className="h-3 w-3" />Reset
            </button>
            <button
              data-testid={`button-share-branch-${branch.id}`}
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-xl bg-slate-500/10 hover:bg-slate-500/20 text-slate-600 dark:text-slate-400 text-[11px] font-semibold transition-colors"
            >
              <Share2 className="h-3 w-3" />Share
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Comparison Bar ───────────────────────────────────────────────────────────

function BranchComparisonChart({ branches }: { branches: Branch[] }) {
  const stats1 = useBranchStats(branches[0]?.id ?? null);
  const stats2 = useBranchStats(branches[1]?.id ?? null);
  const stats3 = useBranchStats(branches[2]?.id ?? null);
  const stats4 = useBranchStats(branches[3]?.id ?? null);
  const stats5 = useBranchStats(branches[4]?.id ?? null);

  if (branches.length < 2) return null;

  const allRevenues = [
    stats1.data?.thisMonth.revenue ?? 0,
    stats2.data?.thisMonth.revenue ?? 0,
    stats3.data?.thisMonth.revenue ?? 0,
    stats4.data?.thisMonth.revenue ?? 0,
    stats5.data?.thisMonth.revenue ?? 0,
  ].slice(0, branches.length);

  const maxRevenue = Math.max(...allRevenues, 1);
  const maxRef = { current: maxRevenue };

  const sorted = [...branches].slice(0, 5).map((b, i) => ({
    branch: b,
    revenue: allRevenues[i],
    orders: [stats1, stats2, stats3, stats4, stats5][i]?.data?.thisMonth.orders ?? 0,
  })).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-bold">Branch Comparison — This Month</p>
      </div>
      <div className="space-y-2">
        {sorted.map((s) => (
          <div key={s.branch.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate flex-1">{s.branch.name}</span>
              <span className="text-muted-foreground ml-2">{fmt(s.revenue)} · {s.orders} orders</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(s.revenue / maxRef.current) * 100}%`, backgroundColor: s.branch.color ?? "#8b5cf6" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Branches() {
  const { user } = useAuth();
  const { data: branches = [], isLoading } = useBranches();
  const deleteBranch = useDeleteBranch();
  const setMainBranch = useSetMainBranch();
  const duplicateBranch = useDuplicateBranch();
  const [formOpen, setFormOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | undefined>();
  const [deletingBranchId, setDeletingBranchId] = useState<number | null>(null);
  const [seedingBranch, setSeedingBranch] = useState<Branch | null>(null);
  const [resettingBranch, setResettingBranch] = useState<Branch | null>(null);
  const [detailBranch, setDetailBranch] = useState<Branch | null>(null);
  const [showUpgradeCard, setShowUpgradeCard] = useState(false);
  const isOwner = user?.role === "owner";
  const { toast } = useToast();
  const { isPro } = useSubscription();
  const [, setLocation] = useLocation();

  function handleAddBranch() {
    if (!isPro && branches.length >= 1) {
      setShowUpgradeCard(true);
    } else {
      setEditingBranch(undefined);
      setFormOpen(true);
    }
  }

  function handleEdit(branch: Branch) {
    setDetailBranch(null);
    setEditingBranch(branch);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingBranchId) return;
    try {
      await deleteBranch.mutateAsync(deletingBranchId);
      toast({ title: "Branch deleted" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to delete branch", variant: "destructive" });
    } finally {
      setDeletingBranchId(null);
    }
  }

  async function handleSetMain(id: number) {
    try {
      await setMainBranch.mutateAsync(id);
      toast({ title: "Main branch updated" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to set main branch", variant: "destructive" });
    }
  }

  async function handleDuplicate(branch: Branch) {
    try {
      const newBranch = await duplicateBranch.mutateAsync(branch.id);
      toast({ title: `"${newBranch.name}" created`, description: "Settings copied. The branch is inactive — edit it to activate." });
    } catch (err: any) {
      if (err?.message?.includes("BRANCH_LIMIT")) {
        setShowUpgradeCard(true);
      } else {
        toast({ title: err?.message ?? "Failed to duplicate", variant: "destructive" });
      }
    }
  }

  return (
    <div className="space-y-5 page-enter pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 shrink-0">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black tracking-tight">Branches</h2>
          <p className="text-xs text-muted-foreground font-medium">
            {branches.length} location{branches.length !== 1 ? "s" : ""} · click any branch to view details
          </p>
        </div>
        {isOwner && (
          <button
            data-testid="button-create-branch"
            onClick={handleAddBranch}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Branch</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {/* Comparison chart (3+ branches) */}
      {!isLoading && branches.length >= 2 && (
        <BranchComparisonChart branches={branches} />
      )}

      {/* Loading skeletons */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-48 skeleton-shimmer rounded-2xl" />)}
        </div>
      ) : branches.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
          </div>
          <p className="font-semibold text-foreground">No branches yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Create your first location to start managing your stores</p>
          {isOwner && (
            <button
              onClick={handleAddBranch}
              className="flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />Create your first branch
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map(branch => (
            <BranchCard
              key={branch.id}
              branch={branch}
              isOwner={isOwner}
              onViewDetail={() => setDetailBranch(branch)}
              onEdit={() => handleEdit(branch)}
              onDelete={() => setDeletingBranchId(branch.id)}
              onSetMain={() => handleSetMain(branch.id)}
              onSeed={() => setSeedingBranch(branch)}
              onReset={() => setResettingBranch(branch)}
              onDuplicate={() => handleDuplicate(branch)}
            />
          ))}
        </div>
      )}

      {/* Pro upgrade dialog */}
      <Dialog open={showUpgradeCard} onOpenChange={setShowUpgradeCard}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Crown className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Pro Feature</span>
              </div>
              <h2 className="text-lg font-black text-foreground">Multiple Branches</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                The Free plan includes 1 branch. Upgrade to Pro to manage unlimited locations with advanced analytics.
              </p>
            </div>
            <div className="w-full space-y-2">
              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold shadow-md shadow-orange-500/20 border-0"
                onClick={() => { setShowUpgradeCard(false); setLocation("/billing"); }}
              >
                <Crown className="h-4 w-4 mr-2" />Upgrade to Pro
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setShowUpgradeCard(false)}>
                Maybe later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Branch detail drawer */}
      <BranchDetailDrawer
        branch={detailBranch}
        open={!!detailBranch}
        onClose={() => setDetailBranch(null)}
        onEdit={() => { if (detailBranch) handleEdit(detailBranch); }}
      />

      <BranchFormDialog open={formOpen} onClose={() => setFormOpen(false)} branch={editingBranch} />
      <BranchSeedDialog open={!!seedingBranch} onClose={() => setSeedingBranch(null)} branch={seedingBranch} />
      <BranchResetDialog open={!!resettingBranch} onClose={() => setResettingBranch(null)} branch={resettingBranch} />

      <AlertDialog open={!!deletingBranchId} onOpenChange={() => setDeletingBranchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the branch and remove all user assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
