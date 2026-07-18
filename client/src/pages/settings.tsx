import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import i18n, { SUPPORTED_LANGUAGES } from "@/i18n";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type InsertUserSetting } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Save,
  LogOut,
  Trash2,
  CreditCard,
  Plus,
  X,
  Banknote,
  ChevronRight,
  Globe,
  Check,
  Sun,
  Moon,
  Monitor,
  Store,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Palette,
  Shield,
  BadgeCheck,
  Bell,
  BellOff,
  Search,
  Zap,
  HelpCircle,
  ShoppingCart,
  LayoutDashboard,
  Package,
  Boxes,
  Users,
  Gift,
  IdCard,
  Calendar,
  UserCheck,
  Clock,
  Wallet,
  Receipt,
  TrendingUp,
  Tag,
  RotateCcw,
  LayoutGrid,
  ChefHat,
  Truck,
  ClipboardList,
  FileBarChart,
  Building2,
  AlarmClock,
  Wifi,
  ChevronDown,
} from "lucide-react";
import { COUNTRY_LIST, type CountryData } from "@/lib/locale-detect";
import type { ThemeMode } from "@/lib/theme";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, clearNativeToken } from "@/lib/queryClient";
import { clearAllCache } from "@/lib/offline-db";
import { useLocation } from "wouter";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  food_beverage: "Food & Beverage",
  retail: "Retail",
  services: "Services",
  other: "Other",
};

const SUBTYPE_LABELS: Record<string, string> = {
  cafe: "Cafe / Coffee Shop",
  restaurant: "Restaurant",
  bakery: "Bakery",
  bar: "Bar / Pub",
  food_truck: "Food Truck",
  clothing: "Clothing / Fashion",
  electronics: "Electronics",
  grocery: "Grocery / Supermarket",
  bookstore: "Bookstore",
  salon: "Salon / Barbershop",
  gym: "Gym / Fitness Center",
  spa: "Spa / Wellness",
  clinic: "Clinic / Healthcare",
  laundry: "Laundry / Dry Cleaning",
  car_wash: "Car Wash / Auto Detailing",
  pet_grooming: "Pet Grooming",
  photography: "Photography / Studio",
  cleaning: "Cleaning Service",
  tutoring: "Tutoring / Education",
  repair: "Repair & Maintenance",
  other: "Other",
};

const CURRENCIES = [
  { code: "₱", label: "Philippine Peso (₱)" },
  { code: "$", label: "US Dollar ($)" },
  { code: "€", label: "Euro (€)" },
  { code: "£", label: "British Pound (£)" },
  { code: "¥", label: "Japanese Yen (¥)" },
  { code: "₩", label: "Korean Won (₩)" },
  { code: "฿", label: "Thai Baht (฿)" },
  { code: "Rp", label: "Indonesian Rupiah (Rp)" },
  { code: "RM", label: "Malaysian Ringgit (RM)" },
  { code: "S$", label: "Singapore Dollar (S$)" },
  { code: "₹", label: "Indian Rupee (₹)" },
  { code: "د.إ", label: "UAE Dirham (د.إ)" },
  { code: "﷼", label: "Saudi Riyal (﷼)" },
  { code: "kr", label: "Swedish Krona (kr)" },
  { code: "Fr", label: "Swiss Franc (Fr)" },
  { code: "R$", label: "Brazilian Real (R$)" },
  { code: "A$", label: "Australian Dollar (A$)" },
  { code: "C$", label: "Canadian Dollar (C$)" },
  { code: "MXN", label: "Mexican Peso (MXN)" },
  { code: "ZAR", label: "South African Rand (ZAR)" },
];

const settingsSchema = z.object({
  storeName: z.string().min(1, "Store name is required"),
  taxRate: z
    .string()
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, { message: "Must be 0 or greater" }),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  emailContact: z.union([z.string().email("Enter a valid email"), z.literal(""), z.undefined()]),
  currency: z.string().optional().or(z.literal("")),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

function SectionLabel({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground/60" />}
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
        {children}
      </p>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  icon: Icon,
  iconColor,
  children,
}: {
  label: string;
  hint?: string;
  icon?: React.ElementType;
  iconColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/20 last:border-0">
      <div className="flex items-start gap-3 shrink-0 flex-1 min-w-0">
        {Icon && (
          <div
            className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconColor ?? "bg-muted/60"}`}
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground leading-none">{label}</p>
          {hint && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
        </div>
      </div>
      <div className="min-w-0 shrink-0 max-w-[52%]">{children}</div>
    </div>
  );
}

const LANG_COUNTRY: Record<string, string> = {
  en: "gb",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "br",
  it: "it",
  nl: "nl",
  ru: "ru",
  tr: "tr",
  ar: "sa",
  hi: "in",
  zh: "cn",
  ja: "jp",
  ko: "kr",
  th: "th",
  vi: "vn",
  id: "id",
  ms: "my",
  tl: "ph",
};

export default function Settings() {
  const { t, i18n: _i18nInstance } = useTranslation();
  const [currentLang, setCurrentLang] = useState(i18n.language || "en");
  const { data: settings, isLoading: _isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const { user, logout, isLoggingOut } = useAuth();
  const { isPro, isBusiness } = useSubscription();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    permission: pushPermission,
    isLoading: pushLoading,
    error: pushError,
    subscribe: pushSubscribe,
    unsubscribe: pushUnsubscribe,
  } = usePushNotifications();

  // Show a toast when push subscribe fails
  useEffect(() => {
    if (pushError) toast({ title: pushError, variant: "destructive" });
  }, [pushError]);

  const isManagerOrAbove = user?.role === "owner" || user?.role === "manager";

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showPaymentManager, setShowPaymentManager] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langSearch, setLangSearch] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [expandedHelp, setExpandedHelp] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const countrySearchRef = useRef<HTMLInputElement>(null);
  const [currentCountry, setCurrentCountry] = useState<CountryData | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") return "dark";
    if (stored === "light") return "light";
    return "system";
  });

  const applyTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    // Import and call the shared utility so transitions are consistent
    import("@/lib/theme").then(({ applyTheme: apply }) => apply(mode));
  };

  const DEFAULT_METHODS = [
    { id: "cash", label: "Cash", isCash: true },
    { id: "card", label: "Card", isCash: false },
    { id: "ewallet", label: "E-Wallet", isCash: false },
  ];

  type PaymentMethod = { id: string; label: string; isCash: boolean };
  const [pmethods, setPmethods] = useState<PaymentMethod[]>([]);
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodIsCash, setNewMethodIsCash] = useState(false);
  const [savingMethods] = useState(false);

  const isOwner = user?.role === "owner";

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE" || isDeleting) return;
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", "/api/auth/account");
      clearNativeToken();
      try {
        await clearAllCache();
      } catch {}
      queryClient.clear();
      window.location.href = "/login";
    } catch {
      toast({
        title: "Failed to delete account",
        description: "Please try again.",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      storeName: "",
      taxRate: "0",
      address: "",
      phone: "",
      emailContact: "",
      currency: "₱",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        storeName: (settings as any).storeName || "",
        taxRate: (settings as any).taxRate || "0",
        address: (settings as any).address || "",
        phone: (settings as any).phone || "",
        emailContact: (settings as any).emailContact || "",
        currency: (settings as any).currency || "₱",
      });
      const savedCountry = (settings as any).country;
      if (savedCountry) {
        const found = COUNTRY_LIST.find((c) => c.code === savedCountry) ?? null;
        if (found) setCurrentCountry(found);
      }
      const saved = (settings as any).paymentMethods;
      setPmethods(saved?.length ? saved : DEFAULT_METHODS);
    }
  }, [settings, form]);

  const savePaymentMethods = (updated: PaymentMethod[]) => {
    updateSettings.mutate({ paymentMethods: updated } as any, {
      onSuccess: () => toast({ title: "Payment methods saved" }),
      onError: () => toast({ title: "Saved locally — will sync when online" }),
    });
  };

  const addPaymentMethod = () => {
    const label = newMethodName.trim();
    if (!label || savingMethods) return;
    const id = label
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    if (pmethods.find((m) => m.id === id)) {
      toast({ title: "Method already exists", variant: "destructive" });
      return;
    }
    const updated = [...pmethods, { id, label, isCash: newMethodIsCash }];
    setPmethods(updated);
    savePaymentMethods(updated);
    setNewMethodName("");
    setNewMethodIsCash(false);
  };

  const deletePaymentMethod = (id: string) => {
    if (pmethods.length <= 1) {
      toast({ title: "At least one payment method required", variant: "destructive" });
      return;
    }
    const updated = pmethods.filter((m) => m.id !== id);
    setPmethods(updated);
    savePaymentMethods(updated);
  };

  const togglePaymentCash = (id: string) => {
    const updated = pmethods.map((m) => (m.id === id ? { ...m, isCash: !m.isCash } : m));
    setPmethods(updated);
    savePaymentMethods(updated);
  };

  const showErrorToast = (err: unknown) => {
    const e = err as any;
    const pg = e?.pgError;
    const lines: string[] = [];
    if (e?.message) lines.push(e.message);
    if (pg?.code) lines.push(`Code: ${pg.code}`);
    if (pg?.detail) lines.push(`Detail: ${pg.detail}`);
    if (pg?.hint) lines.push(`Hint: ${pg.hint}`);
    if (pg?.table) lines.push(`Table: ${pg.table}`);
    if (pg?.column) lines.push(`Column: ${pg.column}`);
    if (pg?.constraint) lines.push(`Constraint: ${pg.constraint}`);
    const full = lines.join(" | ");
    navigator.clipboard?.writeText(full).catch(() => {});
    toast({
      title: "Failed to save settings",
      description: full,
      variant: "destructive",
      duration: 15000,
    });
  };

  const onSubmit = (data: SettingsFormData) => {
    const payload: Partial<InsertUserSetting> & { country?: string | null } = {
      storeName: data.storeName,
      taxRate: data.taxRate,
      address: data.address,
      phone: data.phone,
      emailContact: data.emailContact,
      currency: data.currency,
      country: currentCountry?.code ?? null,
    };
    updateSettings.mutate(payload as any, {
      onSuccess: () => {
        toast({ title: "Settings saved" });

        queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      },
      onError: showErrorToast,
    });
  };

  const handleLanguageChange = (code: string) => {
    setCurrentLang(code);
    i18n.changeLanguage(code);
    localStorage.setItem("artixpos_language", code);
  };

  const businessSubType = user?.activeBranch?.businessSubType ?? (settings as any)?.businessSubType;
  const businessType = user?.activeBranch?.businessType ?? (settings as any)?.businessType;
  const businessLabel =
    businessSubType && businessSubType !== "other"
      ? (SUBTYPE_LABELS[businessSubType] ?? businessSubType)
      : (BUSINESS_TYPE_LABELS[businessType] ?? businessType);

  return (
    <div className="page-enter space-y-0.5">
      <SectionLabel icon={Palette}>Appearance</SectionLabel>
      <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
        {}
        <div className="px-4 py-3.5 border-b border-border/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Choose how the interface looks
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 bg-secondary/50 rounded-xl p-1">
            {[
              { mode: "light" as const, icon: Sun, label: "Light" },
              { mode: "dark" as const, icon: Moon, label: "Dark" },
              { mode: "system" as const, icon: Monitor, label: "System" },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => applyTheme(mode)}
                data-testid={`button-theme-${mode}`}
                className={[
                  "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
                  themeMode === mode
                    ? "bg-card shadow-sm text-foreground border border-border/30"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {}
        <button
          onClick={() => setShowLangPicker(true)}
          data-testid="button-language-picker"
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 transition-colors active:bg-secondary/60"
        >
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Globe className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground leading-none">
                {t("settings.chooseLanguage")}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                {LANG_COUNTRY[currentLang] && (
                  <img
                    src={`https://flagcdn.com/w20/${LANG_COUNTRY[currentLang]}.png`}
                    srcSet={`https://flagcdn.com/w40/${LANG_COUNTRY[currentLang]}.png 2x`}
                    alt=""
                    className="rounded-sm object-cover shrink-0"
                    style={{ width: "16px", height: "12px" }}
                  />
                )}
                {SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.nativeName}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </button>
      </div>

      <Dialog
        open={showLangPicker}
        onOpenChange={(open) => {
          setShowLangPicker(open);
          if (!open) setLangSearch("");
        }}
      >
        <DialogContent className="sm:max-w-[420px] max-w-[calc(100vw-32px)] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden max-h-[85vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle className="text-lg font-black">
                {t("settings.chooseLanguage")}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-4 pb-3 shrink-0">
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
              <input
                type="text"
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                placeholder="Search language..."
                data-testid="input-language-search"
                className="w-full h-10 pl-10 pr-4 rounded-2xl bg-secondary/60 border border-border/30 text-sm outline-none focus:border-primary/40 focus:bg-secondary/80 transition-all placeholder:text-muted-foreground/40 font-medium"
              />
            </div>
          </div>
          <div className="overflow-y-auto px-4 pb-6 space-y-1.5">
            {(() => {
              const q = langSearch.toLowerCase();
              const filtered = SUPPORTED_LANGUAGES.filter(
                (lang) =>
                  !q ||
                  lang.name.toLowerCase().includes(q) ||
                  lang.nativeName.toLowerCase().includes(q) ||
                  lang.code.includes(q),
              );
              if (filtered.length === 0)
                return (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 gap-2">
                    <Globe className="h-8 w-8" strokeWidth={1.2} />
                    <p className="text-sm font-medium">No languages found</p>
                  </div>
                );
              return filtered.map((lang) => {
                const isSelected = currentLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    data-testid={`button-lang-${lang.code}`}
                    onClick={() => {
                      handleLanguageChange(lang.code);
                      setShowLangPicker(false);
                      setLangSearch("");
                    }}
                    className={[
                      "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-all text-left",
                      isSelected
                        ? "bg-primary/8 border-primary/30 shadow-sm shadow-primary/10"
                        : "bg-secondary/40 border-transparent hover:bg-secondary/70 hover:border-border/30 active:scale-[0.99]",
                    ].join(" ")}
                  >
                    <img
                      src={`https://flagcdn.com/w20/${LANG_COUNTRY[lang.code] ?? "un"}.png`}
                      srcSet={`https://flagcdn.com/w40/${LANG_COUNTRY[lang.code] ?? "un"}.png 2x`}
                      alt=""
                      className="rounded-sm object-cover shrink-0"
                      style={{ width: "24px", height: "18px" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={[
                          "text-sm font-semibold leading-none",
                          isSelected ? "text-primary" : "text-foreground",
                        ].join(" ")}
                      >
                        {lang.nativeName}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{lang.name}</p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCountryPicker}
        onOpenChange={(open) => {
          setShowCountryPicker(open);
          if (!open) setCountrySearch("");
        }}
      >
        <DialogContent className="sm:max-w-[420px] max-w-[calc(100vw-32px)] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden max-h-[85vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-sky-500/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-sky-500" />
              </div>
              <DialogTitle className="text-lg font-black">Select Country</DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-4 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
              <input
                ref={countrySearchRef}
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Search country..."
                data-testid="input-country-search"
                className="w-full h-10 pl-10 pr-4 rounded-2xl bg-secondary/60 border border-border/30 text-sm outline-none focus:border-primary/40 focus:bg-secondary/80 transition-all placeholder:text-muted-foreground/40 font-medium"
              />
            </div>
          </div>
          <div className="overflow-y-auto px-4 pb-6 space-y-1.5">
            {(() => {
              const q = countrySearch.toLowerCase();
              const filtered = COUNTRY_LIST.filter(
                (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
              );
              if (filtered.length === 0)
                return (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 gap-2">
                    <Globe className="h-8 w-8" strokeWidth={1.2} />
                    <p className="text-sm font-medium">No countries found</p>
                  </div>
                );
              return filtered.map((c) => {
                const isSelected = currentCountry?.code === c.code;
                return (
                  <button
                    key={c.code}
                    data-testid={`button-country-${c.code}`}
                    onClick={() => {
                      setCurrentCountry(c);

                      form.setValue("currency", c.currency);
                      setShowCountryPicker(false);
                      setCountrySearch("");
                    }}
                    className={[
                      "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-all text-left",
                      isSelected
                        ? "bg-primary/8 border-primary/30 shadow-sm shadow-primary/10"
                        : "bg-secondary/40 border-transparent hover:bg-secondary/70 hover:border-border/30 active:scale-[0.99]",
                    ].join(" ")}
                  >
                    <img
                      src={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png`}
                      srcSet={`https://flagcdn.com/w80/${c.code.toLowerCase()}.png 2x`}
                      alt={c.code}
                      className="w-7 h-5 object-cover rounded-[3px] shrink-0 shadow-sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={[
                          "text-sm font-semibold leading-none",
                          isSelected ? "text-primary" : "text-foreground",
                        ].join(" ")}
                      >
                        {c.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {c.currency} · {c.phonePrefix} · {c.timezone}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {isOwner && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {}
            <SectionLabel icon={Store}>Store</SectionLabel>
            <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
              <SettingRow label="Store Name" icon={Store} iconColor="bg-primary/10">
                <FormField
                  control={form.control}
                  name="storeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                          placeholder="Store name"
                          data-testid="input-store-name"
                        />
                      </FormControl>
                      <FormMessage className="text-right text-[10px]" />
                    </FormItem>
                  )}
                />
              </SettingRow>

              {businessLabel && (
                <div className="flex items-center justify-between gap-3 py-3 border-b border-border/20">
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Business Type</p>
                  </div>
                  <span className="text-[11px] font-medium bg-secondary px-2.5 py-1 rounded-full text-muted-foreground truncate max-w-[52%] text-right">
                    {businessLabel}
                  </span>
                </div>
              )}

              {}
              <button
                type="button"
                data-testid="button-country-picker"
                onClick={() => {
                  setShowCountryPicker(true);
                  setTimeout(() => countrySearchRef.current?.focus(), 50);
                }}
                className="w-full flex items-center justify-between gap-3 py-3 border-b border-border/20 hover:bg-secondary/30 transition-colors -mx-4 px-4"
              >
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Globe className="h-3.5 w-3.5 text-sky-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground leading-none">Country</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Sets default currency &amp; timezone
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {currentCountry ? (
                    <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <img
                        src={`https://flagcdn.com/w40/${currentCountry.code.toLowerCase()}.png`}
                        srcSet={`https://flagcdn.com/w80/${currentCountry.code.toLowerCase()}.png 2x`}
                        alt={currentCountry.code}
                        className="w-6 h-4 object-cover rounded-[3px] shrink-0 shadow-sm"
                      />
                      <span>{currentCountry.name}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Not set</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              </button>

              <SettingRow
                label="Tax Rate"
                hint="Applied at checkout"
                icon={DollarSign}
                iconColor="bg-emerald-500/10"
              >
                <FormField
                  control={form.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...field}
                            value={field.value || "0"}
                            className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-7"
                            data-testid="input-tax-rate"
                          />
                        </FormControl>
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          %
                        </span>
                      </div>
                      <FormMessage className="text-right text-[10px]" />
                    </FormItem>
                  )}
                />
              </SettingRow>

              <SettingRow
                label="Currency"
                hint="Symbol on receipts & reports"
                icon={DollarSign}
                iconColor="bg-amber-500/10"
              >
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <Select value={field.value || "₱"} onValueChange={field.onChange}>
                        <SelectTrigger
                          className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right"
                          data-testid="select-currency"
                        >
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code} className="text-sm">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </SettingRow>
            </div>

            {}
            <SectionLabel icon={Phone}>Contact</SectionLabel>
            <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
              <SettingRow label="Address" icon={MapPin} iconColor="bg-rose-500/10">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          className="text-sm rounded-lg bg-secondary/60 border-none resize-none text-right min-h-[56px] py-1.5 pr-3"
                          rows={2}
                          placeholder="Store address"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </SettingRow>

              <SettingRow label="Phone" icon={Phone} iconColor="bg-sky-500/10">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                          placeholder="+63 912 345 6789"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </SettingRow>

              <SettingRow label="Email" icon={Mail} iconColor="bg-violet-500/10">
                <FormField
                  control={form.control}
                  name="emailContact"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          value={field.value || ""}
                          className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                          placeholder="hello@store.com"
                        />
                      </FormControl>
                      <FormMessage className="text-right text-[10px]" />
                    </FormItem>
                  )}
                />
              </SettingRow>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-semibold mt-3 bg-primary text-white shadow-md shadow-primary/20 hover:opacity-90 transition-all"
              disabled={updateSettings.isPending}
              data-testid="button-save-settings"
            >
              {updateSettings.isPending ? (
                "Saving…"
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Save Changes
                </>
              )}
            </Button>
          </form>
        </Form>
      )}

      <SectionLabel icon={Zap}>POS Setup</SectionLabel>
      <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setLocation("/features")}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors text-left"
        >
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">POS Features</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Turn features on or off — tables, delivery, loyalty &amp; more
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </button>
      </div>

      {isOwner && (
        <>
          <SectionLabel icon={Tag}>Subscription</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            {isPro ? (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Check className="h-3.5 w-3.5 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    {isBusiness ? "Business Suite Active" : "Pro Plan Active"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isBusiness
                      ? "All features unlocked · up to 10 branches"
                      : "All features unlocked"}
                  </p>
                </div>
                <span className="text-[10px] font-medium border border-violet-500/35 text-violet-500 dark:text-violet-400 px-2 py-0.5 rounded tracking-widest">
                  ACTIVE
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLocation("/billing?reason=pro_required")}
                className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors text-left"
              >
                <div className="h-7 w-7 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Upgrade to Pro</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Unlock WiFi vouchers, advanced reports & more
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1" />
              </button>
            )}
          </div>

          <SectionLabel icon={CreditCard}>Checkout</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowPaymentManager((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors"
              data-testid="button-open-payment-methods"
            >
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Payment Methods</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {pmethods.length} method{pmethods.length !== 1 ? "s" : ""} configured
                  </p>
                </div>
              </div>
              <ChevronRight
                className={[
                  "h-4 w-4 text-muted-foreground/40 transition-transform duration-200",
                  showPaymentManager ? "rotate-90" : "",
                ].join(" ")}
              />
            </button>

            {showPaymentManager && (
              <div className="border-t border-border/20 px-4 py-3 space-y-2">
                {pmethods.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 bg-secondary/30 rounded-xl px-3 py-2"
                  >
                    <span className="flex-1 text-sm font-medium">{m.label}</span>
                    <button
                      data-testid={`toggle-cash-${m.id}`}
                      onClick={() => togglePaymentCash(m.id)}
                      className={[
                        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors",
                        m.isCash
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-secondary text-muted-foreground",
                      ].join(" ")}
                    >
                      <Banknote className="h-3 w-3" />
                      {m.isCash ? "Cash" : "Digital"}
                    </button>
                    <button
                      data-testid={`button-delete-method-${m.id}`}
                      onClick={() => deletePaymentMethod(m.id)}
                      disabled={savingMethods}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-destructive rounded transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 pt-1.5 border-t border-border/15">
                  <Input
                    value={newMethodName}
                    onChange={(e) => setNewMethodName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPaymentMethod()}
                    placeholder="New method name..."
                    className="h-8 text-sm rounded-lg bg-secondary/60 border-none flex-1"
                    data-testid="input-new-payment-method"
                  />
                  <button
                    data-testid="toggle-new-method-cash"
                    onClick={() => setNewMethodIsCash((v) => !v)}
                    className={[
                      "flex items-center gap-1 px-2.5 rounded-lg text-[10px] font-bold border transition-colors shrink-0",
                      newMethodIsCash
                        ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
                        : "bg-secondary text-muted-foreground border-border/40",
                    ].join(" ")}
                  >
                    <Banknote className="h-3 w-3" />
                    {newMethodIsCash ? "Cash" : "Digital"}
                  </button>
                  <Button
                    onClick={addPaymentMethod}
                    disabled={!newMethodName.trim() || savingMethods}
                    size="sm"
                    className="h-8 px-2.5 rounded-lg"
                    data-testid="button-add-payment-method"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <SectionLabel icon={Bell}>Notifications</SectionLabel>
      <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden px-4 py-1">
        {pushSupported ? (
          <SettingRow
            label="Push Notifications"
            hint={
              pushError
                ? pushError
                : pushPermission === "denied"
                  ? "Blocked by your browser — update site permissions to enable"
                  : pushSubscribed
                    ? "You'll be alerted for new orders and low stock, even when the app is closed"
                    : "Get alerted for new orders and low stock, even when the app is closed"
            }
            icon={pushSubscribed ? Bell : BellOff}
            iconColor={pushSubscribed ? "bg-violet-100 dark:bg-violet-900/30" : "bg-muted/60"}
          >
            <button
              data-testid="toggle-push-notifications"
              onClick={() => {
                if (pushSubscribed) {
                  pushUnsubscribe();
                } else {
                  pushSubscribe();
                }
              }}
              disabled={pushLoading || pushPermission === "denied"}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                "transition-colors duration-200 ease-in-out focus:outline-none",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                pushSubscribed
                  ? "bg-violet-600 dark:bg-violet-500"
                  : "bg-slate-200 dark:bg-white/10",
              ].join(" ")}
              role="switch"
              aria-checked={pushSubscribed}
            >
              <span
                className={[
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm",
                  "transform transition duration-200 ease-in-out",
                  pushSubscribed ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </button>
          </SettingRow>
        ) : (
          <div className="py-3 flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
              <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Push notifications are not supported in this browser or environment.
            </p>
          </div>
        )}
        <button
          onClick={() => setLocation("/settings/notifications")}
          data-testid="button-notification-preferences"
          className="w-full flex items-center gap-3 py-3 text-sm hover:bg-muted/30 transition-colors -mx-4 px-4"
        >
          <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-medium">Notification Preferences</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Choose which alert categories you receive
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </button>
      </div>

      <SectionLabel icon={Shield}>Account</SectionLabel>
      <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
        {user && (
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border/20">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name ?? ""}
                className="h-10 w-10 rounded-full object-cover shrink-0 ring-2 ring-border/20"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shrink-0 shadow-md">
                <span className="text-sm font-bold text-white">
                  {(user.name ?? "?")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate leading-none">{user.name ?? "User"}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {user.email ?? `via ${user.provider}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-medium text-muted-foreground capitalize">
                {user.role}
              </span>
              {isPro && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-500 dark:text-violet-400 whitespace-nowrap">
                  {isBusiness ? "Business" : "Pro"}
                </span>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setShowHelp(true);
            setHelpSearch("");
            setExpandedHelp(null);
          }}
          data-testid="button-help"
          className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-muted/30 transition-colors border-b border-border/20"
        >
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-medium">Help Center</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              How to set up and use each feature
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </button>

        {isOwner && (
          <button
            onClick={() => {
              if (!isLoggingOut) logout();
            }}
            disabled={isLoggingOut}
            data-testid="button-signout"
            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-muted/30 transition-colors border-b border-border/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
              <LogOut
                className={`h-3.5 w-3.5 text-muted-foreground ${isLoggingOut ? "animate-pulse" : ""}`}
              />
            </div>
            {isLoggingOut ? "Signing out…" : "Sign Out"}
          </button>
        )}

        {isOwner && (
          <button
            onClick={() => {
              setDeleteConfirmText("");
              setShowDeleteConfirm(true);
            }}
            data-testid="button-delete-account"
            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
          >
            <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </div>
            Delete Account
          </button>
        )}
      </div>

      {}
      <p className="text-center text-[10px] text-muted-foreground/40 pt-2 pb-4">
        ArtixPOS · Business OS
      </p>

      <Sheet
        open={showHelp}
        onOpenChange={(open) => {
          setShowHelp(open);
          if (!open) {
            setHelpSearch("");
            setExpandedHelp(null);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-[2rem] border-none shadow-2xl p-0 overflow-hidden max-h-[90dvh] flex flex-col"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </div>
          <SheetHeader className="px-6 pt-3 pb-4 shrink-0 text-left">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-lg font-black leading-tight">Help Center</SheetTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  How to set up and use each feature
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="px-4 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
              <input
                type="text"
                value={helpSearch}
                onChange={(e) => {
                  setHelpSearch(e.target.value);
                  setExpandedHelp(null);
                }}
                placeholder="Search features..."
                data-testid="input-help-search"
                className="w-full h-10 pl-10 pr-4 rounded-2xl bg-secondary/60 border border-border/30 text-sm outline-none focus:border-primary/40 focus:bg-secondary/80 transition-all placeholder:text-muted-foreground/40 font-medium"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="overflow-y-auto px-4 pb-6 space-y-2">
            {(() => {
              const HELP_FEATURES: {
                id: string;
                icon: React.ElementType;
                color: string;
                title: string;
                tagline: string;
                steps: string[];
              }[] = [
                {
                  id: "pos",
                  icon: ShoppingCart,
                  color: "bg-blue-500/15 text-blue-500",
                  title: "Point of Sale",
                  tagline: "Ring up sales and accept payments from customers",
                  steps: [
                    "Open the POS page from the main navigation.",
                    "Tap or click products to add them to the cart. Use the search bar to find items quickly.",
                    "Adjust quantities by tapping the item in the cart.",
                    "Apply a discount code or loyalty redemption if the customer has one.",
                    "Select a payment method (Cash, Card, E-Wallet, or a custom method you set up).",
                    "Tap Charge and confirm the amount. Change is calculated automatically for cash.",
                    "Print or send the receipt when the sale is complete.",
                  ],
                },
                {
                  id: "dashboard",
                  icon: LayoutDashboard,
                  color: "bg-violet-500/15 text-violet-500",
                  title: "Dashboard",
                  tagline: "Your store's daily snapshot at a glance",
                  steps: [
                    "The dashboard loads automatically when you open the app.",
                    "The top cards show today's sales total, number of transactions, and average order value.",
                    "The chart below shows sales trends over the selected date range.",
                    "Scroll down to see top-selling products and recent transactions.",
                    "Tap any card to jump to the related page for more detail.",
                  ],
                },
                {
                  id: "pending",
                  icon: ClipboardList,
                  color: "bg-orange-500/15 text-orange-500",
                  title: "Pending Orders",
                  tagline: "Manage orders that are placed but not yet fulfilled",
                  steps: [
                    "Go to Pending Orders from the navigation.",
                    "Each card shows the order number, items, and the time it was placed.",
                    "Tap an order to see its full details.",
                    "Mark it as Ready when it is prepared, or Completed when it has been picked up or served.",
                    "You can also cancel an order from the detail view if needed.",
                  ],
                },
                {
                  id: "products",
                  icon: Package,
                  color: "bg-green-500/15 text-green-500",
                  title: "Products",
                  tagline: "Add and manage everything you sell",
                  steps: [
                    "Go to Products from the navigation.",
                    "Tap the plus button to add a new product.",
                    "Fill in the name, price, and category. Upload a photo if you want one.",
                    "Turn on stock tracking if you want the app to count down inventory as you sell.",
                    "Set a low stock threshold so you get notified before you run out.",
                    "Use categories to group products and make them easier to find at the POS.",
                    "Tap any product to edit it or toggle it as active or inactive.",
                  ],
                },
                {
                  id: "inventory",
                  icon: Boxes,
                  color: "bg-teal-500/15 text-teal-500",
                  title: "Inventory Hub",
                  tagline: "Track stock levels, movements, and low-stock alerts",
                  steps: [
                    "Go to Inventory from the navigation.",
                    "The hub shows current stock levels for all products with tracking enabled.",
                    "Use the Adjust Stock button to add or remove units manually (for receiving deliveries or correcting counts).",
                    "The Stock Log tab shows a full history of every change with reasons.",
                    "Low stock alerts appear here and as push notifications if you have them enabled.",
                    "Use Waste Log to record spoilage or damaged goods separately from adjustments.",
                  ],
                },
                {
                  id: "customers",
                  icon: Users,
                  color: "bg-cyan-500/15 text-cyan-500",
                  title: "Customers",
                  tagline: "Keep a record of who shops with you",
                  steps: [
                    "Go to Customers from the navigation.",
                    "Tap the plus button to add a new customer. Name and phone number are enough to get started.",
                    "Customer profiles track purchase history, loyalty points, and membership status.",
                    "At the POS, search for a customer by name or phone to attach them to the sale.",
                    "Attaching a customer lets you award loyalty points automatically.",
                    "Tap any customer to see their full purchase history and point balance.",
                  ],
                },
                {
                  id: "loyalty",
                  icon: Gift,
                  color: "bg-pink-500/15 text-pink-500",
                  title: "Loyalty Program",
                  tagline: "Reward repeat customers with points they can redeem",
                  steps: [
                    "Go to Loyalty from the navigation.",
                    "Create tiers (Bronze, Silver, Gold) with different point multipliers if you want.",
                    "Set how many pesos (or your currency) equal one point.",
                    "Set how many points equal one peso in redemption value.",
                    "At the POS, attach a customer to the sale. Points are awarded automatically after checkout.",
                    "Customers can redeem points as a discount at the POS when you tap Redeem Points.",
                    "Create rewards (free item, discount) that customers can claim at specific point thresholds.",
                  ],
                },
                {
                  id: "memberships",
                  icon: IdCard,
                  color: "bg-indigo-500/15 text-indigo-500",
                  title: "Memberships",
                  tagline: "Sell subscription-based access or perks",
                  steps: [
                    "Go to Memberships from the navigation.",
                    "Create a membership plan with a name, price, and duration (monthly or yearly).",
                    "Add benefits such as discounts, free check-ins, or custom perks.",
                    "Sell a membership to a customer by opening their profile and tapping Add Membership.",
                    "The membership page tracks active, expired, and expiring-soon members.",
                    "Customers with active memberships get their benefits applied automatically at checkout.",
                  ],
                },
                {
                  id: "appointments",
                  icon: Calendar,
                  color: "bg-rose-500/15 text-rose-500",
                  title: "Appointments",
                  tagline: "Let customers book time slots with your staff",
                  steps: [
                    "Go to Appointments from the navigation.",
                    "Create services with a name, duration, and price.",
                    "Assign services to specific staff members.",
                    "Book an appointment by tapping the plus button and choosing a customer, service, staff, date, and time.",
                    "The calendar view shows all upcoming bookings by day or week.",
                    "Mark an appointment as Completed or No Show when the time comes.",
                    "Completed appointments can be converted directly to a sale.",
                  ],
                },
                {
                  id: "staff",
                  icon: UserCheck,
                  color: "bg-amber-500/15 text-amber-500",
                  title: "Staff",
                  tagline: "Manage your team members and their roles",
                  steps: [
                    "Go to Staff from the navigation (or Admin if you are an owner).",
                    "Tap Invite to send a team member an account link.",
                    "Set their role: Owner, Manager, Cashier, or Staff.",
                    "Cashiers can process sales but cannot access reports or settings.",
                    "Managers can access reports and most settings but cannot delete the account.",
                    "Staff (clock-in role) can only use the time clock and do not have POS access.",
                    "You can assign staff to specific branches if you run multiple locations.",
                  ],
                },
                {
                  id: "timeclock",
                  icon: Clock,
                  color: "bg-sky-500/15 text-sky-500",
                  title: "Time Clock",
                  tagline: "Track when your team members clock in and out",
                  steps: [
                    "Go to Time Clock from the navigation.",
                    "Staff can clock in by entering their PIN on the kiosk page (/staff-clock-in).",
                    "The Time Clock page shows who is currently clocked in and for how long.",
                    "Clock-out happens the same way as clock-in using the PIN.",
                    "Managers can manually edit time entries if someone forgot to clock out.",
                    "Time logs feed into Payroll to calculate hours worked per period.",
                  ],
                },
                {
                  id: "payroll",
                  icon: Wallet,
                  color: "bg-emerald-500/15 text-emerald-500",
                  title: "Payroll",
                  tagline: "Compute wages based on hours worked",
                  steps: [
                    "Go to Payroll from the navigation.",
                    "Set each staff member's hourly rate or daily rate in their profile.",
                    "Select a pay period (weekly, bi-weekly, or custom date range).",
                    "The system reads time clock records and calculates gross pay automatically.",
                    "Add bonuses or deductions per employee for that period.",
                    "Generate a payroll summary to review totals before finalizing.",
                    "Mark the period as paid to keep a clear record.",
                  ],
                },
                {
                  id: "expenses",
                  icon: Receipt,
                  color: "bg-red-500/15 text-red-500",
                  title: "Expenses",
                  tagline: "Log your business costs and track spending",
                  steps: [
                    "Go to Expenses from the navigation.",
                    "Tap the plus button to add a new expense.",
                    "Enter the amount, category (Rent, Utilities, Supplies, etc.), date, and an optional note.",
                    "Attach a photo of the receipt if you want a digital copy.",
                    "Expenses are subtracted from gross sales in your profit reports.",
                    "Use the filters to see expenses by category or date range.",
                  ],
                },
                {
                  id: "analytics",
                  icon: TrendingUp,
                  color: "bg-violet-500/15 text-violet-500",
                  title: "Analytics",
                  tagline: "Detailed reports on your sales performance",
                  steps: [
                    "Go to Analytics from the navigation.",
                    "Choose a date range at the top to focus on a specific period.",
                    "The Sales Overview shows gross sales, net sales, VAT, and discounts.",
                    "The Products tab shows which items sell most by quantity and by revenue.",
                    "The Payments tab breaks down how customers are paying (Cash, Card, etc.).",
                    "The Hours tab shows your busiest hours and days of the week.",
                    "Export any report as a CSV for use in a spreadsheet.",
                  ],
                },
                {
                  id: "discounts",
                  icon: Tag,
                  color: "bg-lime-500/15 text-lime-600",
                  title: "Discount Codes",
                  tagline: "Create promo codes and vouchers for customers",
                  steps: [
                    "Go to Discount Codes from the navigation.",
                    "Tap the plus button to create a new code.",
                    "Choose a type: percentage off, fixed amount off, or free item.",
                    "Set an optional expiry date and maximum number of uses.",
                    "At the POS, the cashier taps Discount and types or scans the code.",
                    "The discount is applied automatically to the cart total.",
                    "Track how many times each code has been used from the list view.",
                  ],
                },
                {
                  id: "refunds",
                  icon: RotateCcw,
                  color: "bg-orange-500/15 text-orange-500",
                  title: "Refunds",
                  tagline: "Process returns and issue refunds to customers",
                  steps: [
                    "Go to Refunds from the navigation, or find the original sale in Transactions.",
                    "Tap the sale you want to refund.",
                    "Select the items being returned. You can do a partial refund for specific items.",
                    "Choose the refund method (Cash, original payment method, or store credit).",
                    "Add a reason for the refund to keep your records clean.",
                    "Confirm the refund. Stock is added back automatically for returned items.",
                    "The refund appears in the Refunds page and is reflected in your daily totals.",
                  ],
                },
                {
                  id: "tables",
                  icon: LayoutGrid,
                  color: "bg-yellow-500/15 text-yellow-600",
                  title: "Tables",
                  tagline: "Manage dine-in seating for restaurants and cafes",
                  steps: [
                    "Go to Tables from the navigation.",
                    "Set up your floor plan by adding tables and naming them (Table 1, Bar Seat A, etc.).",
                    "Tap an available table to open a new order for it.",
                    "Add items from the menu just like the regular POS.",
                    "Orders are saved to the table until the customer is ready to pay.",
                    "Multiple orders can be merged or split at checkout.",
                    "The table map updates in real time so staff can see which tables are occupied.",
                  ],
                },
                {
                  id: "kitchen",
                  icon: ChefHat,
                  color: "bg-red-500/15 text-red-500",
                  title: "Kitchen Display",
                  tagline: "Show orders to your kitchen or preparation team",
                  steps: [
                    "Enable the Kitchen Display feature in POS Features setup.",
                    "Open /kitchen-display on a tablet or monitor in the kitchen.",
                    "New orders appear as cards automatically when a sale is rung up.",
                    "Kitchen staff can tap Mark Ready when an order is prepared.",
                    "The front-of-house staff sees the Ready status and can notify the customer.",
                    "Completed orders move to a Done column and clear after a short time.",
                  ],
                },
                {
                  id: "suppliers",
                  icon: Truck,
                  color: "bg-slate-500/15 text-slate-500",
                  title: "Suppliers",
                  tagline: "Manage the vendors you buy your stock from",
                  steps: [
                    "Go to Suppliers from the navigation.",
                    "Tap the plus button to add a new supplier.",
                    "Enter the supplier name, contact person, phone, email, and address.",
                    "Link products to a supplier so you know who to call when stock is low.",
                    "View a supplier's purchase history from their profile page.",
                  ],
                },
                {
                  id: "purchases",
                  icon: ClipboardList,
                  color: "bg-teal-500/15 text-teal-500",
                  title: "Purchase Orders",
                  tagline: "Record stock replenishment from your suppliers",
                  steps: [
                    "Go to Purchases from the navigation.",
                    "Tap the plus button to create a new purchase order.",
                    "Select a supplier and add the products and quantities you are ordering.",
                    "Save it as a Draft while waiting for delivery, then mark it as Received.",
                    "When marked Received, stock levels are updated automatically.",
                    "Purchase orders help you track how much you spend on restocking over time.",
                  ],
                },
                {
                  id: "bir",
                  icon: FileBarChart,
                  color: "bg-blue-500/15 text-blue-500",
                  title: "BIR Compliance",
                  tagline: "Generate official tax reports required by the BIR (Philippines)",
                  steps: [
                    "Go to BIR Compliance from the navigation.",
                    "Make sure your TIN and business name are set in Settings before generating reports.",
                    "The X-Report shows your running totals for the current shift.",
                    "The Z-Report closes the shift and produces a final summary.",
                    "The Monthly Summary aggregates all transactions for the selected month.",
                    "Export the eSales CSV to submit your sales file to the BIR.",
                    "The E-Journal is an electronic record of every transaction, which you are required to keep.",
                  ],
                },
                {
                  id: "branches",
                  icon: Building2,
                  color: "bg-indigo-500/15 text-indigo-500",
                  title: "Branches",
                  tagline: "Run and compare multiple store locations from one account",
                  steps: [
                    "Go to Admin then Branches from the navigation (Owner only).",
                    "Tap Add Branch and fill in the branch name, address, and contact details.",
                    "Each branch has its own products, staff, shifts, and settings.",
                    "Switch between branches using the branch selector at the top of the app.",
                    "Admin Analytics lets you compare performance across all branches side by side.",
                    "Staff can be assigned to one or more branches.",
                  ],
                },
                {
                  id: "shifts",
                  icon: AlarmClock,
                  color: "bg-amber-500/15 text-amber-500",
                  title: "Shifts",
                  tagline: "Open and close your register with a cash count",
                  steps: [
                    "Go to Shifts from the navigation, or open one directly from the POS.",
                    "Tap Open Shift and enter your starting cash amount.",
                    "All sales during the shift are tracked under that shift.",
                    "When you are done for the day, tap Close Shift.",
                    "Count the cash in the drawer and enter the amount. The system shows you any overage or shortage.",
                    "Closed shift summaries are saved for BIR reporting and auditing.",
                  ],
                },
                {
                  id: "wifi",
                  icon: Wifi,
                  color: "bg-sky-500/15 text-sky-500",
                  title: "WiFi Vouchers",
                  tagline: "Sell internet access codes to customers",
                  steps: [
                    "Go to WiFi Vouchers from the More menu.",
                    "Create a batch of vouchers with a duration (1 hour, 1 day, etc.) and price.",
                    "Vouchers are generated as unique codes you can print or show on screen.",
                    "Sell a voucher through the POS like any other product.",
                    "Customers enter the code on the WiFi login page to get access.",
                    "Used vouchers are marked automatically so you know which ones have been redeemed.",
                  ],
                },
                {
                  id: "push",
                  icon: Bell,
                  color: "bg-green-500/15 text-green-500",
                  title: "Push Notifications",
                  tagline: "Get alerts for low stock, new orders, and more",
                  steps: [
                    "In Settings, scroll to the Notifications section.",
                    "Tap Enable Notifications and allow the permission when your browser asks.",
                    "You will receive alerts for low stock, out-of-stock products, and new orders.",
                    "Notifications work even when the app is in the background, as long as the tab is open.",
                    "To stop notifications, tap Disable Notifications in the same section.",
                  ],
                },
                {
                  id: "payments",
                  icon: CreditCard,
                  color: "bg-violet-500/15 text-violet-500",
                  title: "Payment Methods",
                  tagline: "Set up how your customers can pay",
                  steps: [
                    "In Settings, scroll to the Checkout section and tap Manage Payment Methods.",
                    "The defaults are Cash, Card, and E-Wallet. Toggle any of them off if you do not accept them.",
                    "Tap Add Method to create a custom payment option (Bank Transfer, Utang, etc.).",
                    "Mark a method as Cash Equivalent if it should be counted in the cash drawer total.",
                    "Changes take effect immediately at the POS.",
                  ],
                },
              ];

              const q = helpSearch.toLowerCase().trim();
              const filtered = q
                ? HELP_FEATURES.filter(
                    (f) =>
                      f.title.toLowerCase().includes(q) ||
                      f.tagline.toLowerCase().includes(q) ||
                      f.steps.some((s) => s.toLowerCase().includes(q)),
                  )
                : HELP_FEATURES;

              if (filtered.length === 0)
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50 gap-2">
                    <HelpCircle className="h-8 w-8" strokeWidth={1.2} />
                    <p className="text-sm font-medium">No results for "{helpSearch}"</p>
                  </div>
                );

              return filtered.map((feat) => {
                const Icon = feat.icon;
                const isOpen = expandedHelp === feat.id;
                return (
                  <div
                    key={feat.id}
                    className="rounded-2xl border border-border/25 bg-card overflow-hidden shadow-sm"
                  >
                    <button
                      onClick={() => setExpandedHelp(isOpen ? null : feat.id)}
                      data-testid={`button-help-${feat.id}`}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left"
                    >
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${feat.color}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-none">
                          {feat.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {feat.tagline}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground/50 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-border/20 pt-3 space-y-2">
                        {feat.steps.map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <span className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <p className="text-[12px] text-muted-foreground leading-snug">{step}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmText("");
          setShowDeleteConfirm(open);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and <strong>all your data</strong> — products,
              sales, orders, and settings. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-1">
            <p className="text-sm text-muted-foreground mb-2">
              Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-10 rounded-xl font-mono"
              data-testid="input-delete-confirm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} onClick={() => setDeleteConfirmText("")}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmText !== "DELETE"}
              data-testid="button-confirm-delete-account"
            >
              {isDeleting ? "Deleting…" : "Yes, delete everything"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
