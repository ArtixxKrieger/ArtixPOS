import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useBranchBusiness } from "@/hooks/use-branch-business";
import { ArrowRight, ArrowLeft, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TourStep {
  target: string | null;
  title: string;
  body: string;
}

type TFunc = (key: string, options?: any) => string;

function getCategory(subtype: string | null | undefined): "food" | "retail" | "salon" | "wellness" | "clinic" | "gym" | "queue_service" | "appointment_service" | "other" {
  if (!subtype) return "other";
  if (["cafe", "restaurant", "bakery", "bar", "food_truck"].includes(subtype)) return "food";
  if (["clothing", "electronics", "grocery", "bookstore", "pharmacy", "perishable_goods", "drugstore"].includes(subtype)) return "retail";
  if (["salon", "barbershop", "nail_salon"].includes(subtype)) return "salon";
  if (["spa", "massage"].includes(subtype)) return "wellness";
  if (["clinic", "dental"].includes(subtype)) return "clinic";
  if (subtype === "gym") return "gym";
  if (["laundry", "car_wash", "repair", "auto_repair"].includes(subtype)) return "queue_service";
  if (["pet_grooming", "photography", "cleaning", "tutoring"].includes(subtype)) return "appointment_service";
  return "other";
}

function getSteps(subtype: string | null | undefined, storeName: string, t: TFunc): TourStep[] {
  const name = storeName || t("tour.yourStore");
  const cat = getCategory(subtype);

  const intro: TourStep = {
    target: null,
    title: t("tour.intro.title", { name }),
    body: t(`tour.intro.${cat}`),
  };

  const dashboardHeroBody =
    cat === "food" ? t("tour.dashboardHero.food")
    : cat === "retail" ? t("tour.dashboardHero.retail")
    : cat === "salon" ? t("tour.dashboardHero.salon")
    : cat === "wellness" ? t("tour.dashboardHero.wellness")
    : cat === "clinic" ? t("tour.dashboardHero.clinic")
    : cat === "gym" ? t("tour.dashboardHero.gym")
    : t("tour.dashboardHero.other");

  const dashboardHero: TourStep = {
    target: '[data-tour="tour-dashboard-hero"]',
    title: t("tour.dashboardHero.title"),
    body: dashboardHeroBody,
  };

  const dashboardKpiBody =
    cat === "food" ? t("tour.dashboardKpi.food")
    : cat === "retail" ? t("tour.dashboardKpi.retail")
    : (cat === "salon" || cat === "wellness") ? t("tour.dashboardKpi.salonWellness")
    : cat === "clinic" ? t("tour.dashboardKpi.clinic")
    : cat === "gym" ? t("tour.dashboardKpi.gym")
    : t("tour.dashboardKpi.other");

  const dashboardKpi: TourStep = {
    target: '[data-tour="tour-dashboard-kpi"]',
    title: t("tour.dashboardKpi.title"),
    body: dashboardKpiBody,
  };

  const posBodyKey =
    subtype === "restaurant" ? "restaurant"
    : subtype === "bar" ? "bar"
    : subtype === "cafe" ? "cafe"
    : subtype === "bakery" ? "bakery"
    : subtype === "food_truck" ? "food_truck"
    : (subtype === "clothing" || subtype === "retail") ? "clothing"
    : subtype === "electronics" ? "electronics"
    : (subtype === "grocery" || subtype === "perishable_goods" || subtype === "drugstore" || subtype === "pharmacy") ? "grocery"
    : subtype === "bookstore" ? "bookstore"
    : (subtype === "salon" || subtype === "barbershop" || subtype === "nail_salon") ? "salon"
    : (subtype === "spa" || subtype === "massage") ? "wellness"
    : subtype === "gym" ? "gym"
    : (subtype === "clinic" || subtype === "dental") ? "clinic"
    : subtype === "pet_grooming" ? "pet_grooming"
    : subtype === "laundry" ? "laundry"
    : subtype === "car_wash" ? "car_wash"
    : (subtype === "repair" || subtype === "auto_repair") ? "repair"
    : subtype === "photography" ? "photography"
    : subtype === "cleaning" ? "cleaning"
    : subtype === "tutoring" ? "tutoring"
    : "other";

  const posStep: TourStep = {
    target: '[data-tour="tour-nav-pos"]',
    title: cat === "clinic" ? t("tour.pos.titleClinic")
      : cat === "queue_service" ? t("tour.pos.titleQueue")
      : t("tour.pos.titleDefault"),
    body: t(`tour.pos.${posBodyKey}`),
  };

  const moreBody =
    cat === "food" ? t("tour.more.food")
    : cat === "retail" ? t("tour.more.retail")
    : (cat === "salon" || cat === "wellness" || cat === "appointment_service") ? t("tour.more.salonWellnessAppt")
    : cat === "clinic" ? t("tour.more.clinic")
    : cat === "gym" ? t("tour.more.gym")
    : cat === "queue_service" ? t("tour.more.queue_service")
    : t("tour.more.other");

  const moreStep: TourStep = {
    target: '[data-tour="tour-nav-more"]',
    title: t("tour.more.title"),
    body: moreBody,
  };

  const productsTitle =
    cat === "food" ? t("tour.products.titleFood")
    : cat === "clinic" ? t("tour.products.titleClinic")
    : cat === "gym" ? t("tour.products.titleGym")
    : (cat === "salon" || cat === "wellness") ? t("tour.products.titleSalonWellness")
    : cat === "appointment_service" ? t("tour.products.titleAppt")
    : cat === "queue_service" ? t("tour.products.titleQueue")
    : t("tour.products.titleDefault");

  const productsBody =
    cat === "food" ? t("tour.products.food")
    : cat === "retail" ? t("tour.products.retail")
    : cat === "salon" ? t("tour.products.salon")
    : cat === "wellness" ? t("tour.products.wellness")
    : cat === "clinic" ? t("tour.products.clinic")
    : cat === "gym" ? t("tour.products.gym")
    : cat === "queue_service" ? t("tour.products.queue_service")
    : cat === "appointment_service" ? t("tour.products.appointment_service")
    : t("tour.products.other");

  const productsStep: TourStep = {
    target: null,
    title: productsTitle,
    body: productsBody,
  };

  const customersTitle =
    cat === "clinic" ? t("tour.customers.titleClinic")
    : cat === "gym" ? t("tour.customers.titleGym")
    : t("tour.customers.titleDefault");

  const customersBody =
    cat === "salon" ? t("tour.customers.salon")
    : cat === "wellness" ? t("tour.customers.wellness")
    : cat === "clinic" ? t("tour.customers.clinic")
    : cat === "gym" ? t("tour.customers.gym")
    : subtype === "pet_grooming" ? t("tour.customers.pet_grooming")
    : subtype === "tutoring" ? t("tour.customers.tutoring")
    : t("tour.customers.other");

  const customersStep: TourStep = {
    target: null,
    title: customersTitle,
    body: customersBody,
  };

  const analyticsBody =
    cat === "food" ? t("tour.analytics.food")
    : cat === "retail" ? t("tour.analytics.retail")
    : (cat === "salon" || cat === "wellness") ? t("tour.analytics.salonWellness")
    : cat === "clinic" ? t("tour.analytics.clinic")
    : cat === "gym" ? t("tour.analytics.gym")
    : cat === "queue_service" ? t("tour.analytics.queue_service")
    : t("tour.analytics.other");

  const analyticsStep: TourStep = {
    target: null,
    title: t("tour.analytics.title"),
    body: analyticsBody,
  };

  const shiftsBody =
    cat === "food" ? t("tour.shifts.food")
    : cat === "retail" ? t("tour.shifts.retail")
    : (cat === "salon" || cat === "wellness" || cat === "appointment_service") ? t("tour.shifts.salonWellnessAppt")
    : cat === "clinic" ? t("tour.shifts.clinic")
    : cat === "gym" ? t("tour.shifts.gym")
    : t("tour.shifts.other");

  const shiftsStep: TourStep = {
    target: null,
    title: t("tour.shifts.title"),
    body: shiftsBody,
  };

  const settingsBody =
    cat === "food" ? t("tour.settings.food")
    : cat === "retail" ? t("tour.settings.retail")
    : (cat === "salon" || cat === "wellness") ? t("tour.settings.salonWellness")
    : cat === "clinic" ? t("tour.settings.clinic")
    : cat === "gym" ? t("tour.settings.gym")
    : t("tour.settings.other");

  const settingsStep: TourStep = {
    target: null,
    title: t("tour.settings.title"),
    body: settingsBody,
  };

  let midSteps: TourStep[] = [];
  let includeCustomers = false;
  let outroBody = t("tour.outro.default");

  if (subtype === "restaurant") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.liveOrderQueue"),
        body: t("tour.mid.liveOrderQueueBody"),
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: t("tour.mid.kitchenDisplay"),
        body: t("tour.mid.kitchenDisplayBody"),
      },
    ];
    outroBody = t("tour.outro.restaurant");
  } else if (subtype === "bar") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.liveTabQueue"),
        body: t("tour.mid.liveTabQueueBody"),
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: t("tour.mid.barKitchen"),
        body: t("tour.mid.barKitchenBody"),
      },
    ];
    outroBody = t("tour.outro.bar");
  } else if (subtype === "cafe") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.cafeQueue"),
        body: t("tour.mid.cafeQueueBody"),
      },
    ];
    outroBody = t("tour.outro.cafe");
  } else if (subtype === "bakery") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.bakeryQueue"),
        body: t("tour.mid.bakeryQueueBody"),
      },
    ];
    outroBody = t("tour.outro.bakery");
  } else if (subtype === "food_truck") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.foodTruckQueue"),
        body: t("tour.mid.foodTruckQueueBody"),
      },
    ];
    outroBody = t("tour.outro.food_truck");
  } else if (cat === "salon") {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: t("tour.mid.salonAppointments"),
        body: t("tour.mid.salonAppointmentsBody"),
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.salonActiveQueue"),
        body: t("tour.mid.salonActiveQueueBody"),
      },
      {
        target: '[data-tour="tour-nav-rooms"]',
        title: subtype === "barbershop" ? t("tour.mid.salonRoomsBarbershop")
          : subtype === "nail_salon" ? t("tour.mid.salonRoomsNail")
          : t("tour.mid.salonRoomsDefault"),
        body: subtype === "barbershop" ? t("tour.mid.salonRoomsBarbershopBody")
          : subtype === "nail_salon" ? t("tour.mid.salonRoomsNailBody")
          : t("tour.mid.salonRoomsDefaultBody"),
      },
    ];
    outroBody = t("tour.outro.salon");
  } else if (cat === "wellness") {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: t("tour.mid.wellnessBooking"),
        body: t("tour.mid.wellnessBookingBody"),
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.wellnessActiveQueue"),
        body: t("tour.mid.wellnessActiveQueueBody"),
      },
      {
        target: '[data-tour="tour-nav-rooms"]',
        title: t("tour.mid.wellnessRoomsDefault"),
        body: subtype === "massage" ? t("tour.mid.wellnessRoomsMassageBody") : t("tour.mid.wellnessRoomsDefaultBody"),
      },
    ];
    outroBody = t("tour.outro.wellness");
  } else if (cat === "clinic") {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: t("tour.mid.clinicAppointments"),
        body: t("tour.mid.clinicAppointmentsBody"),
      },
      {
        target: '[data-tour="tour-nav-rooms"]',
        title: subtype === "dental" ? t("tour.mid.clinicRoomsDental") : t("tour.mid.clinicRoomsDefault"),
        body: subtype === "dental" ? t("tour.mid.clinicRoomsDentalBody") : t("tour.mid.clinicRoomsDefaultBody"),
      },
    ];
    outroBody = t("tour.outro.clinic");
  } else if (cat === "gym") {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: t("tour.mid.gymBookings"),
        body: t("tour.mid.gymBookingsBody"),
      },
      {
        target: '[data-tour="tour-nav-rooms"]',
        title: t("tour.mid.gymRooms"),
        body: t("tour.mid.gymRoomsBody"),
      },
    ];
    outroBody = t("tour.outro.gym");
  } else if (cat === "queue_service") {
    const queueKey =
      subtype === "laundry" ? "laundryQueue"
      : subtype === "car_wash" ? "carWashQueue"
      : "repairQueue";
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t(`tour.mid.${queueKey}`),
        body: t(`tour.mid.${queueKey}Body`),
      },
    ];
    outroBody =
      subtype === "laundry" ? t("tour.outro.laundry")
      : subtype === "car_wash" ? t("tour.outro.car_wash")
      : t("tour.outro.repairQueue");
  } else if (cat === "appointment_service") {
    includeCustomers = true;
    const apptKey =
      subtype === "pet_grooming" ? "petGroomingAppts"
      : subtype === "photography" ? "photographyBookings"
      : subtype === "cleaning" ? "cleaningSchedule"
      : subtype === "tutoring" ? "tutoringSessions"
      : "apptDefault";
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: t(`tour.mid.${apptKey}`),
        body: t(`tour.mid.${apptKey}Body`),
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: t("tour.mid.activeJobsQueue"),
        body: t("tour.mid.activeJobsQueueBody"),
      },
    ];
    outroBody = t("tour.outro.appointment_service");
  } else if (cat === "retail") {
    const invBodyKey =
      subtype === "electronics" ? "retailInventoryElectronics"
      : subtype === "bookstore" ? "retailInventoryBookstore"
      : (subtype === "pharmacy" || subtype === "perishable_goods") ? "retailInventoryPharmacy"
      : "retailInventoryDefault";
    const suppBodyKey =
      (subtype === "grocery" || subtype === "perishable_goods") ? "retailSuppliersGrocery"
      : subtype === "pharmacy" ? "retailSuppliersPharmacy"
      : "retailSuppliersDefault";
    midSteps = [
      {
        target: null,
        title: t("tour.mid.retailInventory"),
        body: t(`tour.mid.${invBodyKey}`),
      },
      {
        target: null,
        title: t("tour.mid.retailSuppliers"),
        body: t(`tour.mid.${suppBodyKey}`),
      },
    ];
    outroBody =
      subtype === "clothing" ? t("tour.outro.clothing")
      : subtype === "electronics" ? t("tour.outro.electronics")
      : (subtype === "grocery" || subtype === "perishable_goods") ? t("tour.outro.grocery")
      : subtype === "pharmacy" ? t("tour.outro.pharmacy")
      : subtype === "bookstore" ? t("tour.outro.bookstore")
      : t("tour.outro.retailDefault");
  } else {
    midSteps = [];
    outroBody = t("tour.outro.other");
  }

  const outro: TourStep = {
    target: null,
    title: t("tour.outro.title"),
    body: outroBody,
  };

  const showPosStep = cat === "food" || cat === "retail" || cat === "queue_service" || cat === "other";

  return [
    intro,
    dashboardHero,
    dashboardKpi,
    ...(showPosStep ? [posStep] : []),
    ...midSteps,
    moreStep,
    productsStep,
    ...(includeCustomers ? [customersStep] : []),
    analyticsStep,
    shiftsStep,
    settingsStep,
    outro,
  ];
}

const PADDING = 10;

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
  const r = 14;

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
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={r} ry={r} fill="black" />
        </mask>
      </defs>
      <rect x={0} y={0} width={vw} height={vh} fill="rgba(0,0,0,0.72)" mask={`url(#${id})`} />
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
  direction,
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
  direction: "forward" | "backward";
}) {
  const { t } = useTranslation();
  const isLast = stepIndex === totalSteps - 1;
  const hasPrev = stepIndex > 0;

  const GAP = 14;
  const HEADER_CLEARANCE = 66;
  const sidePad = Math.max(12, Math.min(20, vw * 0.04));

  const [measuredH, setMeasuredH] = useState(240);
  const cardRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setMeasuredH(node.offsetHeight);

  }, [stepIndex]);

  const cardH = measuredH;

  let top: number;
  if (!targetRect) {
    top = Math.max(HEADER_CLEARANCE, vh / 2 - cardH / 2);
  } else {
    const elMidY = targetRect.y + targetRect.h / 2;
    if (elMidY > vh / 2) {
      top = Math.max(HEADER_CLEARANCE, targetRect.y - cardH - GAP);
    } else {
      top = Math.min(vh - cardH - GAP, targetRect.y + targetRect.h + GAP);
    }
  }

  const progressPct = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        top,
        left: sidePad,
        right: sidePad,
        zIndex: 999,
        transition: "top 0.35s cubic-bezier(0.4,0,0.2,1)",
        animation: entering ? "tour-card-in 300ms cubic-bezier(0.22,1,0.36,1) both" : undefined,
        maxWidth: 420,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <div
        style={{
          borderRadius: 18,
          background: "rgba(14,12,20,0.96)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.04)" }}>
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: "rgba(139,92,246,0.7)",
              transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </div>

        <div
          key={stepIndex}
          style={{
            padding: "14px 14px 14px 18px",
            animation: `tour-step-${direction} 280ms cubic-bezier(0.22,1,0.36,1) both`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
              }}
            >
              {stepIndex + 1} / {totalSteps}
            </span>
            <button
              onClick={onSkip}
              style={{
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.2)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>

          <p
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.3,
              margin: "0 0 8px 0",
            }}
          >
            {step.title}
          </p>

          <p
            style={{
              fontSize: 12.5,
              color: "rgba(255,255,255,0.45)",
              lineHeight: 1.6,
              margin: "0 0 16px 0",
            }}
          >
            {step.body}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {hasPrev ? (
              <button
                onClick={onPrev}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.28)",
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 99,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                <ArrowLeft style={{ width: 10, height: 10 }} />
                {t("tour.nav.back")}
              </button>
            ) : (
              <button
                onClick={onSkip}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.2)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                {t("tour.nav.skip")}
              </button>
            )}

            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === stepIndex ? 14 : 4,
                    height: 4,
                    borderRadius: 99,
                    background: i === stepIndex
                      ? "rgba(255,255,255,0.7)"
                      : i < stepIndex
                        ? "rgba(255,255,255,0.2)"
                        : "rgba(255,255,255,0.08)",
                    transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>

            <button
              onClick={onNext}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                color: "white",
                background: "#3b82f6",
                border: "none",
                borderRadius: 99,
                padding: "6px 14px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {isLast ? t("tour.nav.done") : (<>{t("tour.nav.next")} <ArrowRight style={{ width: 11, height: 11 }} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppTour() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { businessSubType } = useBranchBusiness();

  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [entering, setEntering] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);

  const storeName: string = (settings as any)?.storeName || "";
  const storageKey = user?.id ? `artix-tour-v2-${user.id}` : null;

  const steps = getSteps(businessSubType, storeName, t);

  useEffect(() => {
    if (!storageKey) return;

    if (localStorage.getItem(storageKey)) return;
    if ((settings as any)?.tourSeen) return;
    if (!settings?.onboardingComplete) return;
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);

  }, [storageKey, settings?.onboardingComplete, (settings as any)?.tourSeen]);

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

  useEffect(() => {
    const handler = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const step = steps[stepIndex];
  const targetRect = useTargetRect(step?.target ?? null, visible);

  const dismiss = useCallback(() => {
    if (storageKey) localStorage.setItem(storageKey, "1");

    apiRequest("PATCH", "/api/settings", { tourSeen: 1 }).catch(() => {});
    setExiting(true);
    setTimeout(() => setVisible(false), 280);
  }, [storageKey]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      dismiss();
    } else {
      setDirection("forward");
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, steps.length, dismiss]);

  const prev = useCallback(() => {
    if (stepIndex > 0) {
      setDirection("backward");
      setStepIndex(i => i - 1);
    }
  }, [stepIndex]);

  useEffect(() => {
    if (!visible || !step) return;
    if (step.target === null) return;
    const el = document.querySelector(step.target);
    if (!el && stepIndex < steps.length - 1) {
      setStepIndex(i => i + 1);
    }
  }, [visible, step, stepIndex, steps.length]);

  useEffect(() => {
    if (!visible) return;
    if (stepIndex === 0) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }

  }, [visible]);

  useEffect(() => {
    if (!visible || !step?.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    const computed = window.getComputedStyle(el);
    if (computed.position === "fixed" || computed.position === "sticky") return;

    const POPUP_H_EST = 280;
    const HEADER_CLEAR = 66;
    const GAP = 14;
    const desiredTop = HEADER_CLEAR + POPUP_H_EST + GAP;

    const elRect = el.getBoundingClientRect();
    const currentScrollY = window.scrollY;

    const alreadyOk = elRect.top >= desiredTop - 20 && elRect.bottom <= window.innerHeight - 20;
    if (!alreadyOk) {
      const targetScrollY = currentScrollY + elRect.top - desiredTop;
      window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "instant" as ScrollBehavior });
    }
  }, [visible, step?.target]);

  if (!visible || !step) return null;

  const hasTarget = targetRect !== null;

  return (
    <>
      <style>{`
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
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
        @keyframes tour-step-forward {
          from { opacity: 0; transform: translateX(22px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes tour-step-backward {
          from { opacity: 0; transform: translateX(-22px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

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

      {hasTarget && targetRect && (
        <Spotlight rect={targetRect} vw={vw} vh={vh} />
      )}

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

      {hasTarget && targetRect && (
        <>
          <div className="fixed z-[998]" style={{ top: 0, left: 0, right: 0, height: targetRect.y }} onClick={next} />
          <div className="fixed z-[998]" style={{ top: targetRect.y + targetRect.h, left: 0, right: 0, bottom: 0 }} onClick={next} />
          <div className="fixed z-[998]" style={{ top: targetRect.y, left: 0, width: targetRect.x, height: targetRect.h }} onClick={next} />
          <div className="fixed z-[998]" style={{ top: targetRect.y, left: targetRect.x + targetRect.w, right: 0, height: targetRect.h }} onClick={next} />
        </>
      )}

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
        direction={direction}
      />
    </>
  );
}
