import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Coffee, UtensilsCrossed, Cake, Wine, Truck, ChevronRight,
  ChevronLeft, ShoppingBag, Cpu, ShoppingCart, BookOpen,
  Scissors, Dumbbell, Sparkles, Store, Users, CheckCircle2,
  Shirt, Car, Stethoscope,
  PawPrint, Camera, Wrench, GraduationCap, Home, AlertCircle,
  Search, Globe, PartyPopper, Zap, BarChart2, Shield,
  Package, WifiOff, UserCheck, Receipt, Smartphone, Check,
  Languages,
} from "lucide-react";
import i18n, { SUPPORTED_LANGUAGES, loadLocale } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUpdateSettings } from "@/hooks/use-settings";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { detectLocale, detectCountryByIP, COUNTRY_LIST, type CountryData } from "@/lib/locale-detect";

type BusinessType = "food_beverage" | "retail" | "services";
type Step = "welcome" | "business_type" | "business_subtype" | "store_info" | "done";

// ─── Static data ──────────────────────────────────────────────────────────────

const STORE_NAME_PLACEHOLDER: Record<string, string> = {
  cafe: "e.g. Maria's Cafe",
  restaurant: "e.g. Maria's Restaurant",
  bakery: "e.g. Maria's Bakery",
  bar: "e.g. The Corner Bar",
  food_truck: "e.g. Maria's Food Truck",
  pharmacy: "e.g. Maria's Pharmacy",
  drugstore: "e.g. Maria's Drugstore",
  grocery: "e.g. Maria's Grocery",
  perishable_goods: "e.g. Juan's Wet Market",
  clothing: "e.g. Maria's Boutique",
  electronics: "e.g. TechShop Electronics",
  bookstore: "e.g. Maria's Books",
  salon: "e.g. Maria's Salon",
  barbershop: "e.g. Juan's Barbershop",
  nail_salon: "e.g. Perfect Nails",
  gym: "e.g. FitLife Gym",
  spa: "e.g. Serenity Spa",
  massage: "e.g. Relax & Unwind",
  clinic: "e.g. Maria's Clinic",
  dental: "e.g. Bright Smiles Dental",
  pet_grooming: "e.g. Happy Paws Grooming",
  laundry: "e.g. Clean & Fresh Laundry",
  car_wash: "e.g. Shine Auto Wash",
  auto_repair: "e.g. Juan's Auto Shop",
  photography: "e.g. Maria's Studio",
  cleaning: "e.g. CleanPro Services",
  tutoring: "e.g. Bright Minds Tutoring",
  repair: "e.g. QuickFix Repairs",
  other: "e.g. My Business",
};

const BUSINESS_TYPES: { id: BusinessType; label: string; description: string; icon: React.ElementType; iconBg: string; iconColor: string }[] = [
  { id: "food_beverage", label: "Food & Beverage", description: "Cafes, restaurants, bakeries", icon: UtensilsCrossed, iconBg: "bg-amber-50 dark:bg-amber-950/40", iconColor: "text-amber-600 dark:text-amber-400" },
  { id: "retail",        label: "Retail",           description: "Clothing, electronics, grocery", icon: ShoppingBag,    iconBg: "bg-blue-50 dark:bg-blue-950/40",   iconColor: "text-blue-600 dark:text-blue-400" },
  { id: "services",      label: "Services",          description: "Salon, gym, laundry, spa",     icon: Scissors,       iconBg: "bg-rose-50 dark:bg-rose-950/40",   iconColor: "text-rose-600 dark:text-rose-400" },
];

const SUB_TYPES: Record<BusinessType, { id: string; label: string; icon: React.ElementType }[]> = {
  food_beverage: [
    { id: "cafe",       label: "Cafe / Coffee Shop",       icon: Coffee },
    { id: "restaurant", label: "Restaurant",               icon: UtensilsCrossed },
    { id: "bakery",     label: "Bakery",                   icon: Store },
    { id: "bar",        label: "Bar / Pub",                icon: Wine },
    { id: "food_truck", label: "Food Truck",               icon: Truck },
  ],
  retail: [
    { id: "clothing",        label: "Clothing / Fashion",         icon: Shirt },
    { id: "electronics",     label: "Electronics",                icon: Cpu },
    { id: "grocery",         label: "Grocery / Supermarket",      icon: ShoppingCart },
    { id: "pharmacy",        label: "Pharmacy / Drugstore",       icon: Stethoscope },
    { id: "perishable_goods",label: "Wet Market / Perishables",   icon: UtensilsCrossed },
    { id: "bookstore",       label: "Bookstore",                  icon: BookOpen },
  ],
  services: [
    { id: "salon",       label: "Salon / Barbershop",          icon: Scissors },
    { id: "gym",         label: "Gym / Fitness Center",        icon: Dumbbell },
    { id: "spa",         label: "Spa / Wellness",              icon: Sparkles },
    { id: "clinic",      label: "Clinic / Healthcare",         icon: Stethoscope },
    { id: "laundry",     label: "Laundry / Dry Cleaning",      icon: Shirt },
    { id: "car_wash",    label: "Car Wash / Auto Detailing",   icon: Car },
    { id: "pet_grooming",label: "Pet Grooming",                icon: PawPrint },
    { id: "photography", label: "Photography / Studio",        icon: Camera },
    { id: "cleaning",    label: "Cleaning Service",            icon: Home },
    { id: "tutoring",    label: "Tutoring / Education",        icon: GraduationCap },
    { id: "repair",      label: "Repair & Maintenance",        icon: Wrench },
  ],
};

const FREE_FEATURES: { icon: React.ElementType; label: string; desc: string }[] = [
  { icon: ShoppingCart, label: "Point of Sale",         desc: "Fast checkout with cash & card" },
  { icon: Package,      label: "Inventory Tracking",    desc: "Real-time stock management" },
  { icon: BarChart2,    label: "Sales Analytics",       desc: "Daily, weekly & monthly reports" },
  { icon: Users,        label: "Customer Management",   desc: "Profiles, history & loyalty" },
  { icon: WifiOff,      label: "Offline Mode",          desc: "Works even without internet" },
  { icon: UserCheck,    label: "Staff Accounts",        desc: "Roles & permission control" },
  { icon: Receipt,      label: "Digital Receipts",      desc: "Print or share via link" },
  { icon: Smartphone,   label: "Any Device",            desc: "Phone, tablet, or desktop" },
];

// Owner flow steps for progress tracking
const OWNER_STEPS: Step[] = ["business_type", "business_subtype", "store_info"];

// ─── Sub-components ────────────────────────────────────────────────────────────

function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {OWNER_STEPS.map((_, i) => (
        <div
          key={i}
          className={[
            "h-1.5 rounded-full transition-all duration-500",
            i === current
              ? "w-7 bg-primary"
              : i < current
              ? "w-2.5 bg-primary/40"
              : "w-2.5 bg-muted-foreground/20",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

function SectionBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-4">
      {label}
    </span>
  );
}

function CountryPicker({ value, onChange }: { value: CountryData | null; onChange: (c: CountryData) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = COUNTRY_LIST.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <button
        type="button"
        data-testid="btn-country-picker"
        onClick={() => { setOpen(true); setTimeout(() => searchRef.current?.focus(), 50); }}
        className="flex items-center gap-2 w-full h-11 px-4 rounded-xl bg-muted/60 border border-border/50 hover:border-primary/40 transition-colors text-left"
      >
        {value ? (
          <>
            <span className="text-lg leading-none">{value.flag}</span>
            <span className="flex-1 text-sm font-medium text-foreground truncate">{value.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">{value.currency}</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground flex-1">{t("onboarding.countryPicker.selectPrompt")}</span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-card rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3 border-b border-border/30">
              <p className="text-sm font-bold text-foreground mb-2">{t("onboarding.countryPicker.title")}</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("onboarding.countryPicker.searchPlaceholder")}
                  className="w-full h-9 pl-8 pr-3 rounded-xl bg-secondary/60 border border-border/30 text-sm outline-none focus:border-primary/40 transition-all"
                />
              </div>
            </div>
            <div className="overflow-y-auto py-2">
              {filtered.map(c => (
                <button
                  key={c.code}
                  type="button"
                  data-testid={`btn-country-${c.code}`}
                  onClick={() => { onChange(c); setOpen(false); setSearch(""); }}
                  className={[
                    "w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/60 transition-colors text-left",
                    value?.code === c.code ? "bg-primary/8" : "",
                  ].join(" ")}
                >
                  <span className="text-lg leading-none w-7 text-center">{c.flag}</span>
                  <span className="flex-1 text-sm font-medium text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{c.currency} · {c.phonePrefix}</span>
                  {value?.code === c.code && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>("welcome");
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [businessSubType, setBusinessSubType] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storeCountry, setStoreCountry] = useState<CountryData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const userPickedCountry = useRef(false);

  // ── Geo-detect country on mount ─────────────────────────────────────────────
  useEffect(() => {
    const locale = detectLocale();
    if (locale.countryCode) {
      const country = COUNTRY_LIST.find(c => c.code === locale.countryCode) ?? null;
      if (country) {
        setStoreCountry(country);
        setStorePhone(p => (!p ? country.phonePrefix + " " : p));
      }
    }
    detectCountryByIP().then(ipCountry => {
      if (!ipCountry || userPickedCountry.current) return;
      setStoreCountry(prev => {
        if (prev?.code === ipCountry.code) return prev;
        setStorePhone(p => {
          const old = prev?.phonePrefix ?? "";
          const isDefault = !p || p.trim() === old || p.trim() === old + " " || p.trim() === "";
          return isDefault ? ipCountry.phonePrefix + " " : p;
        });
        return ipCountry;
      });
    }).catch(() => {});
  }, []);

  function handleCountryChange(country: CountryData) {
    userPickedCountry.current = true;
    setStoreCountry(country);
    const hasPrefix = storePhone.startsWith("+");
    const curPrefix = storeCountry?.phonePrefix ?? "";
    if (!hasPrefix || !storePhone.trim() || storePhone.trim() === curPrefix || storePhone.trim() === curPrefix + " ") {
      setStorePhone(country.phonePrefix + " ");
    }
  }

  function hasPhoneDigitsBeyondPrefix(phone: string, prefix: string) {
    return phone.replace(/\D/g, "").length > prefix.replace(/\D/g, "").length;
  }

  // ── Label lookups ────────────────────────────────────────────────────────────
  const SUBTYPE_LABELS: Record<string, string> = {
    cafe: "Cafe / Coffee Shop", restaurant: "Restaurant", bakery: "Bakery",
    bar: "Bar / Pub", food_truck: "Food Truck", clothing: "Clothing / Fashion",
    electronics: "Electronics", grocery: "Grocery / Supermarket", bookstore: "Bookstore",
    salon: "Salon / Barbershop", gym: "Gym / Fitness Center", spa: "Spa / Wellness",
    clinic: "Clinic / Healthcare", laundry: "Laundry / Dry Cleaning",
    car_wash: "Car Wash / Auto Detailing", pet_grooming: "Pet Grooming",
    photography: "Photography / Studio", cleaning: "Cleaning Service",
    tutoring: "Tutoring / Education", repair: "Repair & Maintenance", other: "Other",
  };
  const BUSINESS_TYPE_LABELS: Record<string, string> = {
    food_beverage: "Food & Beverage", retail: "Retail", services: "Services",
  };

  function getFeaturePreview(type: BusinessType | null, subType?: string | null): string[] {
    const offline = "Offline Mode";
    if (type === "food_beverage") {
      if (subType === "restaurant") return ["POS & Order Management", "Kitchen Display System", "Table Management", "Pending Orders Queue", offline];
      if (subType === "bar")        return ["POS & Quick Orders", "Table Management", "Pending Orders Queue", "Discount Codes", offline];
      if (subType === "bakery")     return ["POS & Quick Orders", "Pending Orders Queue", "Product & Menu Management", "Analytics & Reports", offline];
      if (subType === "food_truck") return ["POS & Quick Orders", "Pending Orders Queue", "Expense Tracking", "Analytics & Reports", offline];
      return ["POS & Order Management", "Pending Orders Queue", "Product & Menu Management", "Analytics & Reports", offline];
    }
    if (type === "retail") {
      if (subType === "clothing")   return ["POS & Inventory Tracking", "Size & Variant Management", "Barcode / SKU Scanning", "Stock Level Alerts", offline];
      if (subType === "electronics")return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Purchase Orders & Suppliers", "Stock Level Alerts", offline];
      if (subType === "grocery")    return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Purchase Orders & Suppliers", "Low Stock Alerts", offline];
      if (subType === "bookstore")  return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Stock Level Alerts", "Customer Loyalty", offline];
      return ["POS & Inventory Tracking", "Barcode / SKU Scanning", "Purchase Orders & Suppliers", "Stock Level Alerts", offline];
    }
    if (type === "services") {
      if (subType === "salon")        return ["Booking Calendar", "Stylist Management", "Client Profiles & History", "POS & Payments", offline];
      if (subType === "gym")          return ["Membership Management", "Session & Class Booking", "Trainer Scheduling", "Courts & Studio Rooms", offline];
      if (subType === "spa")          return ["Booking Calendar", "Treatment Room Management", "Membership & Packages", "Therapist Scheduling", offline];
      if (subType === "clinic")       return ["Patient Appointments", "Doctor Scheduling", "Patient Records", "POS & Billing", offline];
      if (subType === "pet_grooming") return ["Grooming Appointments", "Groomer Scheduling", "Client & Pet Profiles", "POS & Payments", offline];
      if (subType === "car_wash")     return ["Job Queue Management", "Staff Scheduling", "Client Profiles", "POS & Payments", offline];
      if (subType === "laundry")      return ["Order Queue Management", "Staff Scheduling", "Client Profiles", "POS & Payments", offline];
      if (subType === "photography")  return ["Booking Calendar", "Studio Room Management", "Client Profiles", "POS & Billing", offline];
      if (subType === "tutoring")     return ["Session Scheduling", "Tutor Management", "Student Records", "POS & Payments", offline];
      if (subType === "cleaning")     return ["Booking Calendar", "Team Scheduling", "Client Profiles", "POS & Payments", offline];
      if (subType === "repair")       return ["Job Queue Management", "Technician Scheduling", "Client Records", "POS & Billing", offline];
      return ["Booking Calendar", "Staff & Provider Management", "Membership & Package Plans", "Room / Station Assignment", offline];
    }
    return ["POS & Order Management", "Customer Management", "Analytics & Reports", "Expenses Tracking", offline];
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleOwnerComplete() {
    if (!storeCountry)            { toast({ title: t("onboarding.storeInfo.errorCountry"),       variant: "destructive" }); return; }
    if (!storeName.trim())        { toast({ title: t("onboarding.storeInfo.errorName"),           variant: "destructive" }); return; }
    if (!storeAddress.trim())     { toast({ title: t("onboarding.storeInfo.errorAddress"),        variant: "destructive" }); return; }
    if (!hasPhoneDigitsBeyondPrefix(storePhone, storeCountry?.phonePrefix ?? ""))
                                  { toast({ title: t("onboarding.storeInfo.errorPhone"),          variant: "destructive" }); return; }
    if (!storeEmail.trim())       { toast({ title: t("onboarding.storeInfo.errorEmail"),          variant: "destructive" }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeEmail.trim()))
                                  { toast({ title: t("onboarding.storeInfo.errorEmailInvalid"),   variant: "destructive",
                                            description: t("onboarding.storeInfo.errorEmailInvalidDesc") }); return; }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await updateSettings.mutateAsync({
        businessType: businessType ?? "food_beverage",
        businessSubType: businessSubType ?? "cafe",
        storeName: storeName.trim(),
        address: storeAddress.trim() || null,
        phone: storePhone.trim() || null,
        emailContact: storeEmail.trim() || null,
        currency: storeCountry?.currency ?? null,
        timezone: storeCountry?.timezone ?? null,
        country: storeCountry?.code ?? null,
        onboardingComplete: 1,
      } as any);
      setShowConfirm(false);
      setStep("done");
    } catch (err: any) {
      console.error("[onboarding] handleOwnerComplete failed:", err);
      const msg = err?.message || t("onboarding.storeInfo.errorSomethingWrong");
      setSubmitError(msg);
      toast({ title: t("onboarding.storeInfo.errorSetupFailed"), description: msg, variant: "destructive" });
    } finally { setIsSubmitting(false); }
  }

  async function handleDone() {
    await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    localStorage.setItem("ai_welcome_pending", JSON.stringify({
      businessType: businessType ?? "food_beverage",
      businessSubType: businessSubType ?? "cafe",
      storeName: storeName.trim() || "Your Store",
    }));
    setLocation("/");
  }

  async function changeLanguage(code: string) {
    setSelectedLanguage(code);
    await loadLocale(code);
    i18n.changeLanguage(code);
  }

  const ownerProgressIndex = OWNER_STEPS.indexOf(step);
  const showProgress = ownerProgressIndex >= 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-y-auto overscroll-none flex flex-col bg-gradient-to-br from-violet-50 via-white to-blue-50 dark:from-[#0c0c18] dark:via-[#080810] dark:to-[#0a0c18]">

      {/* Ambient glow */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06] dark:opacity-[0.04] blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
      />

      {/* ── Header ── */}
      <header className="relative z-10 w-full px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/30 shrink-0">
            <ShoppingCart className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-primary-foreground" />
          </div>
          <span className="text-xs font-bold tracking-[0.15em] text-primary/80 uppercase">ArtixPOS</span>
        </div>

        {showProgress && (
          <div className="flex items-center gap-2.5">
            <StepProgress current={ownerProgressIndex} />
            <span className="text-xs text-muted-foreground hidden sm:block">
              Step {ownerProgressIndex + 1} of {OWNER_STEPS.length}
            </span>
          </div>
        )}
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-10">

        {/* ══ WELCOME ══ */}
        {step === "welcome" && (
          <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero */}
            <div className="text-center mb-8 sm:mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-primary/10 dark:bg-primary/15 mb-5 sm:mb-6">
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight mb-4">
                Welcome to ArtixPOS,<br className="hidden sm:block" /> let's get started
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-sm sm:max-w-md mx-auto leading-relaxed">
                Set up your store in minutes. Everything you need to run your business, all in one place.
              </p>
            </div>

            {/* Free-tier features grid */}
            <div className="mb-8 sm:mb-10">
              <p className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                Everything included, free
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FREE_FEATURES.map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="flex flex-col gap-2 p-3 sm:p-4 rounded-2xl bg-white dark:bg-white/5 border border-border/50 shadow-sm"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-foreground leading-snug">{label}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 hidden sm:block">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-3">
              <Button
                data-testid="btn-welcome-start"
                onClick={() => setStep("business_type")}
                size="lg"
                className="w-full sm:w-auto sm:px-12 h-12 sm:h-13 text-base font-bold rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
              >
                Start Setup <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
              <p className="text-xs text-muted-foreground/60 text-center">{t("onboarding.role.footerNote")}</p>
            </div>
          </div>
        )}

        {/* ══ BUSINESS TYPE ══ */}
        {step === "business_type" && (
          <div className="w-full max-w-xl animate-in fade-in slide-in-from-right-4 duration-400">
            <div className="text-center mb-6 sm:mb-8">
              <SectionBadge label="Business Profile" />
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
                {t("onboarding.businessType.title")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">{t("onboarding.businessType.subtitle")}</p>
            </div>

            <div className="flex gap-2.5 p-3.5 mb-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                <span className="font-bold">{t("onboarding.businessType.warningTitle")}</span>{" "}
                {t("onboarding.businessType.warningBody")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {BUSINESS_TYPES.map((bt, i) => {
                const Icon = bt.icon;
                const isSelected = businessType === bt.id;
                return (
                  <button
                    key={bt.id}
                    data-testid={`btn-business-${bt.id}`}
                    onClick={() => { setBusinessType(bt.id); setBusinessSubType(null); }}
                    style={{ animationDelay: `${i * 80}ms` }}
                    className={[
                      "group relative flex sm:flex-col items-center sm:items-start gap-4 sm:gap-0 p-5 sm:p-6 rounded-2xl sm:rounded-[24px] border-2 text-left transition-all duration-300 bg-white dark:bg-white/5",
                      isSelected
                        ? "border-primary shadow-xl shadow-primary/15 sm:-translate-y-1"
                        : "border-border/60 hover:border-primary/40 hover:shadow-md shadow-sm",
                    ].join(" ")}
                  >
                    <div className={["w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 sm:mb-4", bt.iconBg].join(" ")}>
                      <Icon className={["w-6 h-6", bt.iconColor].join(" ")} />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-foreground mb-0.5 sm:mb-1">{bt.label}</h3>
                      <p className="text-xs text-muted-foreground leading-snug">{bt.description}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 sm:mt-6 flex justify-end">
              <Button
                data-testid="btn-next-subtype"
                onClick={() => setStep("business_subtype")}
                disabled={!businessType}
                className="w-full sm:w-auto sm:px-8 h-11 sm:h-12 rounded-2xl font-bold"
              >
                {t("onboarding.businessType.continueButton")} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ══ BUSINESS SUBTYPE ══ */}
        {step === "business_subtype" && businessType && (
          <div className="w-full max-w-xl animate-in fade-in slide-in-from-right-4 duration-400">
            <div className="text-center mb-6 sm:mb-8">
              <SectionBadge label="The Details" />
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
                {t("onboarding.businessSubtype.title")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">{t("onboarding.businessSubtype.subtitle")}</p>
            </div>

            <div className="flex flex-wrap gap-2.5 justify-center max-h-[44vh] overflow-y-auto pb-2 px-1">
              {SUB_TYPES[businessType].map(sub => {
                const Icon = sub.icon;
                const isSelected = businessSubType === sub.id;
                return (
                  <button
                    key={sub.id}
                    data-testid={`btn-subtype-${sub.id}`}
                    onClick={() => setBusinessSubType(sub.id)}
                    className={[
                      "flex items-center gap-2 px-4 py-3 rounded-2xl border-2 font-medium text-sm transition-all duration-200 whitespace-nowrap",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                        : "border-border/60 bg-white dark:bg-white/5 text-foreground hover:border-primary/40 shadow-sm",
                    ].join(" ")}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {sub.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 sm:mt-6 flex justify-end">
              <Button
                data-testid="btn-next-storeinfo"
                onClick={() => setStep("store_info")}
                disabled={!businessSubType}
                className="w-full sm:w-auto sm:px-8 h-11 sm:h-12 rounded-2xl font-bold"
              >
                {t("onboarding.businessSubtype.continueButton")} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ══ STORE INFO ══ */}
        {step === "store_info" && (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-right-4 duration-400">
            <div className="text-center mb-6 sm:mb-8">
              <SectionBadge label="Almost Done" />
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mb-2">
                {t("onboarding.storeInfo.title")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">{t("onboarding.storeInfo.subtitle")}</p>
            </div>

            <div className="bg-white dark:bg-white/5 rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm p-5 sm:p-6 space-y-4">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("onboarding.storeInfo.countryLabel")} *</Label>
                <CountryPicker value={storeCountry} onChange={handleCountryChange} />
                {storeCountry && (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="font-medium text-foreground">{storeCountry.currency}</span> {t("onboarding.countryPicker.currency")} ·
                    <span className="font-medium text-foreground">{storeCountry.timezone}</span>
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("onboarding.storeInfo.storeNameLabel")} *</Label>
                <Input
                  data-testid="input-store-name"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder={STORE_NAME_PLACEHOLDER[businessSubType ?? ""] ?? "e.g. My Business"}
                  className="rounded-xl h-11"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("onboarding.storeInfo.addressLabel")} *</Label>
                <Input
                  data-testid="input-store-address"
                  value={storeAddress}
                  onChange={e => setStoreAddress(e.target.value)}
                  placeholder={t("onboarding.storeInfo.addressPlaceholder")}
                  className="rounded-xl h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("onboarding.storeInfo.phoneLabel")} *</Label>
                  <Input
                    data-testid="input-store-phone"
                    value={storePhone}
                    onChange={e => setStorePhone(e.target.value)}
                    placeholder={storeCountry ? `${storeCountry.phonePrefix} 912 345 6789` : "+63 912 345 6789"}
                    className="rounded-xl h-11"
                    type="tel"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("onboarding.storeInfo.emailLabel")} *</Label>
                  <Input
                    data-testid="input-store-email"
                    value={storeEmail}
                    onChange={e => setStoreEmail(e.target.value)}
                    placeholder={t("onboarding.storeInfo.emailPlaceholder")}
                    className="rounded-xl h-11"
                    type="email"
                  />
                </div>
              </div>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm mt-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="mt-4 sm:mt-5 flex justify-end">
              <Button
                data-testid="btn-finish-setup"
                onClick={() => {
                  if (!storeCountry)        { toast({ title: t("onboarding.storeInfo.errorCountry"),     variant: "destructive" }); return; }
                  if (!storeName.trim())    { toast({ title: t("onboarding.storeInfo.errorName"),         variant: "destructive" }); return; }
                  if (!storeAddress.trim()) { toast({ title: t("onboarding.storeInfo.errorAddress"),      variant: "destructive" }); return; }
                  if (!hasPhoneDigitsBeyondPrefix(storePhone, storeCountry?.phonePrefix ?? ""))
                                            { toast({ title: t("onboarding.storeInfo.errorPhone"),        variant: "destructive" }); return; }
                  if (!storeEmail.trim())   { toast({ title: t("onboarding.storeInfo.errorEmail"),        variant: "destructive" }); return; }
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeEmail.trim()))
                                            { toast({ title: t("onboarding.storeInfo.errorEmailInvalid"), description: t("onboarding.storeInfo.errorEmailInvalidDesc"), variant: "destructive" }); return; }
                  setSubmitError(null);
                  setShowConfirm(true);
                }}
                disabled={isSubmitting}
                className="w-full sm:w-auto sm:px-8 h-11 sm:h-12 rounded-2xl font-bold"
              >
                {isSubmitting ? t("onboarding.storeInfo.saving") : t("onboarding.storeInfo.reviewButton")}
              </Button>
            </div>
          </div>
        )}

        {/* ══ DONE (with language picker) ══ */}
        {step === "done" && (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Celebration */}
            <div className="text-center mb-7 sm:mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary to-primary/70 mb-5 shadow-xl shadow-primary/25">
                <PartyPopper className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-2">
                {t("onboarding.done.ownerTitle")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {storeName
                  ? `${storeName} ${t("onboarding.done.ownerSubtitle")}`
                  : t("onboarding.done.ownerSubtitleFallback")}
              </p>
            </div>

            {/* Setup confirmation card */}
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-white/5 border border-border/50 shadow-sm mb-6">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Store Created</p>
                <p className="text-xs text-muted-foreground">Dashboard & all features unlocked</p>
              </div>
            </div>

            {/* Language picker */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Languages className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">{t("onboarding.language.title")}</p>
                <span className="ml-auto text-xs text-muted-foreground">{t("onboarding.language.subtitle")}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto">
                {SUPPORTED_LANGUAGES.map(lang => {
                  const isSelected = selectedLanguage === lang.code;
                  return (
                    <button
                      key={lang.code}
                      data-testid={`btn-lang-${lang.code}`}
                      onClick={() => changeLanguage(lang.code)}
                      className={[
                        "relative flex flex-col items-start px-3.5 py-3 rounded-xl border-2 transition-all duration-200 text-left",
                        isSelected
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-border/50 bg-white dark:bg-white/5 hover:border-primary/30",
                      ].join(" ")}
                    >
                      <span className={["text-xs sm:text-sm font-semibold leading-tight", isSelected ? "text-primary" : "text-foreground"].join(" ")}>
                        {lang.nativeName}
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{lang.name}</span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              data-testid="btn-go-to-dashboard"
              onClick={handleDone}
              size="lg"
              className="w-full h-12 rounded-2xl font-bold shadow-lg shadow-primary/20"
            >
              {t("onboarding.done.dashboardButton")} <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        )}
      </main>

      {/* ── Back button footer ── */}
      {["business_type", "business_subtype", "store_info"].includes(step) && (
        <footer className="relative z-10 w-full px-5 sm:px-8 pb-5 sm:pb-6 pt-1">
          <div className="max-w-xl mx-auto">
            <button
              onClick={() => {
                if (step === "business_type")         setStep("welcome");
                else if (step === "business_subtype") setStep("business_type");
                else if (step === "store_info")       setStep("business_subtype");
              }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-white/70 dark:hover:bg-white/5"
            >
              <ChevronLeft className="w-4 h-4" /> {t("common.back")}
            </button>
          </div>
        </footer>
      )}

      {/* ── Confirmation dialog ── */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="rounded-2xl max-w-sm mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">{t("onboarding.confirmDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <div className="space-y-2 p-3 rounded-xl bg-muted/50 border border-border/40">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("onboarding.confirmDialog.storeLabel")}</p>
                    <p className="text-sm font-bold text-foreground">{storeName}</p>
                  </div>
                  {storeCountry && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("onboarding.confirmDialog.countryLabel")}</p>
                      <p className="text-sm font-semibold text-foreground">
                        {storeCountry.flag} {storeCountry.name}
                        <span className="text-muted-foreground font-normal"> · {storeCountry.currency}</span>
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("onboarding.confirmDialog.businessTypeLabel")}</p>
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
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("onboarding.confirmDialog.featuresLabel")}</p>
                  <div className="space-y-1.5">
                    {getFeaturePreview(businessType, businessSubType).map(f => (
                      <div key={f} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-xs text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">{t("onboarding.confirmDialog.changeNote")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isSubmitting}>{t("onboarding.confirmDialog.goBack")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="btn-confirm-setup"
              onClick={e => { e.preventDefault(); handleOwnerComplete(); }}
              disabled={isSubmitting}
              className="rounded-xl"
            >
              {isSubmitting ? t("onboarding.confirmDialog.saving") : t("onboarding.confirmDialog.confirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
