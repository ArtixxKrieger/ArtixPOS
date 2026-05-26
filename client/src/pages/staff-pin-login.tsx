import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, Delete, Lock, CheckCircle2, LogOut,
  User, ChevronLeft, ShieldAlert, Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RosterMember {
  id: string;
  name: string | null;
  role: string;
  avatar: string | null;
  hasPin: boolean;
  isLocked: boolean;
}

// ── PIN Numpad ────────────────────────────────────────────────────────────────

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex items-center gap-3 justify-center my-6">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={[
            "w-3.5 h-3.5 rounded-full border-2 transition-all duration-150",
            i < filled
              ? "bg-primary border-primary scale-110"
              : "border-muted-foreground/30 bg-transparent",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

function Numpad({ onDigit, onDelete, disabled }: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-[260px] mx-auto">
      {keys.map((k, i) => {
        if (k === "") return <div key={i} />;
        const isDelete = k === "⌫";
        return (
          <button
            key={k}
            disabled={disabled}
            onClick={() => isDelete ? onDelete() : onDigit(k)}
            className={[
              "h-14 rounded-2xl text-xl font-semibold transition-all duration-100",
              "active:scale-95 select-none",
              disabled ? "opacity-40 cursor-not-allowed" : "",
              isDelete
                ? "bg-muted/60 hover:bg-muted text-muted-foreground"
                : "bg-white dark:bg-white/8 hover:bg-primary/10 dark:hover:bg-primary/15 border border-border/50 shadow-sm text-foreground",
            ].join(" ")}
          >
            {isDelete ? <Delete className="w-5 h-5 mx-auto" /> : k}
          </button>
        );
      })}
    </div>
  );
}

// ── Staff card ────────────────────────────────────────────────────────────────

function StaffCard({ member, onClick }: { member: RosterMember; onClick: () => void }) {
  const initials = (member.name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const roleColor: Record<string, string> = {
    manager: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
    admin:   "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    cashier: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  };
  return (
    <button
      onClick={onClick}
      disabled={member.isLocked || !member.hasPin}
      className={[
        "flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all duration-200 text-center",
        "bg-white dark:bg-white/5",
        member.isLocked
          ? "border-destructive/30 opacity-60 cursor-not-allowed"
          : !member.hasPin
          ? "border-dashed border-border/40 opacity-50 cursor-not-allowed"
          : "border-border/50 hover:border-primary/40 hover:shadow-md shadow-sm hover:-translate-y-0.5",
      ].join(" ")}
    >
      <div className="relative">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
          {member.avatar
            ? <img src={member.avatar} className="w-12 h-12 rounded-xl object-cover" alt={member.name ?? ""} />
            : initials}
        </div>
        {member.isLocked && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
            <Lock className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-tight">{member.name ?? "Unknown"}</p>
        <span className={["text-[10px] font-medium px-1.5 py-0.5 rounded-full", roleColor[member.role] ?? roleColor.cashier].join(" ")}>
          {member.role}
        </span>
      </div>
      {!member.hasPin && (
        <p className="text-[10px] text-muted-foreground">No PIN set</p>
      )}
      {member.isLocked && (
        <p className="text-[10px] text-destructive">Locked</p>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StaffPinLogin() {
  const { user: ownerUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<"roster" | "pin" | "success">("roster");
  const [selectedMember, setSelectedMember] = useState<RosterMember | null>(null);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  const PIN_LENGTH = 6;

  // Get the active branch from the owner's session
  const branchId = (ownerUser as any)?.activeBranchId ?? null;

  // Fetch roster
  const { data: roster = [], isLoading } = useQuery<RosterMember[]>({
    queryKey: ["/api/staff-pin/roster", branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const res = await apiRequest("GET", `/api/staff-pin/roster?branchId=${branchId}`);
      return res.json();
    },
    enabled: !!branchId,
    refetchOnWindowFocus: false,
  });

  // Filter to non-owner staff only
  const staffRoster = roster.filter(m => m.role !== "owner");

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
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      setPhase("success");
      setTimeout(() => setLocation("/"), 1200);
    },
    onError: (err: any) => {
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      if (err?.lockedUntil) setLockedUntil(err.lockedUntil);
      toast({ title: err.message ?? "Incorrect PIN", variant: "destructive" });
    },
  });

  function handleDigit(d: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      loginMutation.mutate(next);
    }
  }

  function handleDelete() {
    setPin(p => p.slice(0, -1));
  }

  function selectMember(member: RosterMember) {
    setSelectedMember(member);
    setPin("");
    setLockedUntil(null);
    setPhase("pin");
  }

  // ── Roster view ────────────────────────────────────────────────────────────
  if (phase === "roster") {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-violet-50 via-white to-blue-50 dark:from-[#0c0c18] dark:via-[#080810] dark:to-[#0a0c18]">
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.05] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }} />

        <header className="relative z-10 px-5 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/30">
              <ShoppingCart className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xs font-bold tracking-[0.15em] text-primary/80 uppercase">ArtixPOS</span>
          </div>
          {ownerUser && (
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="text-muted-foreground gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Manager view
            </Button>
          )}
        </header>

        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-8">
          <div className="w-full max-w-xl">
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mb-2">
                Who's clocking in?
              </h1>
              <p className="text-sm text-muted-foreground">Select your name, then enter your PIN</p>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-white/60 dark:bg-white/5 border border-border/30 animate-pulse" />
                ))}
              </div>
            ) : staffRoster.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">No staff assigned to this branch</p>
                <p className="text-xs text-muted-foreground">Go to Team &rarr; Users to add staff and set their PINs</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {staffRoster.map(m => (
                  <StaffCard key={m.id} member={m} onClick={() => selectMember(m)} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── PIN entry view ─────────────────────────────────────────────────────────
  if (phase === "pin" && selectedMember) {
    const isLocked = !!lockedUntil && new Date(lockedUntil) > new Date();
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-violet-50 via-white to-blue-50 dark:from-[#0c0c18] dark:via-[#080810] dark:to-[#0a0c18]">
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.05] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }} />

        <header className="relative z-10 px-5 py-4">
          <button
            onClick={() => { setPhase("roster"); setPin(""); setLockedUntil(null); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        </header>

        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 pb-10">
          <div className="w-full max-w-xs text-center">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3 text-primary font-bold text-lg">
              {selectedMember.avatar
                ? <img src={selectedMember.avatar} className="w-16 h-16 rounded-2xl object-cover" alt="" />
                : (selectedMember.name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-0.5">{selectedMember.name}</h2>
            <p className="text-xs text-muted-foreground mb-2 capitalize">{selectedMember.role}</p>

            {isLocked ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6 text-destructive" />
                </div>
                <p className="text-sm font-semibold text-destructive">PIN Locked</p>
                <p className="text-xs text-muted-foreground">Too many wrong attempts. Ask your manager to unlock.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Enter your PIN</p>
                <div className={shake ? "animate-bounce" : ""}>
                  <PinDots length={PIN_LENGTH} filled={pin.length} />
                </div>
                {loginMutation.isPending && (
                  <p className="text-xs text-muted-foreground mb-4">Verifying...</p>
                )}
                <Numpad
                  onDigit={handleDigit}
                  onDelete={handleDelete}
                  disabled={loginMutation.isPending}
                />
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Success view ───────────────────────────────────────────────────────────
  if (phase === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 via-white to-blue-50 dark:from-[#0c0c18] dark:via-[#080810] dark:to-[#0a0c18]">
        <div className="text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-extrabold text-foreground mb-1">Welcome, {selectedMember?.name?.split(" ")[0]}!</h2>
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> Clocked in at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
