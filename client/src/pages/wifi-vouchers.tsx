import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Wifi, Save, Eye, EyeOff, Clock, Receipt, Sparkles, ChevronRight,
  Info, CheckCircle2, WifiOff,
} from "lucide-react";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pt-1">
      {children}
    </p>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border/20 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0 w-[52%]">{children}</div>
    </div>
  );
}

function HowItWorksCard() {
  const steps = [
    {
      icon: Receipt,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      title: "Printed on every receipt",
      desc: "When a sale is completed, the WiFi network name, password, and session duration appear automatically at the bottom of the receipt.",
    },
    {
      icon: Wifi,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      title: "Customer connects",
      desc: "The customer scans or reads the receipt and connects to your guest WiFi using the printed credentials.",
    },
    {
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      title: "Time-limited session",
      desc: "The voucher shows an expiry time so guests know how long their session lasts. New purchases generate a fresh voucher.",
    },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border/25 p-4 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-muted-foreground" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">How it works</p>
      </div>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`h-8 w-8 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{s.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 bg-muted/40 rounded-xl px-3 py-2.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          ArtixPOS prints the credentials as text — no router integration required. Works with any WiFi router that supports a guest network.
        </p>
      </div>
    </div>
  );
}

export default function WifiVouchersPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { isPro } = useSubscription();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [duration, setDuration] = useState("60");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (settings) {
      setSsid((settings as any).wifiSsid || "");
      setPassword((settings as any).wifiPassword || "");
      setDuration((settings as any).wifiDurationMinutes?.toString() || "60");
    }
  }, [settings]);

  const handleSave = () => {
    const dur = Number(duration);
    if (!ssid.trim()) {
      toast({ title: "Network name (SSID) is required", variant: "destructive" });
      return;
    }
    if (isNaN(dur) || dur < 1) {
      toast({ title: "Duration must be at least 1 minute", variant: "destructive" });
      return;
    }
    updateSettings.mutate(
      { wifiSsid: ssid.trim(), wifiPassword: password.trim() || null, wifiDurationMinutes: dur } as any,
      { onSuccess: () => toast({ title: "WiFi voucher settings saved" }) }
    );
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-24 md:pb-8 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-md shadow-violet-500/25 shrink-0">
          <Wifi className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black">WiFi Vouchers</h1>
          <p className="text-[11px] text-muted-foreground">Print guest WiFi access on every receipt</p>
        </div>
      </div>

      {/* How it works */}
      <HowItWorksCard />

      {/* Pro gate or config */}
      {isLoading ? (
        <div className="bg-card rounded-2xl border border-border/25 px-4 py-8 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : !isPro ? (
        <>
          <SectionLabel>Configuration</SectionLabel>
          <button
            type="button"
            onClick={() => setLocation("/billing?reason=pro_required")}
            data-testid="button-upgrade-wifi"
            className="w-full text-left bg-gradient-to-br from-violet-500/10 via-fuchsia-500/10 to-amber-500/10 border border-violet-500/30 rounded-2xl px-4 py-3.5 shadow-sm hover:from-violet-500/15 hover:via-fuchsia-500/15 hover:to-amber-500/15 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-md shadow-violet-500/30">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-foreground">WiFi voucher printing is a Pro feature</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Print time-limited WiFi codes on every receipt to delight guests and cut down on staff interruptions. Tap to upgrade.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </button>
        </>
      ) : (
        <>
          <SectionLabel>Configuration</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">

            <SettingRow label="Network name (SSID)" hint="Printed on the receipt voucher">
              <Input
                value={ssid}
                onChange={e => setSsid(e.target.value)}
                placeholder="e.g. CafeGuest-WiFi"
                className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                data-testid="input-wifi-ssid"
              />
            </SettingRow>

            <SettingRow label="WiFi Password" hint="Leave blank for open networks">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave blank if open"
                  className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-8"
                  data-testid="input-wifi-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-wifi-password"
                >
                  {showPassword
                    ? <EyeOff className="h-3.5 w-3.5" />
                    : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </SettingRow>

            <SettingRow label="Session duration" hint="Minutes shown on the voucher">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                  data-testid="input-wifi-duration"
                />
                <span className="text-[11px] text-muted-foreground shrink-0">min</span>
              </div>
            </SettingRow>

          </div>

          {/* Preview */}
          <SectionLabel>Receipt Preview</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 p-4 shadow-sm">
            <div className="bg-muted/40 rounded-xl px-4 py-3 font-mono text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                {ssid ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Free WiFi</p>
              </div>
              <p className="text-xs font-semibold">{ssid || <span className="text-muted-foreground italic">Network name</span>}</p>
              <p className="text-[11px] text-muted-foreground">
                {password ? `Password: ${showPassword ? password : "••••••••"}` : "Open network — no password needed"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Valid for {duration || "60"} minutes from purchase
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">This is how it will appear on the receipt</p>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="w-full h-10 rounded-xl font-semibold bg-primary text-white shadow-md shadow-primary/20 hover:opacity-90 transition-all"
            data-testid="button-save-wifi-settings"
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </>
      )}
    </div>
  );
}
