import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Lock, Unlock, LogOut, ChevronLeft, User, Delete, ShieldAlert, CheckCircle2, Clock as ClockIcon } from "lucide-react";
import { useKioskMode } from "@/hooks/use-kiosk-mode";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RosterMember {
  id: string;
  name: string | null;
  role: string;
  avatar: string | null;
  hasPin: boolean;
  isLocked: boolean;
}

// ── Clock ─────────────────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");
  const dateStr = time.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="text-center select-none">
      <p className="text-5xl font-bold tabular-nums tracking-tight text-white drop-shadow-lg">{hh}:{mm}</p>
      <p className="text-sm text-white/60 mt-1">{dateStr}</p>
    </div>
  );
}

// ── Manager PIN (4-digit kiosk PIN) ───────────────────────────────────────────

function ManagerPinInput({
  onUnlock,
  onDisable,
  onBack,
}: {
  onUnlock: (pin: string) => boolean;
  onDisable: (pin: string) => boolean;
  onBack: () => void;
}) {
  const [exitMode, setExitMode] = useState(false);
  const [pin, setPin] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    setTimeout(() => inputRefs[0].current?.focus(), 120);
  }, [exitMode]);

  function handleDigit(idx: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[idx] = digit;
    setPin(next);
    setError(false);
    if (digit && idx < 3) inputRefs[idx + 1].current?.focus();
    if (digit && idx === 3) {
      const full = [...next].join("");
      if (full.length === 4) trySubmit(full, next);
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      const next = [...pin];
      if (next[idx]) { next[idx] = ""; setPin(next); }
      else if (idx > 0) { next[idx - 1] = ""; setPin(next); inputRefs[idx - 1].current?.focus(); }
    }
    if (e.key === "Enter") {
      const full = pin.join("");
      if (full.length === 4) trySubmit(full, pin);
    }
  }

  function trySubmit(full: string, currentPin: string[]) {
    const ok = exitMode ? onDisable(full) : onUnlock(full);
    if (!ok) {
      setError(true);
      setShake(true);
      setPin(["", "", "", ""]);
      setTimeout(() => { setShake(false); inputRefs[0].current?.focus(); }, 500);
    }
  }

  function switchMode(mode: boolean) {
    setExitMode(mode);
    setPin(["", "", "", ""]);
    setError(false);
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-[280px]">
      <div className="text-center">
        <p className="text-white font-semibold text-[15px]">
          {exitMode ? "Exit Kiosk Mode" : "Manager Unlock"}
        </p>
        <p className="text-white/50 text-[12px] mt-0.5">
          {exitMode ? "Enter your PIN to disable kiosk mode" : "Enter your 4-digit manager PIN"}
        </p>
      </div>

      <div
        className="flex gap-3"
        style={shake ? { animation: "kiosk-wiggle 0.4s ease-in-out" } : {}}
      >
        {pin.map((digit, idx) => (
          <input
            key={idx}
            ref={inputRefs[idx]}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            data-testid={`kiosk-pin-${idx}`}
            onChange={(e) => handleDigit(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className={[
              "w-13 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all duration-150 caret-transparent",
              "bg-white/10 backdrop-blur-sm",
              error
                ? "border-red-400 text-red-300"
                : digit
                ? "border-white/60 text-white"
                : "border-white/25 text-white focus:border-white/70",
            ].join(" ")}
            style={{ width: "52px" }}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-[12px] font-medium -mt-2">Incorrect PIN. Try again.</p>
      )}

      <button
        onClick={() => { const full = pin.join(""); if (full.length === 4) trySubmit(full, pin); }}
        disabled={pin.join("").length < 4}
        data-testid="btn-kiosk-unlock"
        className="w-full py-3 rounded-2xl text-[14px] font-semibold text-white transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}
      >
        <span className="flex items-center justify-center gap-2">
          {exitMode ? <LogOut className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          {exitMode ? "Disable Kiosk Mode" : "Unlock"}
        </span>
      </button>

      <div className="flex flex-col items-center gap-1">
        {!exitMode ? (
          <button
            onClick={() => switchMode(true)}
            className="text-white/40 text-[11px] hover:text-white/70 transition-colors underline underline-offset-2"
          >
            Exit Kiosk Mode
          </button>
        ) : (
          <button
            onClick={() => switchMode(false)}
            className="text-white/40 text-[11px] hover:text-white/70 transition-colors"
          >
            ← Back to Unlock
          </button>
        )}
        <button
          onClick={onBack}
          className="text-white/30 text-[11px] hover:text-white/60 transition-colors mt-1"
        >
          ← Back to staff login
        </button>
      </div>
    </div>
  );
}

// ── Staff numpad ───────────────────────────────────────────────────────────────

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex items-center gap-3 justify-center my-4">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={[
            "w-3 h-3 rounded-full border-2 transition-all duration-150",
            i < filled
              ? "bg-white border-white scale-110"
              : "border-white/30 bg-transparent",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

function StaffNumpad({ onDigit, onDelete, disabled }: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  return (
    <div className="grid grid-cols-3 gap-2.5 w-full max-w-[220px] mx-auto">
      {keys.map((k, i) => {
        if (k === "") return <div key={i} />;
        const isDelete = k === "⌫";
        return (
          <button
            key={k}
            disabled={disabled}
            onClick={() => isDelete ? onDelete() : onDigit(k)}
            className={[
              "h-12 rounded-xl text-lg font-semibold transition-all duration-100 select-none",
              "active:scale-95",
              disabled ? "opacity-40 cursor-not-allowed" : "",
              isDelete
                ? "bg-white/10 hover:bg-white/20 text-white/70"
                : "bg-white/15 hover:bg-white/25 border border-white/20 text-white backdrop-blur-sm",
            ].join(" ")}
          >
            {isDelete ? <Delete className="w-4 h-4 mx-auto" /> : k}
          </button>
        );
      })}
    </div>
  );
}

// ── Staff card ────────────────────────────────────────────────────────────────

function StaffCard({ member, onClick }: { member: RosterMember; onClick: () => void }) {
  const initials = (member.name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button
      onClick={onClick}
      disabled={member.isLocked || !member.hasPin}
      className={[
        "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-200 text-center",
        member.isLocked || !member.hasPin
          ? "border-white/10 opacity-40 cursor-not-allowed bg-white/5"
          : "border-white/20 bg-white/10 hover:bg-white/20 hover:border-white/40 hover:-translate-y-0.5 active:scale-95",
      ].join(" ")}
    >
      <div className="relative">
        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-sm overflow-hidden">
          {member.avatar
            ? <img src={member.avatar} className="w-11 h-11 object-cover" alt={member.name ?? ""} />
            : initials}
        </div>
        {member.isLocked && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <Lock className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-white leading-tight">{member.name ?? "Unknown"}</p>
        <p className="text-[10px] text-white/50 capitalize">{member.role}</p>
      </div>
      {!member.hasPin && <p className="text-[9px] text-white/40">No PIN</p>}
      {member.isLocked && <p className="text-[9px] text-red-400">Locked</p>}
    </button>
  );
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export function KioskOverlay() {
  const { isEnabled, isLocked, unlock, forceUnlock, disableKioskMode } = useKioskMode();
  const { data: settings } = useSettings();
  const { user: ownerUser } = useAuth();
  const storeName = (settings as any)?.storeName || "ArtixPOS";
  const storeInitial = storeName[0].toUpperCase();

  const [phase, setPhase] = useState<"roster" | "staff-pin" | "manager-pin" | "success">("roster");
  const [selectedMember, setSelectedMember] = useState<RosterMember | null>(null);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const PIN_LENGTH = 6;

  const branchId = (ownerUser as any)?.activeBranchId ?? null;

  // Reset to roster when kiosk re-locks
  useEffect(() => {
    if (isLocked) {
      setPhase("roster");
      setSelectedMember(null);
      setPin("");
      setLockedUntil(null);
    }
  }, [isLocked]);

  const { data: roster = [], isLoading } = useQuery<RosterMember[]>({
    queryKey: ["/api/staff-pin/roster", branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const res = await apiRequest("GET", `/api/staff-pin/roster?branchId=${branchId}`);
      return res.json();
    },
    enabled: !!branchId && isLocked,
    refetchOnWindowFocus: false,
  });

  const staffRoster = roster.filter((m: RosterMember) => m.role !== "owner");

  const loginMutation = useMutation({
    mutationFn: async (enteredPin: string) => {
      const res = await apiRequest("POST", "/api/staff-pin/login", {
        userId: selectedMember!.id,
        pin: enteredPin,
        branchId,
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.message ?? "Login failed"), data);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      setPhase("success");
      setTimeout(() => forceUnlock(), 1200);
    },
    onError: (err: any) => {
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      if (err?.lockedUntil) setLockedUntil(err.lockedUntil);
    },
  });

  function handleDigit(d: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) loginMutation.mutate(next);
  }

  function handleDelete() { setPin(p => p.slice(0, -1)); }

  function selectMember(member: RosterMember) {
    setSelectedMember(member);
    setPin("");
    setLockedUntil(null);
    setPhase("staff-pin");
  }

  if (!isEnabled) return null;

  return (
    <>
      {isLocked && (
        <div
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center select-none overflow-y-auto"
          style={{ background: "linear-gradient(160deg, #0f0a1e 0%, #1a0f3c 40%, #0d1a3c 100%)" }}
          data-testid="kiosk-lock-screen"
        >
          {/* Grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          {/* Glow */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none opacity-20"
            style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
          />

          <div className="relative z-10 flex flex-col items-center w-full px-6 py-10 gap-6">
            {/* Header */}
            <div className="flex flex-col items-center gap-3">
              <Clock />
              <div className="flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-lg"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 16px rgba(124,58,237,0.5)" }}
                >
                  {storeInitial}
                </div>
                <span className="text-white/70 font-semibold text-sm tracking-wide">{storeName}</span>
              </div>
            </div>

            {/* ── Roster phase ── */}
            {phase === "roster" && (
              <div className="w-full max-w-md flex flex-col items-center gap-4">
                <div className="text-center">
                  <h2 className="text-xl font-extrabold text-white">Who's clocking in?</h2>
                  <p className="text-sm text-white/50 mt-0.5">Select your name, then enter your PIN</p>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-3 gap-3 w-full">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
                    ))}
                  </div>
                ) : staffRoster.length === 0 ? (
                  <div className="text-center py-8">
                    <User className="w-10 h-10 text-white/20 mx-auto mb-2" />
                    <p className="text-sm text-white/50">No staff assigned to this branch</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 w-full">
                    {staffRoster.map((m: RosterMember) => (
                      <StaffCard key={m.id} member={m} onClick={() => selectMember(m)} />
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setPhase("manager-pin")}
                  className="text-white/30 text-[11px] hover:text-white/60 transition-colors mt-2 flex items-center gap-1"
                >
                  <Lock className="w-3 h-3" /> Manager unlock
                </button>
              </div>
            )}

            {/* ── Staff PIN phase ── */}
            {phase === "staff-pin" && selectedMember && (() => {
              const isStaffLocked = !!lockedUntil && new Date(lockedUntil) > new Date();
              return (
                <div className="w-full max-w-xs flex flex-col items-center gap-3">
                  <button
                    onClick={() => { setPhase("roster"); setPin(""); setLockedUntil(null); }}
                    className="self-start flex items-center gap-1 text-white/40 hover:text-white/70 text-xs transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </button>

                  <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-base overflow-hidden">
                    {selectedMember.avatar
                      ? <img src={selectedMember.avatar} className="w-14 h-14 object-cover" alt="" />
                      : (selectedMember.name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-white">{selectedMember.name}</p>
                    <p className="text-xs text-white/50 capitalize">{selectedMember.role}</p>
                  </div>

                  {isStaffLocked ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                      </div>
                      <p className="text-sm font-semibold text-red-400">PIN Locked</p>
                      <p className="text-xs text-white/40 text-center">Too many wrong attempts.<br />Ask your manager to unlock.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-white/60">Enter your PIN</p>
                      <div className={shake ? "animate-bounce" : ""}>
                        <PinDots length={PIN_LENGTH} filled={pin.length} />
                      </div>
                      {loginMutation.isPending && (
                        <p className="text-xs text-white/40">Verifying…</p>
                      )}
                      <StaffNumpad onDigit={handleDigit} onDelete={handleDelete} disabled={loginMutation.isPending} />
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── Manager PIN phase ── */}
            {phase === "manager-pin" && (
              <ManagerPinInput
                onUnlock={unlock}
                onDisable={disableKioskMode}
                onBack={() => setPhase("roster")}
              />
            )}

            {/* ── Success phase ── */}
            {phase === "success" && selectedMember && (
              <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-extrabold text-white">Welcome, {selectedMember.name?.split(" ")[0]}!</h2>
                  <div className="flex items-center justify-center gap-1.5 text-sm text-white/50 mt-1">
                    <ClockIcon className="w-3.5 h-3.5" /> Clocked in at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes kiosk-wiggle {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
      `}</style>
    </>
  );
}
