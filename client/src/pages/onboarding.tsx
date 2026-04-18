import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Coffee, UtensilsCrossed, Cake, Wine, Truck, ChevronRight,
  ChevronLeft, ShoppingBag, Cpu, ShoppingCart, BookOpen,
  Scissors, Dumbbell, Sparkles, Store, Users, CheckCircle2,
  Building2, Link, Shirt, Car, Stethoscope,
  PawPrint, Camera, Wrench, GraduationCap, Home, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useUpdateSettings } from "@/hooks/use-settings";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type Role = "owner" | "employee";
type BusinessType = "food_beverage" | "retail" | "services" | "other";
type Step = "role" | "employee_invite" | "business_type" | "business_subtype" | "store_info" | "done";

const BUSINESS_TYPES = [
  {
    id: "food_beverage" as BusinessType,
    label: "Food & Beverage",
    description: "Cafes, restaurants, bakeries",
    icon: Coffee,
    color: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-400",
    activeColor: "bg-amber-100 border-amber-400 dark:bg-amber-900/60 dark:border-amber-600",
  },
  {
    id: "retail" as BusinessType,
    label: "Retail",
    description: "Clothing, electronics, grocery",
    icon: ShoppingBag,
    color: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-400",
    activeColor: "bg-blue-100 border-blue-400 dark:bg-blue-900/60 dark:border-blue-600",
  },
  {
    id: "services" as BusinessType,
    label: "Services",
    description: "Salon, gym, laundry, spa",
    icon: Scissors,
    color: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-400",
    activeColor: "bg-rose-100 border-rose-400 dark:bg-rose-900/60 dark:border-rose-600",
  },
  {
    id: "other" as BusinessType,
    label: "Other",
    description: "Any other type of business",
    icon: Store,
    color: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-400",
    activeColor: "bg-slate-100 border-slate-400 dark:bg-slate-700/60 dark:border-slate-500",
  },
];

const SUB_TYPES: Record<BusinessType, { id: string; label: string; icon: React.ElementType }[]> = {
  food_beverage: [
    { id: "cafe", label: "Cafe / Coffee Shop", icon: Coffee },
    { id: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
    { id: "bakery", label: "Bakery", icon: Cake },
    { id: "bar", label: "Bar / Pub", icon: Wine },
    { id: "food_truck", label: "Food Truck", icon: Truck },
    { id: "other", label: "Other F&B", icon: Store },
  ],
  retail: [
    { id: "clothing", label: "Clothing / Fashion", icon: Shirt },
    { id: "electronics", label: "Electronics", icon: Cpu },
    { id: "grocery", label: "Grocery / Supermarket", icon: ShoppingCart },
    { id: "bookstore", label: "Bookstore", icon: BookOpen },
    { id: "other", label: "Other Retail", icon: Store },
  ],
  services: [
    { id: "salon", label: "Salon / Barbershop", icon: Scissors },
    { id: "gym", label: "Gym / Fitness Center", icon: Dumbbell },
    { id: "spa", label: "Spa / Wellness", icon: Sparkles },
    { id: "clinic", label: "Clinic / Healthcare", icon: Stethoscope },
    { id: "laundry", label: "Laundry / Dry Cleaning", icon: Shirt },
    { id: "car_wash", label: "Car Wash / Auto Detailing", icon: Car },
    { id: "pet_grooming", label: "Pet Grooming", icon: PawPrint },
    { id: "photography", label: "Photography / Studio", icon: Camera },
    { id: "cleaning", label: "Cleaning Service", icon: Home },
    { id: "tutoring", label: "Tutoring / Education", icon: GraduationCap },
    { id: "repair", label: "Repair & Maintenance", icon: Wrench },
    { id: "other", label: "Other Services", icon: Store },
  ],
  other: [
    { id: "other", label: "Other", icon: Store },
  ],
};

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            "rounded-full transition-all duration-300",
            i === current
              ? "w-5 h-1.5 bg-primary"
              : i < current
              ? "w-1.5 h-1.5 bg-primary/40"
              : "w-1.5 h-1.5 bg-muted-foreground/20",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<Role | null>(null);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [businessSubType, setBusinessSubType] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateSettings = useUpdateSettings();
  const { toast } = useToast();

  const SUBTYPE_LABELS: Record<string, string> = {
    cafe: "Cafe / Coffee Shop", restaurant: "Restaurant", bakery: "Bakery",
    bar: "Bar / Pub", food_truck: "Food Truck", clothing: "Clothing / Fashion",
    electronics: "Electronics", grocery: "Grocery / Supermarket", bookstore: "Bookstore",
    salon: "Salon / Barbershop", gym: "Gym / Fitness Center", spa: "Spa / Wellness",
    clinic: "Clinic / Healthcare", laundry: "Laundry / Dry Cleaning", car_wash: "Car Wash / Auto Detailing",
    pet_grooming: "Pet Grooming", photography: "Photography / Studio", cleaning: "Cleaning Service",
    tutoring: "Tutoring / Education", repair: "Repair & Maintenance", other: "Other",
  };

  const BUSINESS_TYPE_LABELS: Record<string, string> = {
    food_beverage: "Food & Beverage", retail: "Retail", services: "Services", other: "Other",
  };

  function getFeaturePreview(type: BusinessType | null, subType?: string | null): string[] {
    const offline = "Offline Mode";
    if (type === "food_beverage") {
      if (subType === "restaurant") return ["POS & Order Management", "Kitchen Display System", "Table Management", "Pending Orders Queue", offline];
      if (subType === "bar") return ["POS & Quick Orders", "Table Management", "Pending Orders Queue", "Discount Codes", offline];
      if (subType === "bakery") return ["POS & Quick Orders", "Pending Orders Queue", "Product & Menu Management", "Analytics & Reports", offline];
      if (subType === "food_truck") return ["POS & Quick Orders", "Pending Orders Queue", "Expense Tracking", "Analytics & Reports", offline];
      return ["POS & Order Management", "Pending Orders Queue", "Product & Menu Management", "Analytics & Reports", offline];
    }
    if (type === "retail") {
      if (subType === "clothing") return ["POS & Inventory Tracking", "Size & Variant Management", "Barcode / SKU Scanning", "Stock Level Alerts", offline];
      if (subType === "electronics") return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Purchase Orders & Suppliers", "Stock Level Alerts", offline];
      if (subType === "grocery") return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Purchase Orders & Suppliers", "Low Stock Alerts", offline];
      if (subType === "bookstore") return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Stock Level Alerts", "Customer Loyalty", offline];
      return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Purchase Orders & Suppliers", "Stock Level Alerts", offline];
    }
    if (type === "services") {
      if (subType === "salon") return ["Booking Calendar", "Stylist Management", "Client Profiles & History", "POS & Payments", offline];
      if (subType === "gym") return ["Membership Management", "Session & Class Booking", "Trainer Scheduling", "Courts & Studio Rooms", offline];
      if (subType === "spa") return ["Booking Calendar", "Treatment Room Management", "Membership & Packages", "Therapist Scheduling", offline];
      if (subType === "clinic" || subType === "dental") return ["Patient Appointments", "Doctor Scheduling", "Patient Records", "POS & Billing", offline];
      if (subType === "pet_grooming") return ["Grooming Appointments", "Groomer Scheduling", "Client & Pet Profiles", "POS & Payments", offline];
      if (subType === "car_wash") return ["Job Queue Management", "Staff Scheduling", "Client Profiles", "POS & Payments", offline];
      if (subType === "laundry") return ["Order Queue Management", "Staff Scheduling", "Client Profiles", "POS & Payments", offline];
      if (subType === "photography") return ["Booking Calendar", "Studio Room Management", "Client Profiles", "POS & Billing", offline];
      if (subType === "tutoring") return ["Session Scheduling", "Tutor Management", "Student Records", "POS & Payments", offline];
      if (subType === "cleaning") return ["Booking Calendar", "Team Scheduling", "Client Profiles", "POS & Payments", offline];
      if (subType === "repair") return ["Job Queue Management", "Technician Scheduling", "Client Records", "POS & Billing", offline];
      return ["Booking Calendar", "Staff & Provider Management", "Membership & Package Plans", "Room / Station Assignment", offline];
    }
    return ["POS & Order Management", "Customer Management", "Analytics & Reports", "Expenses Tracking", offline];
  }

  // Show any invite error from the auto-redemption attempt in ProtectedRouter
  useEffect(() => {
    const err = sessionStorage.getItem("invite_error");
    if (err) {
      sessionStorage.removeItem("invite_error");
      toast({ title: err, variant: "destructive" });
    }
  }, []);

  function extractToken(input: string): string {
    const trimmed = input.trim();
    try {
      const url = new URL(trimmed);
      // Invite links use ?invite=TOKEN; also support ?token=TOKEN as fallback
      return url.searchParams.get("invite") ?? url.searchParams.get("token") ?? trimmed;
    } catch {
      return trimmed;
    }
  }

  async function handleEmployeeJoin() {
    const token = extractToken(inviteInput);
    if (!token) {
      toast({ title: "Please enter your invite link", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/invite/redeem", { token });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Invalid invite");
      await updateSettings.mutateAsync({ onboardingComplete: 1 });
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      setStep("done");
    } catch (err: any) {
      toast({ title: err.message || "Could not join — check the invite link", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOwnerComplete() {
    if (!storeName.trim()) {
      toast({ title: "Please enter your store name", variant: "destructive" });
      return;
    }
    if (storeEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeEmail.trim())) {
      toast({ title: "Invalid email address", description: "Please enter a valid email or leave it blank.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await updateSettings.mutateAsync({
        businessType: businessType ?? "other",
        businessSubType: businessSubType ?? "other",
        storeName: storeName.trim(),
        address: storeAddress.trim() || null,
        phone: storePhone.trim() || null,
        emailContact: storeEmail.trim() || null,
        onboardingComplete: 1,
      });
      console.log("[onboarding] updateSettings success:", res);
      setStep("done");
    } catch (err: any) {
      console.error("[onboarding] handleOwnerComplete failed:", err);
      const message = err?.message || "Something went wrong. Please try again.";
      setSubmitError(message);
      toast({ title: "Setup failed", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDone() {
    await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    localStorage.setItem("ai_welcome_pending", JSON.stringify({
      businessType: businessType ?? "other",
      businessSubType: businessSubType ?? "other",
      storeName: storeName.trim() || "Your Store",
    }));
    setLocation("/");
  }

  const OWNER_STEPS = ["role", "business_type", "business_subtype", "store_info"];
  const ownerStepIndex = OWNER_STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50 dark:from-[#0c0c18] dark:via-[#080810] dark:to-[#100c1c] flex flex-col items-center justify-center p-4">

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <ShoppingCart className="w-6 h-6 text-white" />
        </div>
        <span className="text-xs font-bold tracking-[0.2em] text-primary/80 uppercase">ArtixPOS</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white dark:bg-[#12121e] rounded-3xl shadow-2xl shadow-black/10 dark:shadow-black/40 border border-border overflow-hidden">

        {/* ── Step: Role Selection ── */}
        {step === "role" && (
          <div className="p-6">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-foreground mb-1">Welcome!</h1>
              <p className="text-sm text-muted-foreground">Let's get you set up. Are you setting up your own store or joining a team?</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                data-testid="btn-role-owner"
                onClick={() => { setRole("owner"); setStep("business_type"); }}
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">I'm an Owner</p>
                  <p className="text-xs text-muted-foreground">Set up my store from scratch</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button
                data-testid="btn-role-employee"
                onClick={() => { setRole("employee"); setStep("employee_invite"); }}
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-border bg-muted/30 hover:bg-muted/60 hover:border-muted-foreground/30 transition-all duration-200 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-muted-foreground/20 transition-colors">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">I'm an Employee</p>
                  <p className="text-xs text-muted-foreground">Join my employer's store</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Employee Invite ── */}
        {step === "employee_invite" && (
          <div className="p-6">
            <button onClick={() => setStep("role")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="mb-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center mx-auto mb-3">
                <Link className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">Join Your Team</h2>
              <p className="text-sm text-muted-foreground">Paste the invite link your employer shared with you.</p>
              <p className="text-xs text-muted-foreground/70">Don't have an invite? Ask your employer to send you an invite link from their Admin panel.</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Invite Link or Code</Label>
                <Input
                  data-testid="input-invite-link"
                  value={inviteInput}
                  onChange={e => setInviteInput(e.target.value)}
                  placeholder="https://… or paste your invite code"
                  className="rounded-xl"
                />
              </div>
              <Button
                data-testid="btn-join-team"
                onClick={handleEmployeeJoin}
                disabled={!inviteInput.trim() || isSubmitting}
                className="w-full rounded-xl h-11"
              >
                {isSubmitting ? "Joining…" : "Join Now"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Business Type ── */}
        {step === "business_type" && (
          <div className="p-6">
            <button onClick={() => setStep("role")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-foreground">What's your business?</h2>
                <StepDots current={1} total={4} />
              </div>
              <p className="text-sm text-muted-foreground">We'll tailor ArtixPOS to fit your needs.</p>
            </div>

            {/* Warning banner */}
            <div className="flex gap-2.5 p-3 mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                <span className="font-bold">Choose carefully.</span> Your business type determines which features and modules are available in your POS — like Kitchen Display, Booking Calendar, or Barcode Scanning.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_TYPES.map(bt => {
                const Icon = bt.icon;
                const isSelected = businessType === bt.id;
                return (
                  <button
                    key={bt.id}
                    data-testid={`btn-business-${bt.id}`}
                    onClick={() => { setBusinessType(bt.id); setBusinessSubType(null); }}
                    className={[
                      "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 text-center",
                      isSelected ? bt.activeColor + " ring-2 ring-primary/20" : bt.color,
                      "hover:scale-[1.02] active:scale-[0.98]",
                    ].join(" ")}
                  >
                    <Icon className="w-7 h-7" />
                    <div>
                      <p className="font-semibold text-xs leading-tight">{bt.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{bt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              data-testid="btn-next-subtype"
              onClick={() => setStep("business_subtype")}
              disabled={!businessType}
              className="w-full rounded-xl h-11 mt-4"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Step: Business Sub-type ── */}
        {step === "business_subtype" && businessType && (
          <div className="p-6">
            <button onClick={() => setStep("business_type")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-foreground">Be more specific</h2>
                <StepDots current={2} total={4} />
              </div>
              <p className="text-sm text-muted-foreground">What best describes your business?</p>
            </div>
            <div className="flex flex-col gap-2">
              {SUB_TYPES[businessType].map(sub => {
                const Icon = sub.icon;
                const isSelected = businessSubType === sub.id;
                return (
                  <button
                    key={sub.id}
                    data-testid={`btn-subtype-${sub.id}`}
                    onClick={() => setBusinessSubType(sub.id)}
                    className={[
                      "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 text-left",
                      isSelected
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-border bg-muted/30 hover:bg-muted/60",
                    ].join(" ")}
                  >
                    <Icon className={["w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground"].join(" ")} />
                    <span className={["text-sm font-medium", isSelected ? "text-primary" : "text-foreground"].join(" ")}>{sub.label}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                );
              })}
            </div>
            <Button
              data-testid="btn-next-storeinfo"
              onClick={() => setStep("store_info")}
              disabled={!businessSubType}
              className="w-full rounded-xl h-11 mt-4"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Step: Store Info ── */}
        {step === "store_info" && (
          <div className="p-6">
            <button onClick={() => setStep("business_subtype")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-foreground">Your store details</h2>
                <StepDots current={3} total={4} />
              </div>
              <p className="text-sm text-muted-foreground">This will be set as your main branch. You can edit it anytime in Settings.</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Store Name *</Label>
                <Input
                  data-testid="input-store-name"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder="e.g. Maria's Cafe"
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Address</Label>
                <Input
                  data-testid="input-store-address"
                  value={storeAddress}
                  onChange={e => setStoreAddress(e.target.value)}
                  placeholder="123 Main St, City"
                  className="rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Phone</Label>
                  <Input
                    data-testid="input-store-phone"
                    value={storePhone}
                    onChange={e => setStorePhone(e.target.value)}
                    placeholder="+63 912 345 6789"
                    className="rounded-xl"
                    type="tel"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</Label>
                  <Input
                    data-testid="input-store-email"
                    value={storeEmail}
                    onChange={e => setStoreEmail(e.target.value)}
                    placeholder="store@email.com"
                    className="rounded-xl"
                    type="email"
                  />
                </div>
              </div>
            </div>
            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm mt-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}
            <Button
              data-testid="btn-finish-setup"
              onClick={() => {
                if (!storeName.trim()) {
                  toast({ title: "Please enter your store name", variant: "destructive" });
                  return;
                }
                if (storeEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeEmail.trim())) {
                  toast({ title: "Invalid email address", description: "Please enter a valid email or leave it blank.", variant: "destructive" });
                  return;
                }
                setSubmitError(null);
                setShowConfirm(true);
              }}
              disabled={!storeName.trim() || isSubmitting}
              className="w-full rounded-xl h-11 mt-3"
            >
              {isSubmitting ? "Saving…" : "Review & Confirm"}
            </Button>
          </div>
        )}

        {/* ── Confirmation Dialog ── */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent className="rounded-2xl max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">Everything look right?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-left">
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/50 border border-border/40">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Store</p>
                      <p className="text-sm font-bold text-foreground">{storeName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Business Type</p>
                      <p className="text-sm font-semibold text-foreground">
                        {businessSubType && businessSubType !== "other"
                          ? SUBTYPE_LABELS[businessSubType] ?? businessSubType
                          : BUSINESS_TYPE_LABELS[businessType ?? "other"]}
                        {businessType && (
                          <span className="text-muted-foreground font-normal"> · {BUSINESS_TYPE_LABELS[businessType]}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Features you'll get</p>
                    <div className="space-y-1">
                      {getFeaturePreview(businessType, businessSubType).map(f => (
                        <div key={f} className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-xs text-foreground">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground pt-1">
                    Your business type affects which features are shown. You can contact support to change it later if needed.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl" disabled={isSubmitting}>Go Back</AlertDialogCancel>
              <Button
                data-testid="btn-confirm-setup"
                onClick={() => { setShowConfirm(false); handleOwnerComplete(); }}
                disabled={isSubmitting}
                className="rounded-xl"
              >
                {isSubmitting ? "Saving…" : "Yes, let's go!"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Step: Done ── */}
        {step === "done" && (
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {role === "employee" ? "You're in!" : "You're all set!"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {role === "employee"
                ? "You've joined the team. Start taking orders right away."
                : `${storeName || "Your store"} is ready to go. Your first branch has been set as the main branch.`}
            </p>
            <Button
              data-testid="btn-go-to-dashboard"
              onClick={handleDone}
              className="w-full rounded-xl h-11"
            >
              Go to Dashboard
            </Button>
          </div>
        )}
      </div>

      {/* Footer note */}
      {step === "role" && (
        <p className="mt-6 text-xs text-muted-foreground text-center opacity-60">
          You can always change these settings later.
        </p>
      )}
    </div>
  );
}
