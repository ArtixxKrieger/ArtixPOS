import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Lock, Unlock, Shield, X } from "lucide-react";
import { useKioskMode, DEFAULT_KIOSK_PIN } from "@/hooks/use-kiosk-mode";

export function KioskOverlay() {
  const { isActive, exitKioskMode } = useKioskMode();
  const [showDialog, setShowDialog] = useState(false);
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
    if (!isActive) {
      setShowDialog(false);
      setPin(["", "", "", ""]);
      setError(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (showDialog) {
      setPin(["", "", "", ""]);
      setError(false);
      setTimeout(() => inputRefs[0].current?.focus(), 80);
    }
  }, [showDialog]);

  function handleDigit(idx: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[idx] = digit;
    setPin(next);
    setError(false);

    if (digit && idx < 3) {
      inputRefs[idx + 1].current?.focus();
    }

    if (digit && idx === 3) {
      const fullPin = [...next].join("");
      if (fullPin.length === 4) {
        tryUnlock(fullPin);
      }
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      const next = [...pin];
      if (next[idx]) {
        next[idx] = "";
        setPin(next);
      } else if (idx > 0) {
        next[idx - 1] = "";
        setPin(next);
        inputRefs[idx - 1].current?.focus();
      }
    }
    if (e.key === "Enter") {
      const fullPin = pin.join("");
      if (fullPin.length === 4) tryUnlock(fullPin);
    }
  }

  function tryUnlock(fullPin: string) {
    const ok = exitKioskMode(fullPin);
    if (!ok) {
      setError(true);
      setShake(true);
      setPin(["", "", "", ""]);
      setTimeout(() => {
        setShake(false);
        inputRefs[0].current?.focus();
      }, 500);
    } else {
      setShowDialog(false);
    }
  }

  function handleClose() {
    setShowDialog(false);
    setPin(["", "", "", ""]);
    setError(false);
  }

  if (!isActive) return null;

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        data-testid="btn-kiosk-lock-badge"
        title="Kiosk Mode active — click to unlock"
        className="fixed bottom-5 right-5 z-[9999] flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold text-white shadow-lg border border-white/20 transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
          boxShadow: "0 0 18px rgba(124,58,237,0.55), 0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        <Lock className="h-3 w-3 shrink-0" />
        <span>Kiosk</span>
      </button>

      {showDialog && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            className="relative bg-background border border-border rounded-2xl shadow-2xl p-8 w-[320px] flex flex-col items-center gap-5"
            data-testid="kiosk-unlock-dialog"
          >
            <button
              onClick={handleClose}
              data-testid="btn-kiosk-dialog-close"
              className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                boxShadow: "0 0 20px rgba(124,58,237,0.45)",
              }}
            >
              <Shield className="h-6 w-6 text-white" />
            </div>

            <div className="text-center">
              <p className="font-bold text-[15px] text-foreground">Exit Kiosk Mode</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">Enter your 4-digit PIN to unlock</p>
            </div>

            <div
              className={[
                "flex gap-3 transition-all duration-150",
                shake ? "animate-[wiggle_0.4s_ease-in-out]" : "",
              ].join(" ")}
              style={shake ? { animation: "wiggle 0.4s ease-in-out" } : {}}
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
                    "w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-muted/30 outline-none transition-all duration-150 caret-transparent",
                    error
                      ? "border-destructive text-destructive"
                      : digit
                      ? "border-primary text-foreground"
                      : "border-border text-foreground focus:border-primary",
                  ].join(" ")}
                />
              ))}
            </div>

            {error && (
              <p className="text-[12px] text-destructive font-medium -mt-1">
                Incorrect PIN. Try again.
              </p>
            )}

            <button
              onClick={() => {
                const fullPin = pin.join("");
                if (fullPin.length === 4) tryUnlock(fullPin);
              }}
              data-testid="btn-kiosk-unlock"
              disabled={pin.join("").length < 4}
              className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}
            >
              <span className="flex items-center justify-center gap-2">
                <Unlock className="h-3.5 w-3.5" />
                Unlock
              </span>
            </button>

            <p className="text-[10.5px] text-muted-foreground">
              Default PIN: <span className="font-mono font-bold">{DEFAULT_KIOSK_PIN}</span>
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wiggle {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </>
  );
}
