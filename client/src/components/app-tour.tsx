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

  // ── Universal steps ────────────────────────────────────────────────────────

  const intro: TourStep = {
    target: null,
    title: `Welcome to ${name} 👋`,
    body: "ArtixPOS is your all-in-one business OS — sales, inventory, staff, and analytics in one place. I'll walk you through each section. Tap Next to start.",
  };

  const dashboardHero: TourStep = {
    target: '[data-tour="tour-dashboard-hero"]',
    title: "Today's Revenue",
    body: "This is your command center. At a glance you see today's total revenue, how many orders were completed, and your average order value. It updates in real time every time a sale is made.",
  };

  const dashboardKpi: TourStep = {
    target: '[data-tour="tour-dashboard-kpi"]',
    title: "Key Numbers",
    body: "These four cards show your total transactions, net revenue, average order size, and tax collected — all for today. Scroll down to see your best-selling products, payment method breakdown, and end-of-day summary.",
  };

  const posStep: TourStep = {
    target: '[data-tour="tour-nav-pos"]',
    title: "Point of Sale",
    body: "This is where every sale happens. Tap a product to add it to the cart, apply discounts or modifiers, then collect payment — cash, card, GCash, Maya, or any method you've set up. Receipts print automatically. It works even without internet.",
  };

  const moreStep: TourStep = {
    target: '[data-tour="tour-nav-more"]',
    title: "More — Your Full Toolkit",
    body: "Tap here to access everything else: Products, Inventory, Customers, Transactions, Analytics, Expenses, Shifts, Staff, Discounts, Loyalty, and Settings. It's organized into sections — Service, Operations, Management, Finance, and Tools.",
  };

  const productsStep: TourStep = {
    target: null,
    title: "Products & Menu",
    body: "In Products (inside More), add everything you sell — items, services, or packages. Set prices, upload photos, group by category, add modifiers like size or add-ons, and set stock levels. Your POS pulls directly from this list.",
  };

  const analyticsStep: TourStep = {
    target: null,
    title: "Analytics & Reports",
    body: "Analytics (inside More) shows your sales trends, best sellers, payment method breakdown, and hourly traffic. Use it to decide what to restock, which items to promote, and when you're busiest.",
  };

  const shiftsStep: TourStep = {
    target: null,
    title: "Shifts & Cash Management",
    body: "Open a Shift before your staff starts selling. It tracks starting cash, all sales during the shift, and produces a cash-out report at the end. This keeps your cash drawer accountable and gives you a clean end-of-day summary.",
  };

  const settingsStep: TourStep = {
    target: null,
    title: "Settings",
    body: "In Settings (inside More → Tools), update your store name, tax rate, currency, and payment methods. You can also manage your team's roles and access, connect a receipt printer, and upgrade to Pro for advanced features.",
  };

  // ── Business-type specific steps ──────────────────────────────────────────

  let midSteps: TourStep[] = [];
  let outroBody = "Start here: Add your products → Open a Shift → Make your first sale at the POS.";

  if (subtype === "restaurant" || subtype === "bar") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Live Order Queue",
        body: "Every order placed at the POS appears here the instant it's submitted. Your floor staff can monitor status and mark orders ready for pickup. No more shouting across the floor or lost tickets.",
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: "Kitchen Display System",
        body: "Mount a tablet in your kitchen and open this screen. Orders stream in live as they're placed — your kitchen crew marks each one done. When it's ready, the floor staff is notified. Zero paper tickets, zero miscommunication.",
      },
    ];
    outroBody = "Add your menu in Products → Open a Shift → Take your first table order at the POS → Watch it appear in the Kitchen Display.";
  } else if (subtype === "cafe" || subtype === "bakery" || subtype === "food_truck") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Order Queue",
        body: "Every order lines up here the moment it's placed. Your baristas or kitchen crew can see exactly what to make next — in order, with all the modifiers. No paper slips, no 'I forgot to call their name'.",
      },
    ];
    outroBody = "Add your menu in Products → Open a Shift → Ring up your first order at the POS → Track it in the Order Queue.";
  } else if (subtype === "salon" || subtype === "barbershop" || subtype === "nail_salon" || subtype === "spa" || subtype === "massage" || subtype === "pet_grooming" || subtype === "photography" || subtype === "cleaning" || subtype === "tutoring") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Appointments Calendar",
        body: "Book clients by date, time, and specific staff member. The calendar prevents double-bookings automatically. You can set service durations, add walk-ins on the fly, and see your team's full schedule at a glance. Clients can be tracked in Customers for repeat bookings.",
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Active Jobs",
        body: "Walk-ins and in-progress appointments queue here. Your team marks jobs complete when done — so the front desk always knows who's being served, who's waiting, and what's next. Nothing slips through.",
      },
    ];
    outroBody = "Add your services in Products → Add your first client in Customers → Book an Appointment → Collect payment at the POS.";
  } else if (subtype === "clinic" || subtype === "dental") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Patient Appointments",
        body: "Schedule consultations, procedures, and follow-ups by date, time, and doctor. The system prevents overbooking and lets you track each patient's visit history in Customers. Perfect for coordinating front desk with clinical staff.",
      },
    ];
    outroBody = "Add your services in Products → Register patients in Customers → Schedule Appointments → Bill at the POS.";
  } else if (subtype === "gym") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Class & Session Bookings",
        body: "Book PT sessions and group classes here. Assign to specific trainers, block time slots, and keep your floor organized. Members can be tracked in Customers with their membership plan and attendance history.",
      },
    ];
    outroBody = "Create membership plans in Products → Register members in Customers → Book sessions in Appointments → Collect payment at the POS.";
  } else if (subtype === "laundry" || subtype === "car_wash" || subtype === "repair" || subtype === "auto_repair") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Job Queue",
        body: "Every active job shows up here after it's logged at the POS. Your team marks jobs in-progress or complete — so the front desk knows exactly what's ready for pickup. Customers get their item back faster, you get fewer 'is it done yet?' calls.",
      },
    ];
    outroBody = "Add your services in Products → Log a new job at the POS → Track its progress in the Job Queue → Collect payment when done.";
  } else {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Active Orders",
        body: "All live orders queue here after they're placed. Your team marks them complete when done — so nothing gets lost, forgotten, or mixed up. Great for any business that has a gap between placing an order and fulfilling it.",
      },
    ];
  }

  const outro: TourStep = {
    target: null,
    title: "You're ready! 🚀",
    body: outroBody,
  };

  return [
    intro,
    dashboardHero,
    dashboardKpi,
    posStep,
    ...midSteps,
    moreStep,
    productsStep,
    analyticsStep,
    shiftsStep,
    settingsStep,
    outro,
  ];
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
    // Find the first element matching the selector that is actually visible
    // (non-zero size). This skips desktop sidebar items hidden on mobile.
    const candidates = document.querySelectorAll(selector);
    let el: Element | null = null;
    for (const candidate of candidates) {
      const r = candidate.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { el = candidate; break; }
    }
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
    setRect(null);
    // Stagger retries: scroll animation from previous step may still be running
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 300);
    const t3 = setTimeout(measure, 600);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
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
  const isLast = stepIndex === totalSteps - 1;
  const hasPrev = stepIndex > 0;

  // Floating pill strip: full width with side margins
  const stripH = 52; // px — single-row pill height
  const sidePad = 16;
  const GAP = 12;
  // Minimum top to never overlap the sticky mobile header (~52px + some room)
  const HEADER_CLEARANCE = 62;

  let top: number;

  if (!targetRect) {
    // No spotlight — center vertically
    top = vh / 2 - stripH / 2;
  } else {
    const elMidY = targetRect.y + targetRect.h / 2;
    if (elMidY > vh / 2) {
      // Element in bottom half → strip above it, clamped below header
      top = Math.max(HEADER_CLEARANCE, targetRect.y - stripH - GAP);
    } else {
      // Element in top half → strip below it
      top = Math.min(vh - stripH - GAP, targetRect.y + targetRect.h + GAP);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top,
        left: sidePad,
        right: sidePad,
        zIndex: 999,
        transition: "top 0.3s cubic-bezier(0.4,0,0.2,1)",
        animation: entering ? "tour-card-in 280ms cubic-bezier(0.22,1,0.36,1) both" : undefined,
      }}
    >
      {/* Floating pill strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: stripH,
          padding: "0 10px 0 12px",
          borderRadius: 999,
          background: "rgba(13,13,22,0.93)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Left progress accent line */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: 2,
            width: `${((stepIndex + 1) / totalSteps) * 100}%`,
            background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
            borderRadius: "0 2px 2px 0",
            transition: "width 0.3s ease",
          }}
        />

        {/* Back / Skip */}
        {hasPrev ? (
          <button
            onClick={onPrev}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{ color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={onSkip}
            className="shrink-0 text-[11px] font-medium transition-colors px-1"
            style={{ color: "rgba(255,255,255,0.22)" }}
          >
            Skip
          </button>
        )}

        {/* Title + step count — takes remaining space */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] font-semibold truncate leading-tight"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {step.title}
          </p>
          <p
            className="text-[10px] leading-tight mt-[1px]"
            style={{ color: "rgba(167,139,250,0.65)" }}
          >
            {stepIndex + 1} of {totalSteps}
          </p>
        </div>

        {/* Next / Finish — compact pill button */}
        <button
          onClick={onNext}
          className="shrink-0 flex items-center gap-1 text-[12px] font-semibold text-white transition-all active:scale-95 rounded-full px-4 h-8"
          style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
        >
          {isLast ? "Done" : (<>Next <ArrowRight className="w-3 h-3" /></>)}
        </button>

        {/* Close */}
        <button
          onClick={onSkip}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
          style={{ color: "rgba(255,255,255,0.2)" }}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
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

  // Listen for manual replay trigger from Settings
  useEffect(() => {
    const handler = () => {
      if (storageKey) localStorage.removeItem(storageKey);
      setStepIndex(0);
      setExiting(false);
      setEntering(true);
      setVisible(true);
    };
    window.addEventListener("artix:replay-tour", handler);
    return () => window.removeEventListener("artix:replay-tour", handler);
  }, [storageKey]);

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

  // Auto-scroll to target for non-fixed elements (dashboard cards etc.)
  useEffect(() => {
    if (!visible || !step?.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    const pos = window.getComputedStyle(el).position;
    if (pos !== "fixed" && pos !== "sticky") {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [visible, step?.target]);

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
        @keyframes tour-ring-pulse {
          0%   { box-shadow: 0 0 0 0px rgba(139,92,246,0.7); }
          70%  { box-shadow: 0 0 0 10px rgba(139,92,246,0); }
          100% { box-shadow: 0 0 0 0px rgba(139,92,246,0); }
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

      {/* Single pulsing ring — rendered in root stacking context so it works
          for fixed elements (bottom nav) and regular elements alike */}
      {hasTarget && targetRect && (
        <div
          style={{
            position: "fixed",
            top: targetRect.y,
            left: targetRect.x,
            width: targetRect.w,
            height: targetRect.h,
            zIndex: 999,
            borderRadius: 24,
            border: "2.5px solid rgba(139,92,246,0.95)",
            pointerEvents: "none",
            animation: "tour-ring-pulse 1.5s ease-out infinite",
          }}
        />
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
