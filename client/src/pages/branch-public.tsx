import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nativeFetch } from "@/lib/queryClient";
import { MapPin, Phone, Mail, Globe, Clock, CheckCircle, XCircle, Building2, Calendar } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface PublicBranch {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  color: string | null;
  timezone: string | null;
  openingHours: Record<string, { open: string; close: string; closed: boolean }> | null;
  businessType: string | null;
  businessSubType: string | null;
  isActive: boolean;
  tenantName: string | null;
}

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function luminance({ r, g, b }: { r: number; g: number; b: number }) {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastColor(hex: string): string {
  try {
    return luminance(hexToRgb(hex)) > 0.35 ? "#1a1a1a" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

function isOpenNow(branch: PublicBranch): boolean {
  if (!branch.openingHours) return false;
  const now = branch.timezone
    ? new Date(new Date().toLocaleString("en-US", { timeZone: branch.timezone }))
    : new Date();
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()];
  const hours = branch.openingHours[dayKey];
  if (!hours || hours.closed) return false;
  const [oh, om] = hours.open.split(":").map(Number);
  const [ch, cm] = hours.close.split(":").map(Number);
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= oh * 60 + om && current <= ch * 60 + cm;
}

function todayKey(branch: PublicBranch): string {
  const now = branch.timezone
    ? new Date(new Date().toLocaleString("en-US", { timeZone: branch.timezone }))
    : new Date();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()];
}

export default function BranchPublicPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data: branch, isLoading, isError } = useQuery<PublicBranch>({
    queryKey: ["/api/public/branch", id],
    queryFn: async () => {
      const res = await nativeFetch(`/api/public/branch/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    retry: false,
    enabled: !isNaN(id) && id > 0,
  });

  if (isLoading) return null;

  if (isError || !branch) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Branch not found</h1>
        <p className="text-slate-500 text-sm text-center max-w-xs">
          This branch profile is unavailable or may have been removed.
        </p>
      </div>
    );
  }

  const accent = branch.color ?? "#8b5cf6";
  const onAccent = contrastColor(accent);
  const open = isOpenNow(branch);
  const today = todayKey(branch);
  const todayHours = branch.openingHours?.[today];

  return (
    <div className="min-h-screen bg-slate-50">
      {}
      <div
        style={{ background: accent }}
        className="relative overflow-hidden"
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 70% 50%, white 0%, transparent 60%)`,
          }}
        />
        <div className="relative max-w-xl mx-auto px-6 pt-14 pb-10">
          {}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold shadow-lg mb-5 select-none"
            style={{ background: "rgba(255,255,255,0.2)", color: onAccent, backdropFilter: "blur(8px)" }}
          >
            {branch.name.charAt(0).toUpperCase()}
          </div>

          {}
          <h1 className="text-3xl font-bold mb-1" style={{ color: onAccent }}>
            {branch.name}
          </h1>
          {branch.tenantName && (
            <p className="text-sm font-medium opacity-75 mb-4" style={{ color: onAccent }}>
              {branch.tenantName}
            </p>
          )}

          {}
          <div className="flex flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.2)", color: onAccent }}
            >
              {open
                ? <><CheckCircle className="w-3.5 h-3.5" />Open Now</>
                : <><Clock className="w-3.5 h-3.5" />Closed</>}
            </span>
            {todayHours && !todayHours.closed && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.15)", color: onAccent }}
              >
                <Calendar className="w-3.5 h-3.5" />
                Today: {todayHours.open} – {todayHours.close}
              </span>
            )}
            {branch.businessType && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize"
                style={{ background: "rgba(255,255,255,0.15)", color: onAccent }}
              >
                <Building2 className="w-3.5 h-3.5" />
                {branch.businessType}
              </span>
            )}
          </div>
        </div>
      </div>

      {}
      <div className="max-w-xl mx-auto px-4 -mt-4 pb-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

          {}
          {branch.description && (
            <>
              <div className="px-6 py-5">
                <p className="text-slate-600 text-sm leading-relaxed">{branch.description}</p>
              </div>
              <Separator />
            </>
          )}

          {}
          <div className="px-6 py-5 space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</h2>

            {branch.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(branch.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 text-sm text-slate-700 hover:text-violet-600 transition-colors group"
                data-testid="link-address"
              >
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 group-hover:text-violet-500 transition-colors" />
                <span className="leading-snug">{branch.address}</span>
              </a>
            )}

            {branch.phone && (
              <a
                href={`tel:${branch.phone}`}
                className="flex items-center gap-3 text-sm text-slate-700 hover:text-violet-600 transition-colors group"
                data-testid="link-phone"
              >
                <Phone className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-violet-500 transition-colors" />
                {branch.phone}
              </a>
            )}

            {branch.email && (
              <a
                href={`mailto:${branch.email}`}
                className="flex items-center gap-3 text-sm text-slate-700 hover:text-violet-600 transition-colors group"
                data-testid="link-email"
              >
                <Mail className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-violet-500 transition-colors" />
                {branch.email}
              </a>
            )}

            {branch.website && (
              <a
                href={branch.website.startsWith("http") ? branch.website : `https://${branch.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm text-slate-700 hover:text-violet-600 transition-colors group"
                data-testid="link-website"
              >
                <Globe className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-violet-500 transition-colors" />
                {branch.website.replace(/^https?:\/\//, "")}
              </a>
            )}

            {!branch.address && !branch.phone && !branch.email && !branch.website && (
              <p className="text-sm text-slate-400 italic">No contact details listed.</p>
            )}
          </div>

          {}
          {branch.openingHours && (
            <>
              <Separator />
              <div className="px-6 py-5">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Opening Hours</h2>
                <div className="space-y-2">
                  {DAYS.map(({ key, label }) => {
                    const hours = branch.openingHours?.[key];
                    const isToday = key === today;
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 transition-colors ${
                          isToday
                            ? "font-semibold"
                            : "text-slate-600"
                        }`}
                        style={isToday ? { background: accent + "18", color: accent } : {}}
                        data-testid={`hours-${key}`}
                      >
                        <span className="w-28">{label}{isToday ? " (today)" : ""}</span>
                        {hours?.closed ? (
                          <span className="text-slate-400 font-normal text-xs">Closed</span>
                        ) : hours ? (
                          <span>{hours.open} – {hours.close}</span>
                        ) : (
                          <span className="text-slate-400 font-normal text-xs">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {}
        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by <span className="font-semibold text-slate-500">ArtixPOS</span>
        </p>
      </div>
    </div>
  );
}
