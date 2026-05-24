import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useBranchBusiness } from "@/hooks/use-branch-business";
import { ArrowRight, ArrowLeft, X, Zap } from "lucide-react";

interface TourStep {
  target: string | null;
  title: string;
  body: string;
}

function getSteps(subtype: string | null | undefined, storeName: string): TourStep[] {
  const name = storeName || "your store";

  const intro: TourStep = {
    target: null,
    title: `Welcome to ${name}`,
    body: "I'll walk you through the key parts of your POS — tap Next and I'll highlight each one.",
  };

  const posStep: TourStep = {
    target: '[data-tour="tour-nav-pos"]',
    title: "Point of Sale",
    body: "This is where you sell. Tap products to add to cart, collect payment in seconds — cash, card, or e-wallet. Works offline too.",
  };

  const moreStep: TourStep = {
    target: '[data-tour="tour-nav-more"]',
    title: "Your full toolkit",
    body: "Everything else lives here — Products, Analytics, Shifts, Customers, and more. Tap to explore your complete menu of tools.",
  };

  let midSteps: TourStep[] = [];
  let outroBody = "You're all set. Start by adding your products, open a shift, and make your first sale.";

  if (subtype === "restaurant" || subtype === "bar") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Live order queue",
        body: "Every order placed at the POS appears here instantly. Your kitchen team marks them ready — no more shouting across the floor.",
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: "Kitchen Display",
        body: "Mount this on a separate screen for your kitchen. Orders stream in live and your team marks them done — smooth service every time.",
      },
    ];
    outroBody = "Add your menu in Products → open a Shift → take your first table order at the POS.";
  } else if (subtype === "cafe" || subtype === "bakery" || subtype === "food_truck") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Order queue",
        body: "Every order lines up here so your baristas or kitchen crew always know what to make next. No paper, no confusion.",
      },
    ];
    outroBody = "Add your menu in Products → open a Shift → ring up your first order at the POS.";
  } else if (subtype === "salon" || subtype === "barbershop" || subtype === "nail_salon" || subtype === "spa" || subtype === "massage" || subtype === "pet_grooming" || subtype === "photography" || subtype === "cleaning" || subtype === "tutoring") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Appointments",
        body: "Book clients by date, time, and staff member. Your full calendar lives here — no double-bookings, no missed appointments.",
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Active jobs",
        body: "Current jobs and walk-in orders queue here so nothing slips through. Your team sees exactly what's next.",
      },
    ];
    outroBody = "Add your services in Products → add your first client in Customers → book an Appointment.";
  } else if (subtype === "clinic" || subtype === "dental") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Patient appointments",
        body: "Schedule consultations and procedures by date, time, and doctor. Prevents overbooking and keeps patients on time.",
      },
    ];
    outroBody = "Add your services in Products → register patients in Customers → schedule Appointments.";
  } else if (subtype === "gym") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Class & session bookings",
        body: "Book PT sessions and group classes here. Assign to specific trainers, set time blocks, and keep your floor organized.",
      },
    ];
    outroBody = "Create membership plans in Products → register members in Customers → book their first session.";
  } else if (subtype === "laundry" || subtype === "car_wash" || subtype === "repair" || subtype === "auto_repair") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Job queue",
        body: "Every active job shows here. Your team marks jobs complete when done — customers know exactly when to come back.",
      },
    ];
    outroBody = "Add your services in Products → log a new job at the POS → track it in Pending.";
  } else {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Active orders",
        body: "Live orders and jobs queue here. Your team marks them complete — nothing gets lost or forgotten.",
      },
    ];
  }

  const outro: TourStep = {
    target: null,
    title: "Ready to run your business",
    body: outroBody,
  };

  // Filter mid steps where target might not exist — we'll handle that at render time
  return [intro, posStep, ...midSteps, moreStep, outro];
}

const PADDING = 10; // px of padding around highlighted element

interface SpotlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function useTargetRect(selector: string | null, visible: boolean): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const measure = useCallback(() => {
    if (!selector) { setRect(null); return; }
    const el = document.querySelector(selector);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({
      x: r.left - PADDING,
      y: r.top - PADDING,
      w: r.width + PADDING * 2,
      h: r.height + PADDING * 2,
    });
  }, [selector]);

  useEffect(() => {
    if (!visible) return;
    measure();
    // Re-measure after a short delay to catch any layout shifts
    const t = setTimeout(measure, 150);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [visible, measure]);

  return rect;
}

function Spotlight({ rect, vw, vh }: { rect: SpotlightRect; vw: number; vh: number }) {
  const id = "tour-mask";
  const r = 14; // border-radius of cutout

  return (
    <svg
      style={{
        position: "fixed",
        inset: 0,
        width: vw,
        height: vh,
        zIndex: 998,
        pointerEvents: "none",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <defs>
        <mask id={id}>
          <rect x={0} y={0} width={vw} height={vh} fill="white" />
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            rx={r}
            ry={r}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x={0}
        y={0}
        width={vw}
        height={vh}
        fill="rgba(0,0,0,0.72)"
        mask={`url(#${id})`}
      />
      {/* Glowing border around cutout */}
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={r}
        ry={r}
        fill="none"
        stroke="rgba(139,92,246,0.8)"
        strokeWidth={2}
      />
    </svg>
  );
}

function TourCard({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  vw,
  vh,
  onNext,
  onPrev,
  onSkip,
  entering,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: SpotlightRect | null;
  vw: number;
  vh: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  entering: boolean;
}) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const hasPrev = stepIndex > 0;
  const cardW = Math.min(vw - 32, 340);

  // Position card: above/below the spotlight, or centered
  let top: number;
  let left: number;
  const CARD_H_EST = 180; // estimated card height
  const GAP = 16;

  if (!targetRect) {
    // Centered
    top = vh / 2 - CARD_H_EST / 2;
    left = (vw - cardW) / 2;
  } else {
    const elMidY = targetRect.y + targetRect.h / 2;
    if (elMidY > vh / 2) {
      // Element in bottom half → card above
      top = Math.max(8, targetRect.y - CARD_H_EST - GAP);
    } else {
      // Element in top half → card below
      top = targetRect.y + targetRect.h + GAP;
    }
    // Horizontally center under/over the element, clamped to screen
    const elCenterX = targetRect.x + targetRect.w / 2;
    left = Math.max(16, Math.min(vw - cardW - 16, elCenterX - cardW / 2));
  }

  return (
    <div
      style={{
        position: "fixed",
        top,
        left,
        width: cardW,
        zIndex: 999,
        transition: "top 0.3s cubic-bezier(0.4,0,0.2,1), left 0.3s cubic-bezier(0.4,0,0.2,1)",
        animation: entering ? "tour-card-in 280ms cubic-bezier(0.22,1,0.36,1) both" : undefined,
      }}
    >
      <div className="bg-white dark:bg-[#18181f] rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 bg-border/50 w-full">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="p-4">
          {/* Step count + close */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
              {stepIndex + 1} / {totalSteps}
            </span>
            <button
              onClick={onSkip}
              className="w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Icon for non-targeted steps */}
          {!targetRect && (
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Zap className="w-4.5 h-4.5 text-primary" />
            </div>
          )}

          <h3 className="font-bold text-foreground text-[15px] leading-snug mb-1.5">
            {step.title}
          </h3>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            {step.body}
          </p>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex items-center gap-2">
          {hasPrev ? (
            <button
              onClick={onPrev}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onSkip}
              className="text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-medium px-1"
            >
              Skip tour
            </button>
          )}

          <button
            onClick={onNext}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary text-white text-[13px] font-semibold transition-all active:scale-95"
          >
            {isLast ? "Let's go!" : (
              <>
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Arrow pointer toward highlighted element */}
      {targetRect && (() => {
        const elMidY = targetRect.y + targetRect.h / 2;
        const isAbove = elMidY > vh / 2;
        if (!isAbove) return null; // arrow only when card is above element
        const arrowLeft = Math.max(16, Math.min(
          cardW - 32,
          (targetRect.x + targetRect.w / 2) - left - 8
        ));
        return (
          <div
            className="absolute"
            style={{
              bottom: -6,
              left: arrowLeft,
              width: 12,
              height: 6,
              overflow: "hidden",
            }}
          >
            <div
              className="w-3 h-3 bg-white dark:bg-[#18181f] border border-border rotate-45 absolute"
              style={{ bottom: 3, left: 0 }}
            />
          </div>
        );
      })()}
    </div>
  );
}

export function AppTour() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { businessSubType } = useBranchBusiness();

  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [entering, setEntering] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);

  const storeName: string = (settings as any)?.storeName || "";
  const storageKey = user?.id ? `artix-tour-v2-${user.id}` : null;

  const steps = getSteps(businessSubType, storeName);

  // Show after onboarding is complete
  useEffect(() => {
    if (!storageKey) return;
    if (localStorage.getItem(storageKey)) return;
    if (!settings?.onboardingComplete) return;
    const t = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(t);
  }, [storageKey, settings?.onboardingComplete]);

  // Track viewport size
  useEffect(() => {
    const handler = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const step = steps[stepIndex];
  const targetRect = useTargetRect(step?.target ?? null, visible);

  const dismiss = useCallback(() => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setExiting(true);
    setTimeout(() => setVisible(false), 280);
  }, [storageKey]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      dismiss();
    } else {
      setEntering(true);
      setStepIndex(i => i + 1);
      // Reset entering flag so animation can re-trigger
      requestAnimationFrame(() => setEntering(false));
      setTimeout(() => setEntering(true), 20);
    }
  }, [stepIndex, steps.length, dismiss]);

  const prev = useCallback(() => {
    if (stepIndex > 0) {
      setEntering(true);
      setStepIndex(i => i - 1);
      requestAnimationFrame(() => setEntering(false));
      setTimeout(() => setEntering(true), 20);
    }
  }, [stepIndex]);

  // Skip steps whose target doesn't exist in the DOM
  useEffect(() => {
    if (!visible || !step) return;
    if (step.target === null) return; // intro/outro always shown
    const el = document.querySelector(step.target);
    if (!el && stepIndex < steps.length - 1) {
      // Auto-skip this step
      setStepIndex(i => i + 1);
    }
  }, [visible, step, stepIndex, steps.length]);

  if (!visible || !step) return null;

  const hasTarget = targetRect !== null;

  return (
    <>
      <style>{`
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tour-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Full overlay when no target (intro/outro) */}
      {!hasTarget && (
        <div
          className="fixed inset-0 z-[998]"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
            animation: "tour-overlay-in 300ms ease both",
            opacity: exiting ? 0 : 1,
            transition: "opacity 280ms ease",
          }}
          onClick={next}
        />
      )}

      {/* Spotlight for targeted steps */}
      {hasTarget && targetRect && (
        <Spotlight rect={targetRect} vw={vw} vh={vh} />
      )}

      {/* Block clicks on everything except the highlighted element */}
      {hasTarget && targetRect && (
        <>
          {/* Top */}
          <div className="fixed z-[998]" style={{ top: 0, left: 0, right: 0, height: targetRect.y }} onClick={next} />
          {/* Bottom */}
          <div className="fixed z-[998]" style={{ top: targetRect.y + targetRect.h, left: 0, right: 0, bottom: 0 }} onClick={next} />
          {/* Left */}
          <div className="fixed z-[998]" style={{ top: targetRect.y, left: 0, width: targetRect.x, height: targetRect.h }} onClick={next} />
          {/* Right */}
          <div className="fixed z-[998]" style={{ top: targetRect.y, left: targetRect.x + targetRect.w, right: 0, height: targetRect.h }} onClick={next} />
        </>
      )}

      {/* Tour card */}
      <TourCard
        step={step}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        targetRect={hasTarget ? targetRect : null}
        vw={vw}
        vh={vh}
        onNext={next}
        onPrev={prev}
        onSkip={dismiss}
        entering={entering}
      />
    </>
  );
}
