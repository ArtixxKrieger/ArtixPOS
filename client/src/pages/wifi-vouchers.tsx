import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { WifiVoucher } from "@shared/schema";
import {
  Wifi, Save, Eye, EyeOff, Clock, Receipt, Sparkles, ChevronRight,
  Info, WifiOff, Plus, Trash2, Lock, Unlock,
  Copy, Check, Shield, Settings2, ToggleLeft, ToggleRight,
  Signal, Pencil, QrCode, Download, Router, Server,
  AlertCircle, Loader2, CheckCircle2, RefreshCw, Ticket,
  Zap, Users, Timer,
} from "lucide-react";

type SecurityType = "WPA2" | "WPA" | "WEP" | "Open";
type TabId = "vouchers" | "settings" | "router";

interface NetworkProfile {
  id: string;
  name: string;
  ssid: string;
  password: string;
  securityType: SecurityType;
}

const DURATION_PRESETS = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "4h", value: 240 },
  { label: "8h", value: 480 },
  { label: "24h", value: 1440 },
];

const SECURITY_TYPES: { type: SecurityType; label: string; color: string; icon: React.ElementType }[] = [
  { type: "WPA2", label: "WPA2", color: "text-emerald-600 dark:text-emerald-400", icon: Shield },
  { type: "WPA",  label: "WPA",  color: "text-amber-600 dark:text-amber-400",   icon: Lock   },
  { type: "WEP",  label: "WEP",  color: "text-orange-600 dark:text-orange-400", icon: Lock   },
  { type: "Open", label: "Open", color: "text-muted-foreground",                icon: Unlock },
];

function getWifiQrString(ssid: string, password: string, securityType: SecurityType): string {
  const escape = (s: string) => s.replace(/[\\;,":]/g, c => `\\${c}`);
  if (securityType === "Open") return `WIFI:T:nopass;S:${escape(ssid)};;`;
  const type = securityType === "WEP" ? "WEP" : "WPA";
  return `WIFI:T:${type};S:${escape(ssid)};P:${escape(password)};;`;
}

function formatDuration(minutes: number): { label: string; shortLabel: string } {
  if (minutes >= 1440) {
    const d = Math.round(minutes / 1440);
    return { label: `${d} day${d !== 1 ? "s" : ""}`, shortLabel: `${d}d` };
  }
  if (minutes >= 60) {
    const h = minutes / 60;
    const label = Number.isInteger(h) ? `${h} hour${h !== 1 ? "s" : ""}` : `${h.toFixed(1)}h`;
    return { label, shortLabel: `${h % 1 === 0 ? h : h.toFixed(1)}h` };
  }
  return { label: `${minutes} min`, shortLabel: `${minutes}m` };
}

function getDurationColor(minutes: number) {
  if (minutes <= 30)  return { ring: "#f59e0b", text: "text-amber-500",   glow: "rgba(245,158,11,0.35)",  bg: "bg-amber-500/10"   };
  if (minutes <= 120) return { ring: "#10b981", text: "text-emerald-500", glow: "rgba(16,185,129,0.35)",  bg: "bg-emerald-500/10" };
  if (minutes <= 480) return { ring: "#8b5cf6", text: "text-violet-500",  glow: "rgba(139,92,246,0.35)",  bg: "bg-violet-500/10"  };
  return                     { ring: "#6366f1", text: "text-indigo-500",  glow: "rgba(99,102,241,0.35)",  bg: "bg-indigo-500/10"  };
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border/20 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionLabel({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-1.5 pt-1 pb-0.5 px-1">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground/60" />}
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{children}</p>
    </div>
  );
}

function Toggle({ on, onToggle, testId }: { on: boolean; onToggle: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onToggle} data-testid={testId} className="shrink-0">
      {on
        ? <ToggleRight className="h-7 w-7 text-emerald-500" />
        : <ToggleLeft  className="h-7 w-7 text-muted-foreground/40" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active")  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Active</span>;
  if (status === "expired") return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Expired</span>;
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">Unused</span>;
}

function DurationRing({ minutes, size = 140 }: { minutes: number; size?: number }) {
  const maxMin = 480;
  const progress = Math.min(minutes / maxMin, 1);
  const color = getDurationColor(minutes);
  const { shortLabel } = formatDuration(minutes);
  const cx = size / 2, cy = size / 2;
  const r = (size / 2) - 10;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - progress);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ position: "absolute", top: 0, left: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/30" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color.ring} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease", filter: `drop-shadow(0 0 6px ${color.glow})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={`text-[11px] font-black leading-none ${color.text}`}>{shortLabel}</p>
        <p className="text-[8px] text-muted-foreground mt-0.5 font-medium">session</p>
      </div>
    </div>
  );
}

function QRCard({
  ssid, password, securityType, duration, title, speedLabel, note, enabled,
}: {
  ssid: string; password: string; securityType: SecurityType;
  duration: number; title: string; speedLabel: string; note: string; enabled: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const qrValue = ssid ? getWifiQrString(ssid, password, securityType) : "WIFI:T:nopass;S:;;";
  const color = getDurationColor(duration);
  const { label: durationLabel } = formatDuration(duration);
  const sec = SECURITY_TYPES.find(s => s.type === securityType);

  const downloadCard = () => {
    const card = cardRef.current;
    if (!card) return;
    const svgs = card.querySelectorAll("svg");
    const qrSvg = svgs[svgs.length - 1];
    if (!qrSvg) return;
    const lines = [
      `<!-- WiFi Voucher: ${title || "FREE WIFI"} -->`,
      `<!-- Network: ${ssid} | Security: ${securityType} | Valid: ${durationLabel} -->`,
      new XMLSerializer().serializeToString(qrSvg),
    ].join("\n");
    const blob = new Blob([lines], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wifi-qr-${ssid || "voucher"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyQrString = () => {
    navigator.clipboard.writeText(qrValue).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (!enabled || !ssid) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 opacity-40">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground">{!enabled ? "Voucher disabled" : "Enter an SSID to generate QR"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={cardRef} className="flex flex-col items-center gap-3 bg-white rounded-2xl p-4 w-full">
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-800">{title || "FREE WIFI"}</p>
        {speedLabel && <p className="text-[9px] text-gray-400">{speedLabel}</p>}
        <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
          <DurationRing minutes={duration} size={160} />
          <div className="absolute inset-0 flex items-center justify-center" style={{ padding: "20px" }}>
            <div className="rounded-xl overflow-hidden bg-white p-1.5 shadow-md"
              style={{ boxShadow: `0 0 18px ${color.glow}` }}>
              <QRCodeSVG value={qrValue} size={90} bgColor="#ffffff" fgColor="#111111" level="M" includeMargin={false} />
            </div>
          </div>
        </div>
        <div className="w-full rounded-xl bg-gray-50 px-3 py-2.5 space-y-1 font-mono">
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">Network</span>
            <span className="font-semibold text-gray-800 truncate max-w-[60%]">{ssid}</span>
          </div>
          {securityType !== "Open" && password && (
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-400">Password</span>
              <span className="font-semibold text-gray-800">{password}</span>
            </div>
          )}
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">Security</span>
            <span className={`font-semibold ${sec?.color ?? ""}`}>{securityType}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">Valid for</span>
            <span className={`font-bold ${color.text}`}>{durationLabel}</span>
          </div>
        </div>
        {note && <p className="text-[9px] text-gray-400 italic">{note}</p>}
      </div>

      <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-xl px-3 py-2 w-full">
        <QrCode className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-[10px] text-muted-foreground">Scan with any camera to connect — no typing needed.</p>
      </div>

      <div className="flex gap-2 w-full">
        <button type="button" onClick={copyQrString} data-testid="button-copy-qr-string"
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold bg-muted/50 hover:bg-muted transition-colors border border-border/30">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy string"}
        </button>
        <button type="button" onClick={downloadCard} data-testid="button-download-qr"
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold bg-muted/50 hover:bg-muted transition-colors border border-border/30">
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
    </div>
  );
}

function ReceiptPreview({
  enabled, title, ssid, password, securityType, duration, speedLabel, note, showPassword, showQr,
}: {
  enabled: boolean; title: string; ssid: string; password: string;
  securityType: SecurityType; duration: number; speedLabel: string; note: string;
  showPassword: boolean; showQr: boolean;
}) {
  const sec = SECURITY_TYPES.find(s => s.type === securityType);
  const qrValue = ssid ? getWifiQrString(ssid, password, securityType) : "WIFI:T:nopass;S:;;";
  const { label: durationLabel } = formatDuration(duration);
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border/30 p-4 font-mono text-center shadow-inner">
      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">— — — — — — — — — —</p>
      {!enabled ? (
        <div className="flex flex-col items-center gap-1 py-2 opacity-40">
          <WifiOff className="h-5 w-5 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">WiFi voucher disabled</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-1.5 my-2">
            <Wifi className={`h-3.5 w-3.5 ${ssid ? "text-emerald-500" : "text-muted-foreground"}`} />
            <p className="text-[11px] font-black uppercase tracking-widest">{title || "FREE WIFI"}</p>
          </div>
          {speedLabel && <p className="text-[9px] text-muted-foreground mb-1">{speedLabel}</p>}
          {showQr && ssid && (
            <div className="flex justify-center py-2">
              <div className="bg-white p-1.5 rounded-lg inline-block">
                <QRCodeSVG value={qrValue} size={72} bgColor="#ffffff" fgColor="#111111" level="M" includeMargin={false} />
              </div>
            </div>
          )}
          <div className="space-y-0.5 pt-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Network</span>
              <span className="font-semibold">{ssid || "—"}</span>
            </div>
            {securityType !== "Open" && (
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Password</span>
                <span className="font-semibold">{password ? (showPassword ? password : "••••••••") : "—"}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Security</span>
              <span className={`font-semibold ${sec?.color}`}>{securityType}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Valid for</span>
              <span className="font-semibold">{durationLabel}</span>
            </div>
          </div>
          {note && <p className="text-[9px] text-muted-foreground mt-1 italic">{note}</p>}
        </>
      )}
      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider pt-1">— — — — — — — — — —</p>
    </div>
  );
}

function VoucherRow({ v }: { v: WifiVoucher }) {
  const [copied, setCopied] = useState(false);
  const { label } = formatDuration(v.durationMinutes);
  const copy = () => {
    navigator.clipboard.writeText(v.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const createdAt = v.createdAt ? new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const expiresAt = v.expiresAt ? new Date(v.expiresAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/15 last:border-0" data-testid={`row-voucher-${v.id}`}>
      <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        <Ticket className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold tracking-wider">{v.code}</span>
          <StatusBadge status={v.status} />
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><Timer className="h-2.5 w-2.5" />{label}</span>
          {v.customerName && <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />{v.customerName}</span>}
          {expiresAt && v.status === "active" && <span>expires {expiresAt}</span>}
          {createdAt && <span>{createdAt}</span>}
        </div>
      </div>
      <button type="button" onClick={copy} data-testid={`button-copy-voucher-${v.id}`}
        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export default function WifiVouchersPage() {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { isPro } = useSubscription();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("vouchers");

  const [enabled, setEnabled] = useState(true);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [duration, setDuration] = useState(60);
  const [showPassword, setShowPassword] = useState(false);
  const [securityType, setSecurityType] = useState<SecurityType>("WPA2");
  const [voucherTitle, setVoucherTitle] = useState("FREE WIFI");
  const [speedLabel, setSpeedLabel] = useState("");
  const [note, setNote] = useState("");
  const [showQr, setShowQr] = useState(true);
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [previewTab, setPreviewTab] = useState<"qr" | "receipt">("qr");

  const [mkEnabled, setMkEnabled] = useState(false);
  const [mkHost, setMkHost] = useState("");
  const [mkPort, setMkPort] = useState("80");
  const [mkUser, setMkUser] = useState("admin");
  const [mkPassword, setMkPassword] = useState("");
  const [mkProfile, setMkProfile] = useState("default");
  const [mkSsl, setMkSsl] = useState(false);
  const [mkShowPassword, setMkShowPassword] = useState(false);
  const [mkTestStatus, setMkTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [mkTestMsg, setMkTestMsg] = useState("");

  const [issueCustomer, setIssueCustomer] = useState("");
  const [issueDuration, setIssueDuration] = useState(60);
  const [redeemCode, setRedeemCode] = useState("");
  const [voucherFilter, setVoucherFilter] = useState<"all" | "unused" | "active" | "expired">("all");

  useEffect(() => {
    if (!settings) return;
    const s = settings as any;
    setEnabled(s.wifiEnabled !== false);
    setSsid(s.wifiSsid || "");
    setPassword(s.wifiPassword || "");
    setDuration(s.wifiDurationMinutes || 60);
    setSecurityType(s.wifiSecurityType || "WPA2");
    setVoucherTitle(s.wifiVoucherTitle || "FREE WIFI");
    setSpeedLabel(s.wifiSpeedLabel || "");
    setNote(s.wifiVoucherNote || "");
    setShowQr(s.wifiShowQr !== false);
    setProfiles(s.wifiNetworkProfiles || []);
    setActiveProfileId(s.wifiActiveProfileId || null);
    setMkEnabled(!!s.mikrotikEnabled);
    setMkHost(s.mikrotikHost || "");
    setMkPort(s.mikrotikPort || "80");
    setMkUser(s.mikrotikUser || "admin");
    setMkPassword(s.mikrotikPassword || "");
    setMkProfile(s.mikrotikHotspotProfile || "default");
    setMkSsl(!!s.mikrotikUseSsl);
  }, [settings]);

  const { data: vouchers = [], isLoading: vouchersLoading } = useQuery<WifiVoucher[]>({
    queryKey: ["/api/wifi-vouchers"],
    enabled: isPro,
  });

  const issueMutation = useMutation({
    mutationFn: (data: { durationMinutes: number; customerName?: string }) =>
      apiRequest("POST", "/api/wifi-vouchers", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wifi-vouchers"] });
      setIssueCustomer("");
      toast({ title: "Voucher issued" });
    },
    onError: () => toast({ title: "Failed to issue voucher", variant: "destructive" }),
  });

  const redeemMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest("POST", "/api/wifi-vouchers/redeem", { code }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wifi-vouchers"] });
      setRedeemCode("");
      toast({ title: data.status === "active" ? `Voucher activated — expires ${new Date(data.expiresAt).toLocaleTimeString()}` : "Voucher already used or expired" });
    },
    onError: () => toast({ title: "Voucher not found", variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mikrotik/sync", {}).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wifi-vouchers"] });
      toast({ title: `Sync complete — ${data.expired} expired, ${data.removed} removed from router` });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const handleTestConnection = async () => {
    if (!mkHost.trim()) { toast({ title: "Enter router IP first", variant: "destructive" }); return; }
    setMkTestStatus("testing"); setMkTestMsg("");
    try {
      const res = await apiRequest("POST", "/api/mikrotik/test", {
        host: mkHost.trim(), port: mkPort, user: mkUser, password: mkPassword,
        hotspotProfile: mkProfile, useSsl: mkSsl,
      });
      const data = await res.json();
      setMkTestStatus(data.ok ? "ok" : "error");
      setMkTestMsg(data.message || "");
    } catch {
      setMkTestStatus("error");
      setMkTestMsg("Request failed — check the router IP");
    }
  };

  const handleSave = () => {
    if (enabled && !ssid.trim()) { toast({ title: "Network name (SSID) is required", variant: "destructive" }); return; }
    updateSettings.mutate({
      wifiEnabled: enabled,
      wifiSsid: ssid.trim(),
      wifiPassword: password.trim() || null,
      wifiDurationMinutes: duration,
      wifiSecurityType: securityType,
      wifiVoucherTitle: voucherTitle.trim() || "FREE WIFI",
      wifiSpeedLabel: speedLabel.trim() || null,
      wifiVoucherNote: note.trim() || null,
      wifiShowQr: showQr,
      wifiNetworkProfiles: profiles,
      wifiActiveProfileId: activeProfileId,
      mikrotikEnabled: mkEnabled,
      mikrotikHost: mkHost.trim() || null,
      mikrotikPort: mkPort || "80",
      mikrotikUser: mkUser || "admin",
      mikrotikPassword: mkPassword || null,
      mikrotikHotspotProfile: mkProfile || "default",
      mikrotikUseSsl: mkSsl,
    } as any, { onSuccess: () => toast({ title: "Settings saved" }) });
  };

  const addProfile = () => {
    if (!newProfileName.trim()) return;
    const id = `p_${Date.now()}`;
    setProfiles(prev => [...prev, { id, name: newProfileName.trim(), ssid: "", password: "", securityType: "WPA2" }]);
    setNewProfileName("");
    setEditingProfileId(id);
  };

  const updateProfile = (id: string, field: keyof NetworkProfile, value: string) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
    if (activeProfileId === id) setActiveProfileId(null);
  };

  const activateProfile = (p: NetworkProfile) => {
    setActiveProfileId(p.id);
    setSsid(p.ssid); setPassword(p.password); setSecurityType(p.securityType);
  };

  const filteredVouchers = voucherFilter === "all" ? vouchers : vouchers.filter(v => v.status === voucherFilter);
  const voucherCounts = { all: vouchers.length, unused: vouchers.filter(v => v.status === "unused").length, active: vouchers.filter(v => v.status === "active").length, expired: vouchers.filter(v => v.status === "expired").length };

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "vouchers", label: "Vouchers", icon: Ticket },
    { id: "settings", label: "Settings", icon: Settings2 },
    { id: "router",   label: "Router",   icon: Router },
  ];

  if (!isPro) {
    return (
      <div className="px-4 pt-6 pb-24 md:pb-8 space-y-3">
        <div className="bg-card rounded-2xl border border-border/25 p-4 shadow-sm space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">How it works</p>
          {[
            { icon: QrCode,  color: "text-violet-500",  bg: "bg-violet-500/10",  title: "QR code on every receipt",    desc: "Guests scan the QR with any camera to connect — no typing required." },
            { icon: Wifi,    color: "text-emerald-500", bg: "bg-emerald-500/10", title: "Dynamic session timer",        desc: "The ring color changes by session length so guests know what they're getting." },
            { icon: Ticket,  color: "text-blue-500",    bg: "bg-blue-500/10",    title: "Track issued vouchers",        desc: "See every voucher issued — status, who used it, when it expires." },
            { icon: Router,  color: "text-amber-500",   bg: "bg-amber-500/10",   title: "MikroTik integration",         desc: "Push vouchers directly to your router — time limits enforced at the network layer." },
          ].map((s, i) => (
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
        <button type="button" onClick={() => setLocation("/billing?reason=pro_required")} data-testid="button-upgrade-wifi"
          className="w-full text-left bg-gradient-to-br from-violet-500/10 via-fuchsia-500/10 to-amber-500/10 border border-violet-500/30 rounded-2xl px-4 py-4 shadow-sm hover:from-violet-500/15 transition-all">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-md shadow-violet-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">WiFi vouchers is a Pro feature</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">QR codes, voucher tracking, MikroTik integration and more. Tap to upgrade.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          </div>
        </button>
      </div>
    );
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/20">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0", enabled ? "bg-emerald-500/15" : "bg-muted/60")}>
              {enabled ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">WiFi Vouchers</p>
              <p className="text-[10px] text-muted-foreground hidden sm:block">{ssid ? ssid : "No network configured"}</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending} size="sm"
            className="h-8 px-3 rounded-xl font-semibold text-xs shrink-0" data-testid="button-save-wifi-settings">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {updateSettings.isPending ? "Saving…" : "Save"}
          </Button>
        </div>

        {/* Tab bar */}
        <div className="px-4 flex gap-0 border-t border-border/10">
          {TABS.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}>
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id === "vouchers" && vouchers.length > 0 && (
                <span className="text-[9px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full ml-0.5">{vouchers.length}</span>
              )}
              {tab.id === "router" && mkEnabled && (
                <span className={cn("h-1.5 w-1.5 rounded-full ml-0.5", mkTestStatus === "ok" ? "bg-emerald-500" : mkTestStatus === "error" ? "bg-destructive" : "bg-amber-500")} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Vouchers Tab ──────────────────────────────────────── */}
      {activeTab === "vouchers" && (
        <div className="px-4 pt-5 space-y-4 max-w-3xl">

          {/* Issue new voucher */}
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border/20 flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Issue Voucher</p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map(p => (
                  <button key={p.value} type="button" onClick={() => setIssueDuration(p.value)}
                    data-testid={`button-issue-duration-${p.label}`}
                    className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                      issueDuration === p.value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-muted text-muted-foreground border-transparent hover:border-border")}>
                    {p.label}
                  </button>
                ))}
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-xl px-2 border border-border/20">
                  <Input type="number" min="1" value={issueDuration} onChange={e => setIssueDuration(Number(e.target.value))}
                    className="h-7 w-14 text-xs rounded-lg bg-transparent border-none p-0 text-center" data-testid="input-issue-duration-custom" />
                  <span className="text-[10px] text-muted-foreground">min</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Input value={issueCustomer} onChange={e => setIssueCustomer(e.target.value)}
                  placeholder="Customer name (optional)"
                  className="h-9 text-sm rounded-xl bg-secondary/60 border-none flex-1"
                  data-testid="input-issue-customer" />
                <Button type="button" onClick={() => issueMutation.mutate({ durationMinutes: issueDuration, customerName: issueCustomer.trim() || undefined })}
                  disabled={issueMutation.isPending}
                  className="h-9 px-4 rounded-xl font-semibold text-sm shrink-0" data-testid="button-issue-voucher">
                  {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Issue"}
                </Button>
              </div>
            </div>
          </div>

          {/* Redeem voucher */}
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border/20 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold">Redeem by Code</p>
            </div>
            <div className="px-4 py-3 flex gap-2">
              <Input value={redeemCode} onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="Enter voucher code (e.g. A1B2C3)"
                className="h-9 text-sm font-mono rounded-xl bg-secondary/60 border-none flex-1 uppercase"
                data-testid="input-redeem-code"
                onKeyDown={e => e.key === "Enter" && redeemCode.trim() && redeemMutation.mutate(redeemCode.trim())} />
              <Button type="button" onClick={() => redeemMutation.mutate(redeemCode.trim())}
                disabled={!redeemCode.trim() || redeemMutation.isPending}
                variant="outline" className="h-9 px-4 rounded-xl font-semibold text-sm shrink-0" data-testid="button-redeem-voucher">
                {redeemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
              </Button>
            </div>
          </div>

          {/* Voucher list */}
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Voucher History</p>
              <div className="flex gap-1">
                {(["all", "unused", "active", "expired"] as const).map(f => (
                  <button key={f} type="button" onClick={() => setVoucherFilter(f)}
                    data-testid={`filter-${f}`}
                    className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors capitalize",
                      voucherFilter === f ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-border")}>
                    {f}{f !== "all" && voucherCounts[f] > 0 ? ` (${voucherCounts[f]})` : ""}
                  </button>
                ))}
              </div>
            </div>
            {vouchersLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredVouchers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-50">
                <Ticket className="h-7 w-7 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">{voucherFilter === "all" ? "No vouchers issued yet" : `No ${voucherFilter} vouchers`}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/10">
                {filteredVouchers.map(v => <VoucherRow key={v.id} v={v} />)}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Settings Tab ──────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="px-4 pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">

            {/* Left: config */}
            <div className="space-y-4">

              {/* Master switch */}
              <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
                <div className="flex items-center justify-between py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center", enabled ? "bg-emerald-500/15" : "bg-muted/60")}>
                      {enabled ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{enabled ? "Print WiFi info on receipts" : "Not printing on receipts"}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{enabled ? "QR code & credentials on every sale" : "Toggle to enable"}</p>
                    </div>
                  </div>
                  <Toggle on={enabled} onToggle={() => setEnabled(v => !v)} testId="toggle-wifi-enabled" />
                </div>
              </div>

              {/* Network Profiles */}
              <SectionLabel icon={Signal}>Network Profiles</SectionLabel>
              <div className="space-y-2">
                {profiles.map(profile => (
                  <div key={profile.id} className={cn(
                    "bg-card rounded-2xl border shadow-sm overflow-hidden transition-all",
                    activeProfileId === profile.id ? "border-violet-500/40 shadow-violet-500/10" : "border-border/25"
                  )}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", activeProfileId === profile.id ? "bg-violet-500/15" : "bg-muted/50")}>
                        <Wifi className={cn("h-3.5 w-3.5", activeProfileId === profile.id ? "text-violet-500" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        {editingProfileId === profile.id ? (
                          <Input value={profile.name} onChange={e => updateProfile(profile.id, "name", e.target.value)}
                            className="h-7 text-sm rounded-lg bg-secondary/60 border-none px-2"
                            autoFocus onBlur={() => setEditingProfileId(null)}
                            onKeyDown={e => e.key === "Enter" && setEditingProfileId(null)} />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold truncate">{profile.name}</p>
                            {activeProfileId === profile.id && (
                              <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">ACTIVE</span>
                            )}
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{profile.ssid || "No SSID set"}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setEditingProfileId(profile.id)}
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                        {activeProfileId !== profile.id && (
                          <button type="button" onClick={() => activateProfile(profile)}
                            className="h-7 px-2 rounded-lg text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
                            data-testid={`button-activate-profile-${profile.id}`}>
                            Use
                          </button>
                        )}
                        <button type="button" onClick={() => removeProfile(profile.id)}
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          data-testid={`button-remove-profile-${profile.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-border/20 px-4 pb-3 space-y-2 pt-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">SSID</p>
                          <Input value={profile.ssid} onChange={e => updateProfile(profile.id, "ssid", e.target.value)}
                            placeholder="Network name" className="h-7 text-xs rounded-lg bg-secondary/60 border-none"
                            data-testid={`input-profile-ssid-${profile.id}`} />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Password</p>
                          <Input type="password" value={profile.password} onChange={e => updateProfile(profile.id, "password", e.target.value)}
                            placeholder="Optional" className="h-7 text-xs rounded-lg bg-secondary/60 border-none"
                            data-testid={`input-profile-password-${profile.id}`} />
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {SECURITY_TYPES.map(s => (
                          <button key={s.type} type="button" onClick={() => updateProfile(profile.id, "securityType", s.type)}
                            className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors",
                              profile.securityType === s.type ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-border")}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {profiles.length < 5 && (
                  <div className="flex gap-2">
                    <Input value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                      placeholder="Profile name (e.g. Guest, VIP, Staff)"
                      className="h-9 text-sm rounded-xl bg-card border border-border/25"
                      onKeyDown={e => e.key === "Enter" && addProfile()}
                      data-testid="input-new-profile-name" />
                    <Button type="button" variant="outline" size="sm" onClick={addProfile}
                      disabled={!newProfileName.trim()} className="h-9 px-3 rounded-xl shrink-0"
                      data-testid="button-add-profile">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Active Network */}
              <SectionLabel icon={Settings2}>Active Network</SectionLabel>
              <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
                <SettingRow label="Network name (SSID)" hint="Printed on the receipt">
                  <Input value={ssid} onChange={e => setSsid(e.target.value)} placeholder="e.g. CafeGuest-WiFi"
                    className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-40 sm:w-44"
                    data-testid="input-wifi-ssid" />
                </SettingRow>
                <SettingRow label="Password" hint={securityType === "Open" ? "Not used for open networks" : "Leave blank if open"}>
                  <div className="relative w-40 sm:w-44">
                    <Input type={showPassword ? "text" : "password"} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder={securityType === "Open" ? "N/A" : "Password"}
                      disabled={securityType === "Open"}
                      className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-8 disabled:opacity-40"
                      data-testid="input-wifi-password" />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-password">
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </SettingRow>
                <SettingRow label="Security Type" hint="Encryption used by your router">
                  <div className="flex gap-1 flex-wrap justify-end">
                    {SECURITY_TYPES.map(s => (
                      <button key={s.type} type="button" onClick={() => setSecurityType(s.type)}
                        data-testid={`button-security-${s.type}`}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors",
                          securityType === s.type ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-border")}>
                        <s.icon className="h-2.5 w-2.5" />{s.label}
                      </button>
                    ))}
                  </div>
                </SettingRow>
              </div>

              {/* Session Duration */}
              <SectionLabel icon={Clock}>Session Duration</SectionLabel>
              <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
                <div className="py-3 border-b border-border/20">
                  <div className="flex flex-wrap gap-1.5">
                    {DURATION_PRESETS.map(p => (
                      <button key={p.value} type="button" onClick={() => setDuration(p.value)}
                        data-testid={`button-duration-${p.label}`}
                        className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          duration === p.value
                            ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                            : "bg-muted text-muted-foreground border-transparent hover:border-border")}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <SettingRow label="Custom duration" hint="Set any duration in minutes">
                  <div className="flex items-center gap-2">
                    <Input type="number" min="1" value={duration} onChange={e => setDuration(Number(e.target.value))}
                      className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-24"
                      data-testid="input-wifi-duration" />
                    <span className="text-[11px] text-muted-foreground shrink-0">min</span>
                  </div>
                </SettingRow>
              </div>

              {/* Appearance */}
              <SectionLabel icon={Receipt}>Voucher Appearance</SectionLabel>
              <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
                <SettingRow label="Voucher title" hint='Shown on receipt (e.g. "FREE WIFI")'>
                  <Input value={voucherTitle} onChange={e => setVoucherTitle(e.target.value)} placeholder="FREE WIFI"
                    maxLength={30} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-40 sm:w-44"
                    data-testid="input-voucher-title" />
                </SettingRow>
                <SettingRow label="Speed label" hint='Optional, e.g. "Up to 20 Mbps"'>
                  <Input value={speedLabel} onChange={e => setSpeedLabel(e.target.value)} placeholder="Up to 20 Mbps"
                    maxLength={30} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-40 sm:w-44"
                    data-testid="input-speed-label" />
                </SettingRow>
                <SettingRow label="Footer note" hint="Printed below credentials">
                  <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional message"
                    maxLength={60} className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-40 sm:w-44"
                    data-testid="input-voucher-note" />
                </SettingRow>
                <SettingRow label="Print QR code" hint="Scan to connect — no typing">
                  <Toggle on={showQr} onToggle={() => setShowQr(v => !v)} testId="toggle-show-qr" />
                </SettingRow>
              </div>

            </div>

            {/* Right: live preview (desktop sticky, mobile inline) */}
            <div className="lg:sticky lg:top-[108px] space-y-3">
              <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
                <div className="flex border-b border-border/20">
                  {([
                    { id: "qr" as const, label: "QR Card", icon: QrCode },
                    { id: "receipt" as const, label: "On Receipt", icon: Receipt },
                  ]).map(tab => (
                    <button key={tab.id} type="button" onClick={() => setPreviewTab(tab.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors",
                        previewTab === tab.id ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"
                      )}>
                      <tab.icon className="h-3.5 w-3.5" />{tab.label}
                    </button>
                  ))}
                </div>
                <div className="p-4">
                  {previewTab === "qr" ? (
                    <QRCard ssid={ssid} password={password} securityType={securityType}
                      duration={duration} title={voucherTitle} speedLabel={speedLabel} note={note} enabled={enabled} />
                  ) : (
                    <ReceiptPreview enabled={enabled} title={voucherTitle} ssid={ssid} password={password}
                      securityType={securityType} duration={duration} speedLabel={speedLabel}
                      note={note} showPassword={showPassword} showQr={showQr} />
                  )}
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                  <p className="text-[11px] font-bold text-primary">Tips</p>
                </div>
                <ul className="space-y-1 pl-4">
                  {[
                    "Ring color: amber ≤30m, green ≤2h, violet ≤8h, indigo = full day.",
                    "Use a dedicated guest network — keep your main network private.",
                    "Short sessions (1–2h) encourage repeat visits.",
                    "Profiles let you switch networks quickly.",
                  ].map((tip, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground leading-relaxed list-disc">{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Router Tab ────────────────────────────────────────── */}
      {activeTab === "router" && (
        <div className="px-4 pt-5 space-y-4 max-w-3xl">

          {/* MikroTik card */}
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0", mkEnabled ? "bg-blue-500/10" : "bg-muted/50")}>
                  <Router className={cn("h-4 w-4", mkEnabled ? "text-blue-500" : "text-muted-foreground")} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">MikroTik Hotspot</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Enforce voucher limits at the router level</p>
                </div>
              </div>
              <Toggle on={mkEnabled} onToggle={() => setMkEnabled(v => !v)} testId="toggle-mikrotik-enabled" />
            </div>

            {!mkEnabled ? (
              <div className="px-4 py-4">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  When enabled, every voucher you issue is automatically pushed to your MikroTik router as a hotspot user.
                  Customers connect to the captive portal with the voucher code — time limits are enforced by the router.
                  Requires RouterOS v7+ with the REST API enabled (IP → Hotspot).
                </p>
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-0">
                <SettingRow label="Router IP" hint="LAN address of your MikroTik (e.g. 192.168.1.2)">
                  <Input value={mkHost} onChange={e => setMkHost(e.target.value)} placeholder="192.168.1.2"
                    className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-40 sm:w-44"
                    data-testid="input-mikrotik-host" />
                </SettingRow>
                <SettingRow label="API Port" hint="Default 80 (HTTP) or 443 (HTTPS)">
                  <Input value={mkPort} onChange={e => setMkPort(e.target.value)} placeholder="80"
                    className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-24"
                    data-testid="input-mikrotik-port" />
                </SettingRow>
                <SettingRow label="Username" hint="Router admin username">
                  <Input value={mkUser} onChange={e => setMkUser(e.target.value)} placeholder="admin"
                    className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-36"
                    data-testid="input-mikrotik-user" />
                </SettingRow>
                <SettingRow label="Password" hint="Router admin password">
                  <div className="relative w-36">
                    <Input type={mkShowPassword ? "text" : "password"} value={mkPassword}
                      onChange={e => setMkPassword(e.target.value)} placeholder="••••••"
                      className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-8"
                      data-testid="input-mikrotik-password" />
                    <button type="button" onClick={() => setMkShowPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {mkShowPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </SettingRow>
                <SettingRow label="Hotspot Profile" hint='RouterOS profile name (usually "default")'>
                  <Input value={mkProfile} onChange={e => setMkProfile(e.target.value)} placeholder="default"
                    className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3 w-36"
                    data-testid="input-mikrotik-profile" />
                </SettingRow>
                <SettingRow label="Use HTTPS" hint="Enable if router uses SSL (port 443)">
                  <Toggle on={mkSsl} onToggle={() => setMkSsl(v => !v)} testId="toggle-mikrotik-ssl" />
                </SettingRow>

                {/* Test + status */}
                <div className="pt-3 space-y-2">
                  <button type="button" onClick={handleTestConnection} disabled={mkTestStatus === "testing"}
                    data-testid="button-test-mikrotik"
                    className="flex items-center justify-center gap-2 w-full h-9 rounded-xl text-xs font-semibold border border-border/40 bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50">
                    {mkTestStatus === "testing"
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Server className="h-3.5 w-3.5" />}
                    {mkTestStatus === "testing" ? "Testing…" : "Test Connection"}
                  </button>
                  {mkTestStatus !== "idle" && mkTestStatus !== "testing" && (
                    <div className={cn("flex items-start gap-2 px-3 py-2 rounded-xl text-[11px]",
                      mkTestStatus === "ok" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive")}>
                      {mkTestStatus === "ok"
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        : <AlertCircle  className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                      <span>{mkTestMsg || (mkTestStatus === "ok" ? "Connected successfully" : "Connection failed")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sync card */}
          <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-border/20">
              <p className="text-sm font-semibold">Expire & Sync</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Mark overdue active vouchers as expired and remove them from the router.</p>
            </div>
            <div className="px-4 py-3">
              <button type="button" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
                data-testid="button-sync-mikrotik"
                className="flex items-center justify-center gap-2 w-full h-9 rounded-xl text-xs font-semibold border border-border/40 bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50">
                {syncMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                {syncMutation.isPending ? "Syncing…" : "Run Sync"}
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-muted/40 rounded-2xl border border-border/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-[11px] font-bold text-muted-foreground">Requirements</p>
            </div>
            <ul className="space-y-1 pl-4">
              {[
                "MikroTik router running RouterOS v7 or later.",
                "REST API enabled: IP → Hotspot → Server settings.",
                "The API user must have hotspot write permissions.",
                "Router must be reachable from the server (same LAN or VPN).",
              ].map((item, i) => (
                <li key={i} className="text-[11px] text-muted-foreground leading-relaxed list-disc">{item}</li>
              ))}
            </ul>
          </div>

        </div>
      )}
    </div>
  );
}
