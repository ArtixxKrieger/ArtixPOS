import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Lock, Shield, Unlock, LogOut } from "lucide-react";
import { useKioskMode, DEFAULT_KIOSK_PIN } from "@/hooks/use-kiosk-mode";
import { useSettings } from "@/hooks/use-settings";

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
      <p className="text-6xl font-bold tabular-nums tracking-tight text-white drop-shadow-lg">
        {hh}:{mm}
      </p>
      <p className="text-sm text-white/60 mt-1">{dateStr}</p>
    </div>
  );
}

function PinInput({
  onUnlock,
  onDisable,
}: {
  onUnlock: (pin: string) => boolean;
  onDisable: (pin: string) => boolean;
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
          {exitMode ? "Exit Kiosk Mode" : "Enter PIN to Unlock"}
        </p>
        <p className="text-white/50 text-[12px] mt-0.5">
          {exitMode ? "Enter your PIN to disable kiosk mode" : "Enter your 4-digit PIN to continue"}
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
    </div>
  );
}

export function KioskOverlay() {
  const { isEnabled, isLocked, unlock, disableKioskMode } = useKioskMode();
  const { data: settings } = useSettings();
  const storeName = (settings as any)?.storeName || "ArtixPOS";
  const storeInitial = storeName[0].toUpperCase();

  if (!isEnabled) return null;

  return (
    <>
      {/* ── Full-screen lock screen ──────────────────────────────────────────── */}
      {isLocked && (
        <div
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-8 select-none"
          style={{
            background: "linear-gradient(160deg, #0f0a1e 0%, #1a0f3c 40%, #0d1a3c 100%)",
          }}
          data-testid="kiosk-lock-screen"
        >
          {/* Subtle grid overlay */}
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

          <div className="relative z-10 flex flex-col items-center gap-8 px-6 w-full">
            {/* Clock */}
            <Clock />

            {/* Store badge */}
            <div className="flex items-center gap-2.5">
              <div
                className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 16px rgba(124,58,237,0.5)" }}
              >
                {storeInitial}
              </div>
              <span className="text-white/70 font-semibold text-sm tracking-wide">{storeName}</span>
            </div>

            {/* Lock icon */}
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 0 24px rgba(124,58,237,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              <Lock className="h-6 w-6 text-white" />
            </div>

            {/* PIN entry */}
            <PinInput onUnlock={unlock} onDisable={disableKioskMode} />
          </div>
        </div>
      )}

      {/* ── Floating "kiosk active" badge (when enabled but unlocked) ───────── */}
      {!isLocked && (
        <div
          className="fixed bottom-20 right-4 z-[9000] md:bottom-5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-semibold text-white/80 pointer-events-none select-none"
          style={{
            background: "rgba(124,58,237,0.25)",
            border: "1px solid rgba(124,58,237,0.4)",
            backdropFilter: "blur(8px)",
          }}
          data-testid="kiosk-active-badge"
        >
          <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
          Kiosk Active
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
