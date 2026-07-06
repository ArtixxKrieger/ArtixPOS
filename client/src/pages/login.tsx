import { useEffect, useRef, useState } from "react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { getDebugLogs, clearDebugLogs, type DebugEntry } from "@/lib/debug-log";
import { apiRequest, setNativeToken, queryClient, nativeFetch } from "@/lib/queryClient";
import { prefetchCriticalData } from "@/lib/prefetch";
import { detectLocale } from "@/lib/locale-detect";
import { getPricingByCurrency, formatPrice } from "@/lib/pricing";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

function isNativePlatform(): boolean {
  try {
    return (
      (
        window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
      ).Capacitor?.isNativePlatform?.() === true
    );
  } catch {
    return false;
  }
}
function diagnoseNativeError(raw: string): string {
  const msg = raw.toLowerCase();
  if (
    msg.includes("10:") ||
    msg.includes("developer_error") ||
    msg.includes("something went wrong")
  )
    return "Google error 10: App signing fingerprint not registered in Google Cloud Console.";
  if (msg.includes("7:") || msg.includes("network"))
    return "Google error 7: Network error — check your internet connection.";
  if (msg.includes("no id token") || msg.includes("idtoken"))
    return "Google sign-in returned no ID token. Ensure GOOGLE_CLIENT_ID is set.";
  return raw;
}
async function nativeGoogleSignIn(): Promise<string> {
  const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
  const { Capacitor } = await import("@capacitor/core");
  const webClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || "";
  const iosClientId = (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string) || webClientId;
  const platform = Capacitor.getPlatform();
  const initOptions: Record<string, string | boolean | string[]> = {
    scopes: ["profile", "email"],
    grantOfflineAccess: true,
  };
  if (webClientId) initOptions.serverClientId = webClientId;
  if (platform === "ios" && iosClientId) initOptions.clientId = iosClientId;
  else if (webClientId) initOptions.clientId = webClientId;
  await GoogleAuth.initialize(initOptions);
  let googleUser: { authentication?: { idToken?: string } };
  try {
    googleUser = await GoogleAuth.signIn();
  } catch (e: unknown) {
    throw new Error(diagnoseNativeError((e as Error)?.message ?? String(e)));
  }
  const idToken = googleUser?.authentication?.idToken;
  if (!idToken) throw new Error(diagnoseNativeError("no id token returned"));
  const res = await apiRequest("POST", "/api/auth/google/native", { idToken });
  const data = await res.json();
  if (!data.token) throw new Error("Server did not return a session token");
  return data.token;
}

const INVITE_STORAGE_KEY = "artixpos_pending_invite";
const OAUTH_FLOW_KEY = "artixpos_oauth_flow";
type AuthMode = "signin" | "register";

function getPasswordStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!pwd || pwd.length < 8) return { score: 0, label: "Too short", color: "#ef4444" };
  const classes = [
    /[a-z]/.test(pwd),
    /[A-Z]/.test(pwd),
    /[0-9]/.test(pwd),
    /[^a-zA-Z0-9]/.test(pwd),
  ].filter(Boolean).length;
  const bonus = pwd.length >= 12 ? 1 : 0;
  const total = classes + bonus;
  if (total <= 2) return { score: 0, label: "Weak", color: "#ef4444" };
  if (total === 3) return { score: 1, label: "Fair", color: "#f97316" };
  if (total === 4) return { score: 2, label: "Strong", color: "#22c55e" };
  return { score: 3, label: "Very strong", color: "#16a34a" };
}

const BLUE = "#3b82f6";
const BLUE2 = "#2563eb";
const NEON = "#60a5fa";
const DARK = "#09090b";
const DARK2 = "#111111";
const CARD = "rgba(17,17,17,0.92)";

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("sr-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
    );

    document.querySelectorAll(".sr").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function useCardTilt() {}

function useLandingAnimations(
  lpScrollRef: React.RefObject<HTMLDivElement | null>,
  dashWrapRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scroller = lpScrollRef.current;
    if (!scroller || reduced) return;

    const extraCleanup: Array<() => void> = [];

    const ctx = gsap.context(() => {
      gsap.set(".gsap-h-line > *", { y: "108%", opacity: 0 });
      gsap.set(".gsap-h-sub", { opacity: 0, y: 28, filter: "blur(8px)" });
      gsap.set(".gsap-h-ctas", { opacity: 0, y: 20, scale: 0.95 });
      gsap.set(".gsap-h-trust > *", { opacity: 0, y: 12 });
      gsap.set(".gsap-h-dash", {
        opacity: 0,
        x: 55,
        rotateY: -14,
        scale: 0.94,
        transformPerspective: 900,
      });

      gsap
        .timeline({ defaults: { ease: "expo.out" }, delay: 0.05 })
        .to(
          ".gsap-h-line > *",
          { y: "0%", opacity: 1, stagger: 0.11, duration: 0.78, ease: "back.out(1.5)" },
          0,
        )
        .to(".gsap-h-sub", { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.85 }, 0.55)
        .to(
          ".gsap-h-ctas",
          { opacity: 1, y: 0, scale: 1, duration: 0.72, ease: "back.out(1.5)" },
          0.62,
        )
        .to(
          ".gsap-h-trust > *",
          { opacity: 1, y: 0, stagger: 0.09, duration: 0.6, ease: "back.out(1.8)" },
          0.7,
        )
        .to(
          ".gsap-h-dash",
          { opacity: 1, x: 0, rotateY: 0, scale: 1, duration: 1.2, ease: "expo.out" },
          0.3,
        );

      const dashWrap = dashWrapRef.current;
      const dashCard = dashWrap?.querySelector<HTMLElement>(".gsap-dash-card");
      if (dashWrap && dashCard) {
        const onMove = (e: MouseEvent) => {
          const r = dashWrap.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / r.height - 0.5;
          gsap.to(dashCard, {
            rotateY: nx * 20,
            rotateX: -ny * 14,
            duration: 0.5,
            ease: "power2.out",
            transformPerspective: 900,
          });
          gsap.to(".gsap-d-l1", { x: nx * -10, y: ny * -7, duration: 0.5, ease: "power2.out" });
          gsap.to(".gsap-d-l2", { x: nx * -18, y: ny * -12, duration: 0.5, ease: "power2.out" });
          gsap.to(".gsap-d-l3", { x: nx * -26, y: ny * -16, duration: 0.5, ease: "power2.out" });
        };
        const onLeave = () => {
          gsap.to(dashCard, { rotateX: 0, rotateY: 0, duration: 1.0, ease: "elastic.out(1,0.45)" });
          gsap.to([".gsap-d-l1", ".gsap-d-l2", ".gsap-d-l3"], {
            x: 0,
            y: 0,
            duration: 1.0,
            ease: "elastic.out(1,0.45)",
          });
        };
        dashWrap.addEventListener("mousemove", onMove);
        dashWrap.addEventListener("mouseleave", onLeave);
        extraCleanup.push(() => {
          dashWrap.removeEventListener("mousemove", onMove);
          dashWrap.removeEventListener("mouseleave", onLeave);
        });
      }

      const addMagnetic = (selector: string) => {
        const btn = scroller.querySelector<HTMLElement>(selector);
        if (!btn) return;
        const onMove = (e: MouseEvent) => {
          const r = btn.getBoundingClientRect();
          gsap.to(btn, {
            x: (e.clientX - r.left - r.width / 2) * 0.27,
            y: (e.clientY - r.top - r.height / 2) * 0.27,
            duration: 0.35,
            ease: "power2.out",
          });
        };
        const onLeave = () =>
          gsap.to(btn, { x: 0, y: 0, duration: 0.65, ease: "elastic.out(1,0.45)" });
        btn.addEventListener("mousemove", onMove);
        btn.addEventListener("mouseleave", onLeave);
        extraCleanup.push(() => {
          btn.removeEventListener("mousemove", onMove);
          btn.removeEventListener("mouseleave", onLeave);
        });
      };
      addMagnetic(".hero-primary");
      addMagnetic(".cta-primary");

      const hiwLine = scroller.querySelector<HTMLElement>(".gsap-hiw-line");
      if (hiwLine) {
        gsap.set(hiwLine, { scaleX: 0, transformOrigin: "left center" });
        ScrollTrigger.create({
          trigger: hiwLine,
          start: "top 82%",
          scroller,
          onEnter: () => gsap.to(hiwLine, { scaleX: 1, duration: 1.1, ease: "power3.inOut" }),
          once: true,
        });
      }

      gsap.utils.toArray<HTMLElement>(".lp-step-circle").forEach((el, i) => {
        gsap.set(el, { scale: 0, rotation: -15 });
        ScrollTrigger.create({
          trigger: el,
          start: "top 88%",
          scroller,
          onEnter: () =>
            gsap.to(el, {
              scale: 1,
              rotation: 0,
              duration: 0.7,
              delay: i * 0.11,
              ease: "back.out(2.3)",
            }),
          once: true,
        });
      });

      const secPink = scroller.querySelector<HTMLElement>(".sec-card-pink");
      const secBlue = scroller.querySelector<HTMLElement>(".sec-card-blue");
      if (secPink) {
        gsap.set(secPink, { x: -60, rotateY: 15, transformPerspective: 900 });
        ScrollTrigger.create({
          trigger: secPink,
          start: "top 82%",
          scroller,
          onEnter: () => gsap.to(secPink, { x: 0, rotateY: 0, duration: 1.0, ease: "expo.out" }),
          once: true,
        });
      }
      if (secBlue) {
        gsap.set(secBlue, { x: 60, rotateY: -15, transformPerspective: 900 });
        ScrollTrigger.create({
          trigger: secBlue,
          start: "top 82%",
          scroller,
          onEnter: () =>
            gsap.to(secBlue, { x: 0, rotateY: 0, duration: 1.0, delay: 0.12, ease: "expo.out" }),
          once: true,
        });
      }

      gsap.utils.toArray<HTMLElement>(".price-card").forEach((el, i) => {
        gsap.set(el, { y: 40, scale: 0.94 });
        ScrollTrigger.create({
          trigger: el,
          start: "top 86%",
          scroller,
          onEnter: () =>
            gsap.to(el, { y: 0, scale: 1, duration: 0.85, delay: i * 0.12, ease: "back.out(1.4)" }),
          once: true,
        });
      });
    });

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach((t) => t.kill());
      extraCleanup.forEach((fn) => fn());
    };
  }, [dashWrapRef, lpScrollRef]);
}

const POS_DEMO = [
  { e: "☕", name: "Espresso", price: 80 },
  { e: "🍵", name: "Matcha Latte", price: 120 },
  { e: "☕", name: "Espresso", price: 80 },
  { e: "🥐", name: "Croissant", price: 65 },
  { e: "🥤", name: "Frappe", price: 150 },
];

export default function Login() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, isPlaceholderData } = useAuth();
  const [, setLocation] = useLocation();
  const { canInstall, install } = usePwaInstall();
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>(() => getDebugLogs());
  const refreshDebug = () => setDebugEntries(getDebugLogs());
  const [googleClientId, setGoogleClientId] = useState<string | null>(
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || null,
  );

  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Load saved email on mount so the form is pre-filled when the user
  // returns after signing out with "Remember this device" checked.
  // Only the email is persisted — the password is intentionally NOT stored
  // in localStorage (plaintext storage is trivially readable by XSS/extensions).
  // The browser's own encrypted password manager handles password autofill
  // via the autocomplete="current-password" attribute on the password input.
  const REMEMBER_ME_KEY = "artixpos_remember_me_email";
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBER_ME_KEY);
      if (!savedEmail) return;
      setFormEmail(savedEmail);
      setRememberMe(true);
    } catch {}
  }, []);

  const LAST_LOGIN_METHOD_KEY = "artixpos_last_login_method";
  const [lastLoginMethod, setLastLoginMethod] = useState<"google" | "email" | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem(LAST_LOGIN_METHOD_KEY) as "google" | "email" | null;
    if (saved === "google" || saved === "email") setLastLoginMethod(saved);
  }, []);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const featTrackRef = useRef<HTMLDivElement>(null);
  const featHoveredRef = useRef(false);
  const featDraggingRef = useRef(false);
  const featPosRef = useRef(0);
  const featVelRef = useRef(0.55);
  const featLastXRef = useRef(0);

  useEffect(() => {
    const el = featTrackRef.current;
    if (!el) return;
    const BASE = 0.55;
    const FRICTION = 0.88;
    const EASE = 0.055;
    let raf: number;

    const tick = () => {
      if (!featDraggingRef.current) {
        const target = featHoveredRef.current ? 0 : BASE;
        const diff = target - featVelRef.current;
        if (Math.abs(featVelRef.current) > Math.abs(target) + 0.1) {
          featVelRef.current *= FRICTION;
          if (target > 0 && featVelRef.current < 0) featVelRef.current = 0;
        } else {
          featVelRef.current += diff * EASE;
        }
        const halfW = el.scrollWidth / 2;
        if (halfW > 0) {
          featPosRef.current =
            (((featPosRef.current + featVelRef.current) % halfW) + halfW) % halfW;
          el.style.transform = `translateX(${-featPosRef.current}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const statsRef = useRef<HTMLDivElement>(null);
  const [, setStatsVisible] = useState(false);
  const lpScrollRef = useRef<HTMLDivElement>(null);
  const mockSectionRef = useRef<HTMLDivElement>(null);
  const [mockVisible, setMockVisible] = useState(false);
  const [activeMockTab, setActiveMockTab] = useState("Dashboard");
  const [posCart, setPosCart] = useState<
    Array<{ e: string; name: string; price: number; qty: number }>
  >([]);
  const [posHighlight, setPosHighlight] = useState(-1);
  const [posCharging, setPosCharging] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
    };
    const unlock = () => {
      html.style.setProperty("overflow", "auto", "important");
      html.style.setProperty("height", "auto", "important");
      body.style.setProperty("overflow", "auto", "important");
      body.style.setProperty("height", "auto", "important");
    };
    unlock();
    const raf = requestAnimationFrame(unlock);
    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
    };
  }, []);

  useEffect(() => {
    const body = document.body;
    if (showLoginPanel) {
      body.style.setProperty("overflow", "hidden", "important");
    } else {
      body.style.setProperty("overflow", "auto", "important");
    }
  }, [showLoginPanel]);

  const dashWrapRef = useRef<HTMLDivElement>(null);

  useScrollReveal();
  useCardTilt();
  useLandingAnimations(lpScrollRef, dashWrapRef);

  useEffect(() => {
    if (!statsRef.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setStatsVisible(true);
      },
      { threshold: 0.4 },
    );
    io.observe(statsRef.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mockSectionRef.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setMockVisible(true);
      },
      { threshold: 0.1 },
    );
    io.observe(mockSectionRef.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (activeMockTab !== "POS") {
      setPosCart([]);
      setPosCharging(false);
      setPosHighlight(-1);
      return;
    }
    let step = 0;
    setPosCart([]);
    setPosCharging(false);
    const run = () => {
      if (step < POS_DEMO.length) {
        const p = POS_DEMO[step];
        setPosHighlight((step % 3) + (step >= 3 ? 0 : 0));
        const prodIdx = [0, 1, 0, 3, 2][step] ?? step;
        setPosHighlight(prodIdx);
        setPosCart((prev) => {
          const idx = prev.findIndex((i) => i.name === p.name);
          if (idx >= 0) return prev.map((i, ei) => (ei === idx ? { ...i, qty: i.qty + 1 } : i));
          return [...prev, { ...p, qty: 1 }];
        });
        setTimeout(() => setPosHighlight(-1), 380);
        step++;
      } else {
        setPosCharging(true);
        setTimeout(() => {
          setPosCart([]);
          setPosCharging(false);
          step = 0;
        }, 2200);
      }
    };
    const t = setInterval(run, 1700);
    return () => clearInterval(t);
  }, [activeMockTab]);

  const oauthPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (oauthPollTimerRef.current !== null) clearInterval(oauthPollTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (!inviteToken) return;
    localStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
    if (isAuthenticated) {
      (async () => {
        try {
          const { performLogout } = await import("@/lib/queryClient");
          await performLogout();
        } catch {}
        const { clearNativeToken } = await import("@/lib/queryClient");
        clearNativeToken();
        queryClient.setQueryData(["auth-me"], null);
        queryClient.clear();
        window.history.replaceState({}, "", "/login");
      })();
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (isLoading || isPlaceholderData) return;

    // If the URL has ?logout=1, stay on the login page no matter what.
    // The query param survives refreshes (unlike sessionStorage) until the
    // user manually navigates away or signs in again.
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") return;

    if (isAuthenticated) {
      // Already authenticated — redirect to dashboard
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, isPlaceholderData, setLocation]);

  // Theme — sync with the shared theme utility so the login page's inline
  // styles (background, borders, etc.) match the current mode.
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light") return false;
    if (stored === "dark") return true;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const stored = localStorage.getItem("theme");
      if (stored === "light") setIsDark(false);
      else if (stored === "dark") setIsDark(true);
      else setIsDark(mq.matches);
    };
    // Re-sync when the theme changes (from settings or system)
    window.addEventListener("storage", handler);
    mq.addEventListener("change", handler);
    return () => {
      window.removeEventListener("storage", handler);
      mq.removeEventListener("change", handler);
    };
  }, []);
  useEffect(() => {
    const handler = () => setDebugEntries(getDebugLogs());
    window.addEventListener("artixpos-debug-update", handler);
    return () => window.removeEventListener("artixpos-debug-update", handler);
  }, []);
  useEffect(() => {
    if (googleClientId) return;
    nativeFetch("/api/auth/config")
      .then((r) => r.json())
      .then((cfg: { googleClientId?: string | null }) => {
        if (cfg.googleClientId) setGoogleClientId(cfg.googleClientId);
      })
      .catch(() => {});
  }, [googleClientId]);

  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");
  const detail = urlParams.get("detail");
  const reason = urlParams.get("reason");
  const hasPendingInvite = !!localStorage.getItem(INVITE_STORAGE_KEY) || !!urlParams.get("invite");

  function decodeTokenUser(token: string) {
    try {
      const part = token.split(".")[1];
      if (!part) return null;
      const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      if (!payload?.id) return null;
      if (payload.exp && payload.exp * 1000 < Date.now()) return null;
      return {
        id: payload.id,
        name: payload.name ?? null,
        email: payload.email ?? null,
        avatar: payload.avatar ?? null,
        provider: payload.provider ?? "google",
        tenantId: payload.tenantId ?? null,
        role: payload.role ?? "owner",
        activeBranchId: payload.activeBranchId ?? null,
        activeBranch: null,
      };
    } catch {
      return null;
    }
  }

  async function handleNativeGoogleSignIn() {
    setNativeError(null);
    setSigningIn(true);
    sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
    try {
      const token = await nativeGoogleSignIn();
      await queryClient.cancelQueries();
      setNativeToken(token);
      localStorage.setItem(LAST_LOGIN_METHOD_KEY, "google");
      const userFromToken = decodeTokenUser(token);
      if (userFromToken) queryClient.setQueryData(["auth-me"], userFromToken);
      else await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth-me" });
    } catch (err: unknown) {
      const msg: string = (err as Error)?.message ?? String(err);
      const isUserCancel =
        msg.toLowerCase().includes("cancel") ||
        msg.toLowerCase().includes("dismissed") ||
        msg.toLowerCase().includes("12501");
      sessionStorage.removeItem(OAUTH_FLOW_KEY);
      if (!isUserCancel)
        setNativeError(msg.length < 120 ? msg : "Sign-in failed — tap 'Show debug' for details.");
    } finally {
      setSigningIn(false);
    }
  }

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "google-auth-ok") {
        localStorage.setItem(LAST_LOGIN_METHOD_KEY, "google");
        queryClient.invalidateQueries({ queryKey: ["auth-me"] });
        setSigningIn(false);
      } else if (data.type === "google-auth-error") {
        setSigningIn(false);
        sessionStorage.removeItem(OAUTH_FLOW_KEY);
        setNativeError(
          data.error === "google_not_configured"
            ? "Google sign-in is not configured."
            : data.error
              ? `Sign-in failed: ${data.error}`
              : "Google sign-in failed. Please try again.",
        );
      }
    }
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

  function handleGoogleClick() {
    if (isNativePlatform()) {
      handleNativeGoogleSignIn();
      return;
    }
    sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
    window.location.href = `${API_BASE}/auth/google`;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string | boolean> = { email: formEmail, password: formPassword };
      if (mode === "register") body.name = formName;
      if (mode === "signin") body.rememberMe = rememberMe;
      const res = await nativeFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message ?? "Something went wrong.");
        return;
      }
      const authUser = data.user ?? null;
      if (authUser) {
        // Save or clear the remembered email based on "Remember this device".
        // Password is never stored — the browser's password manager handles that.
        if (mode === "signin") {
          if (rememberMe) {
            localStorage.setItem(REMEMBER_ME_KEY, formEmail);
          } else {
            localStorage.removeItem(REMEMBER_ME_KEY);
          }
          localStorage.setItem(LAST_LOGIN_METHOD_KEY, "email");
        }

        // Store token first so all subsequent requests in this session are authenticated
        if (data.token) setNativeToken(data.token);

        // Before redirecting, fetch the full user (includes activeBranch color) and
        // warm the critical data cache in parallel. When the page reloads the
        // localStorage placeholder will have activeBranch populated and IndexedDB
        // will have the critical data — so the app renders with real data instantly
        // instead of showing stale/empty state until the first network round-trip.
        try {
          await Promise.allSettled([
            nativeFetch("/api/auth/me")
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                const fullUser = d?.user ?? null;
                localStorage.setItem("artixpos_auth_me_v1", JSON.stringify(fullUser ?? authUser));
              }),
            prefetchCriticalData(),
          ]);
        } catch {
          localStorage.setItem("artixpos_auth_me_v1", JSON.stringify(authUser));
        }

        // Hard navigate — the cleanest way to reset all React/query state
        const alreadyOnboarded = localStorage.getItem(`artix-onboarded-${authUser.id}`) === "1";
        const needsOnboarding = !alreadyOnboarded && !authUser.tenantId;
        window.location.replace(needsOnboarding ? "/onboarding" : "/");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setFormLoading(false);
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setFormError(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);
    try {
      const res = await nativeFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503 || data.code === "DB_UNAVAILABLE") {
          setForgotError("The server is temporarily busy. Please wait a moment and try again.");
        } else {
          setForgotError(data.message ?? "Something went wrong.");
        }
        return;
      }
      setForgotSuccess(true);
    } catch {
      setForgotError("Network error. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  function openForgot() {
    setShowForgot(true);
    setForgotEmail(formEmail);
    setForgotSuccess(false);
    setForgotError(null);
  }
  function closeForgot() {
    setShowForgot(false);
    setForgotSuccess(false);
    setForgotError(null);
    setForgotEmail("");
  }
  function openPanel(m: AuthMode = "signin") {
    setMode(m);
    setFormError(null);
    setShowLoginPanel(true);
  }

  if (isLoading || signingIn) return null;

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    background: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
    border: `1.5px solid ${isDark ? "rgba(59,130,246,0.15)" : "rgba(0,0,0,0.10)"}`,
    color: isDark ? "rgba(255,255,255,0.92)" : "#1a1a1a",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  const loginForm = (
    <div style={{ width: "100%", maxWidth: 400 }}>
      <style>{`
        @keyframes rise        { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes slide-in-right { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes glow-pulse  { 0%,100%{box-shadow:0 6px 24px rgba(59,130,246,0.38)} 50%{box-shadow:0 6px 38px rgba(59,130,246,0.62)} }
        @keyframes float-slow  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes pulse-dot   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(0.75)} }
        @keyframes orb-a       { 0%,100%{transform:translate(0,0)} 40%{transform:translate(30px,-22px)} 70%{transform:translate(-18px,14px)} }
        @keyframes orb-b       { 0%,100%{transform:translate(0,0)} 40%{transform:translate(-24px,18px)} 70%{transform:translate(18px,-10px)} }
        @keyframes lp-marquee  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes lp-aurora   { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.55} 50%{transform:translate(-50%,-50%) scale(1.15);opacity:0.85} }
        @keyframes mock-fade   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .lp-marquee-track      { animation:lp-marquee 36s linear infinite;will-change:transform }
        .mock-tab-content      { animation:mock-fade 0.25s cubic-bezier(0.16,1,0.3,1) both }
        .lp-aurora-orb         { animation:lp-aurora 9s ease-in-out infinite alternate }
        .lp-bg-grid {
          background-size:64px 64px;
          background-image:
            linear-gradient(to right,rgba(59,130,246,0.04) 1px,transparent 1px),
            linear-gradient(to bottom,rgba(59,130,246,0.04) 1px,transparent 1px);
          mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 20%,rgba(0,0,0,0.6) 80%,transparent 100%);
          -webkit-mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 20%,rgba(0,0,0,0.6) 80%,transparent 100%);
        }
        .lp-section-lazy { content-visibility:auto; contain-intrinsic-size:0 700px; }

        .rise { animation:rise 0.45s cubic-bezier(0.16,1,0.3,1) both }
        .d1{ animation-delay:0.03s } .d2{ animation-delay:0.10s } .d3{ animation-delay:0.17s } .d4{ animation-delay:0.24s }

        .sr {
          opacity:0;
          transform:translateY(24px);
          transition:opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1);
          will-change:opacity,transform;
        }
        .sr.sr-left  { transform:translateX(-24px); }
        .sr.sr-right { transform:translateX(24px); }
        .sr.sr-scale { transform:scale(0.94); }
        .sr.sr-visible { opacity:1 !important; transform:none !important; will-change:auto; }
        .sr-d1 { transition-delay:0.05s } .sr-d2 { transition-delay:0.11s } .sr-d3 { transition-delay:0.17s }
        .sr-d4 { transition-delay:0.23s } .sr-d5 { transition-delay:0.29s } .sr-d6 { transition-delay:0.35s }

        @media (prefers-reduced-motion: reduce) {
          .sr,.sr.sr-left,.sr.sr-right,.sr.sr-scale { opacity:1!important;transform:none!important;transition:none!important; }
          .float-mockup,.lp-orb,.lp-orb-b,.lp-marquee-track,.lp-aurora-orb,.hero-primary,.mock-tab-content { animation:none!important; }
          .lp-section-lazy { content-visibility:visible; }
        }

        /* ── Form elements ── */
        .btn-blue {
          width:100%;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;
          cursor:pointer;border:none;font-family:inherit;
          background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);
          color:#fff;box-shadow:0 4px 18px rgba(59,130,246,0.30);
          transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s;
        }
        .btn-blue:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 26px rgba(59,130,246,0.46); }
        .btn-blue:active:not(:disabled){ transform:scale(0.98) }
        .btn-blue:disabled { opacity:0.55;cursor:not-allowed }
        .btn-social {
          display:flex;align-items:center;gap:12px;width:100%;padding:12px 18px;border-radius:12px;
          font-size:14px;font-weight:600;cursor:pointer;border:none;background:none;font-family:inherit;
          transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
          -webkit-tap-highlight-color:transparent;
        }
        .btn-social:hover  { transform:translateY(-1px) }
        .btn-social:active { transform:scale(0.97) }
        .btn-social:disabled { opacity:0.6;cursor:not-allowed;transform:none }
        .finput:focus { border-color:rgba(59,130,246,0.55)!important; box-shadow:0 0 0 3px rgba(59,130,246,0.13)!important; }

        /* ── Nav link ── */
        .nav-link {
          color:rgba(255,255,255,0.52);font-size:13.5px;font-weight:500;
          text-decoration:none;cursor:pointer;
          background:none;border:none;font-family:inherit;padding:0;position:relative;
          transition:color 0.2s ease;
        }
        .nav-link::after {
          content:'';position:absolute;bottom:-3px;left:0;right:0;height:1.5px;
          background:linear-gradient(90deg,#3b82f6,#60a5fa);
          transform:scaleX(0);transform-origin:left;
          transition:transform 0.28s cubic-bezier(0.16,1,0.3,1);
        }
        .nav-link:hover { color:#fff; }
        .nav-link:hover::after { transform:scaleX(1); }

        /* ── Header buttons ── */
        .hdr-login {
          padding:8px 18px;border-radius:10px;font-size:13.5px;font-weight:600;
          background:transparent;border:1px solid rgba(59,130,246,0.28);color:#60a5fa;
          cursor:pointer;font-family:inherit;
          transition:background 0.2s,border-color 0.2s,transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .hdr-login:hover { background:rgba(59,130,246,0.10);border-color:rgba(96,165,250,0.52);transform:translateY(-1px); }
        .hdr-cta {
          padding:8px 20px;border-radius:10px;font-size:13.5px;font-weight:700;
          background:linear-gradient(135deg,#3b82f6,#2563eb);border:none;color:#fff;
          cursor:pointer;font-family:inherit;
          box-shadow:0 3px 14px rgba(59,130,246,0.30);
          transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s;
        }
        .hdr-cta:hover { transform:translateY(-1px) scale(1.03); box-shadow:0 6px 22px rgba(59,130,246,0.46); }

        /* ── Hero CTA ── */
        .hero-primary {
          padding:15px 34px;border-radius:14px;font-size:16px;font-weight:800;
          background:linear-gradient(135deg,#3b82f6,#2563eb);border:none;color:#fff;
          cursor:pointer;font-family:inherit;
          box-shadow:0 6px 24px rgba(59,130,246,0.38);
          transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.25s;
          animation:glow-pulse 3.5s ease-in-out infinite;
        }
        .hero-primary:hover { transform:translateY(-3px) scale(1.03); box-shadow:0 14px 42px rgba(59,130,246,0.58); animation:none; }
        .hero-primary:active { transform:scale(0.97); animation:none; }

        /* ── Section CTA ── */
        .cta-primary {
          padding:15px 38px;border-radius:14px;font-size:16px;font-weight:800;
          background:linear-gradient(135deg,#3b82f6,#2563eb);border:none;color:#fff;
          cursor:pointer;font-family:inherit;
          box-shadow:0 6px 24px rgba(59,130,246,0.38);
          transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.25s;
        }
        .cta-primary:hover { transform:translateY(-3px) scale(1.025); box-shadow:0 14px 42px rgba(59,130,246,0.54); }
        .cta-primary:active { transform:scale(0.97); }

        /* ── Feature cards ── */
        .fcard {
          transition:border-color 0.28s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease;
          cursor:default;
        }
        .fcard:hover { border-color:rgba(59,130,246,0.42)!important; transform:translateY(-6px) scale(1.015)!important; box-shadow:0 20px 52px rgba(0,0,0,0.45), 0 0 0 1px rgba(59,130,246,0.16)!important; }

        /* ── Device mini-cards ── */
        .dcard {
          transition:border-color 0.26s ease, transform 0.32s cubic-bezier(0.34,1.56,0.64,1);
          cursor:default;
        }
        .dcard:hover { border-color:rgba(59,130,246,0.42)!important; transform:translateY(-4px) scale(1.04)!important; }

        /* ── How it works steps ── */
        .lp-step { transition:transform 0.32s cubic-bezier(0.34,1.56,0.64,1); cursor:default; }
        .lp-step:hover { transform:translateY(-8px); }
        .lp-step-circle { transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease; }
        .lp-step:hover .lp-step-circle { transform:scale(1.15) rotate(6deg); }
        .lp-step-title { transition:color 0.2s ease; color:rgba(255,255,255,0.85); }
        .lp-step:hover .lp-step-title { color:#fff!important; }

        /* ── Security cards ── */
        .sec-card-pink { border-radius:22px;overflow:hidden; border:1px solid rgba(244,114,182,0.22);background:rgba(244,114,182,0.03); transition:border-color 0.28s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1); cursor:default; }
        .sec-card-pink:hover { border-color:rgba(244,114,182,0.55)!important; transform:translateY(-6px)!important; }
        .sec-card-blue { border-radius:22px;overflow:hidden; border:1px solid rgba(59,130,246,0.22);background:rgba(59,130,246,0.03); transition:border-color 0.28s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1); cursor:default; }
        .sec-card-blue:hover { border-color:rgba(59,130,246,0.55)!important; transform:translateY(-6px)!important; }

        /* ── Pricing cards ── */
        .price-card {
          transition:border-color 0.28s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease;
          cursor:default;
        }
        .price-card:hover { transform:translateY(-6px) scale(1.012); box-shadow:0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.22); border-color:rgba(59,130,246,0.42)!important; }

        /* ── Ambient orbs — very gentle, GPU-only ── */
        .lp-orb   { animation:orb-a 28s ease-in-out infinite; }
        .lp-orb-b { animation:orb-b 36s ease-in-out infinite; }

        /* ── Misc ── */
        .float-mockup { animation:float-slow 9s ease-in-out infinite; }
        .pdot { animation:pulse-dot 2.2s ease-in-out infinite; }
        .stat-num { background:linear-gradient(90deg,#60a5fa,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text; }
        .scroll-section { scroll-margin-top:72px; }
        .lp-section-lazy { content-visibility:auto; contain-intrinsic-size:0 600px; }
      `}</style>

      <div className="rise d1" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
              boxShadow: `0 4px 14px rgba(59,130,246,0.35)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>A</span>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: isDark ? "rgba(96,165,250,0.8)" : "rgba(2,132,199,0.8)",
            }}
          >
            ArtixPOS
          </span>
        </div>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.025em",
            color: isDark ? "#fff" : "#0c1a26",
            margin: "0 0 6px",
          }}
        >
          {mode === "register" ? t("login.createAccount") : t("login.welcomeBack")}
        </h2>
        <p
          style={{
            fontSize: 13.5,
            color: isDark ? "rgba(255,255,255,0.48)" : "rgba(12,26,38,0.52)",
            margin: 0,
          }}
        >
          {mode === "register" ? t("login.createSubtitle") : t("login.signInSubtitle")}
        </p>
      </div>

      <div
        className="rise d1"
        style={{
          display: "flex",
          gap: 3,
          padding: 3,
          borderRadius: 11,
          marginBottom: 20,
          background: isDark ? "rgba(59,130,246,0.07)" : "rgba(0,0,0,0.05)",
        }}
      >
        {(["signin", "register"] as AuthMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            data-testid={`tab-${m}`}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.2s,color 0.2s,box-shadow 0.2s",
              background: mode === m ? (isDark ? "rgba(59,130,246,0.2)" : "#fff") : "transparent",
              color:
                mode === m
                  ? isDark
                    ? NEON
                    : BLUE2
                  : isDark
                    ? "rgba(255,255,255,0.42)"
                    : "rgba(0,0,0,0.42)",
              boxShadow:
                mode === m
                  ? isDark
                    ? "0 1px 4px rgba(0,0,0,0.4)"
                    : "0 1px 4px rgba(0,0,0,0.08)"
                  : "none",
            }}
          >
            {m === "signin" ? t("login.signIn") : t("login.createAccount")}
          </button>
        ))}
      </div>

      {reason === "banned" && (
        <div
          className="rise d1"
          style={{
            padding: "11px 14px",
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 14,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <div style={{ fontWeight: 700, color: "#f87171", marginBottom: 3 }}>
            Account Suspended
          </div>
          <div style={{ color: "rgba(248,113,113,0.85)", lineHeight: 1.55 }}>
            Your account has been suspended for violating our Terms of Service.
          </div>
        </div>
      )}
      {hasPendingInvite && !error && !reason && (
        <div
          className="rise d1"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            textAlign: "center",
            marginBottom: 14,
            background: "rgba(59,130,246,0.10)",
            border: `1px solid rgba(96,165,250,0.25)`,
            color: NEON,
          }}
        >
          You've been invited to join a team. Sign in to accept.
        </div>
      )}
      {error && (
        <div
          className="rise d1"
          style={{
            padding: "11px 14px",
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 14,
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#f87171",
            wordBreak: "break-word",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 3 }}>
            {error === "state_mismatch"
              ? "Sign-in expired — please try again."
              : error === "google_not_configured"
                ? "Google sign-in is not configured."
                : "Sign-in failed"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {error === "state_mismatch"
              ? "Click 'Continue with Google' again."
              : (detail ?? `Error code: ${error}`)}
          </div>
        </div>
      )}
      {nativeError && (
        <div
          className="rise d1"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            textAlign: "center",
            marginBottom: 14,
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171",
          }}
        >
          {nativeError}
        </div>
      )}

      <div className="rise d2">
        <button
          type="button"
          className="btn-social"
          data-testid="button-google-signin"
          onClick={handleGoogleClick}
          disabled={signingIn}
          style={
            isDark
              ? {
                  background: "rgba(255,255,255,0.06)",
                  border: "1.5px solid rgba(59,130,246,0.15)",
                  color: "rgba(255,255,255,0.88)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                }
              : {
                  background: "#fff",
                  border: "1.5px solid rgba(0,0,0,0.09)",
                  color: "#1a1a1a",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }
          }
        >
          {signingIn ? (
            <div
              style={{
                width: 20,
                height: 20,
                border: "2px solid currentColor",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
                flexShrink: 0,
              }}
            />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          <span style={{ flex: 1, textAlign: "center" }}>
            {signingIn ? t("login.signingInGoogle") : t("login.continueWithGoogle")}
          </span>
          {mode === "signin" && lastLoginMethod === "google" && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 20,
                background: "rgba(34,197,94,0.15)",
                color: "#4ade80",
                border: "1px solid rgba(34,197,94,0.25)",
                whiteSpace: "nowrap",
                letterSpacing: 0.2,
              }}
            >
              Last used
            </span>
          )}
        </button>
      </div>

      <div
        className="rise d2"
        style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}
      >
        <div
          style={{
            flex: 1,
            height: 1,
            background: isDark ? "rgba(59,130,246,0.10)" : "rgba(0,0,0,0.08)",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.30)",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {mode === "register" ? t("login.orCreateEmail") : t("login.orSignInEmail")}
          {mode === "signin" && lastLoginMethod === "email" && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 20,
                background: "rgba(34,197,94,0.15)",
                color: "#4ade80",
                border: "1px solid rgba(34,197,94,0.25)",
                letterSpacing: 0.2,
              }}
            >
              Last used
            </span>
          )}
        </span>
        <div
          style={{
            flex: 1,
            height: 1,
            background: isDark ? "rgba(59,130,246,0.10)" : "rgba(0,0,0,0.08)",
          }}
        />
      </div>

      <form
        onSubmit={handleEmailSubmit}
        className="rise d3"
        style={{ display: "flex", flexDirection: "column", gap: 11 }}
      >
        {mode === "register" && (
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.46)",
                display: "block",
                marginBottom: 5,
              }}
            >
              {t("login.fullName")}
            </label>
            <input
              type="text"
              placeholder="Jane Smith"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              data-testid="input-name"
              className="finput"
              style={inputBase}
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.46)",
              display: "block",
              marginBottom: 5,
            }}
          >
            {t("login.emailAddress")}
          </label>
          <input
            type="email"
            placeholder="Email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            required
            data-testid="input-email"
            className="finput"
            style={inputBase}
            autoComplete="email"
          />
        </div>
        <div>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.46)",
              display: "block",
              marginBottom: 5,
            }}
          >
            Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={mode === "register" ? "Create a password" : "Password"}
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : undefined}
              data-testid="input-password"
              className="finput"
              style={{ ...inputBase, paddingRight: 44 }}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              data-testid="button-toggle-password"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)",
                display: "flex",
                alignItems: "center",
                transition: "color 0.15s",
              }}
            >
              {showPassword ? (
                <svg
                  width="17"
                  height="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="17"
                  height="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {mode === "register" &&
            formPassword.length > 0 &&
            (() => {
              const s = getPasswordStrength(formPassword);
              return (
                <div style={{ marginTop: 7 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 99,
                          transition: "background 0.3s",
                          background:
                            i <= s.score
                              ? s.color
                              : isDark
                                ? "rgba(255,255,255,0.10)"
                                : "rgba(0,0,0,0.10)",
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
                  {s.score < 2 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)",
                        marginLeft: 6,
                      }}
                    >
                      — add uppercase, numbers, or symbols
                    </span>
                  )}
                </div>
              );
            })()}
        </div>
        {mode === "signin" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: -3,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <div
                onClick={() => setRememberMe((v) => !v)}
                data-testid="checkbox-remember-me"
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: 4,
                  flexShrink: 0,
                  cursor: "pointer",
                  border: `1.5px solid ${rememberMe ? BLUE : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
                  background: rememberMe ? BLUE : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s,border-color 0.2s",
                }}
              >
                {rememberMe && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M1.5 5l2.5 2.5 4.5-4.5"
                      stroke="#fff"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.46)",
                }}
              >
                {t("login.rememberDevice")}
              </span>
            </label>
            <button
              type="button"
              onClick={openForgot}
              data-testid="button-forgot-password"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "inherit",
                color: isDark ? "rgba(96,165,250,0.8)" : BLUE2,
                padding: 0,
                transition: "color 0.15s",
              }}
            >
              {t("login.forgotPassword")}
            </button>
          </div>
        )}
        {formError && (
          <div
            style={{
              padding: "10px 13px",
              borderRadius: 10,
              fontSize: 12.5,
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171",
            }}
            data-testid="text-form-error"
          >
            {formError}
          </div>
        )}
        <button
          type="submit"
          disabled={formLoading}
          data-testid="button-submit"
          className="btn-blue"
          style={{ marginTop: 3 }}
        >
          {formLoading
            ? mode === "register"
              ? t("login.creatingAccount")
              : t("login.signingIn")
            : mode === "register"
              ? t("login.createAccount")
              : t("login.signIn")}
        </button>
      </form>

      <p
        className="rise d4"
        style={{
          marginTop: 18,
          fontSize: 11.5,
          textAlign: "center",
          color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.35)",
          lineHeight: 1.5,
        }}
      >
        {t("login.noCC")}
      </p>

      <p
        className="rise d4"
        style={{
          marginTop: 10,
          fontSize: 11,
          textAlign: "center",
          lineHeight: 1.6,
          color: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.28)",
        }}
      >
        {mode === "register" && "By creating an account, you agree to our "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: isDark ? "rgba(96,165,250,0.65)" : BLUE2,
            textDecoration: "none",
            borderBottom: `1px solid currentColor`,
            opacity: 0.9,
          }}
        >
          Terms
        </a>
        <span style={{ opacity: 0.5 }}>{mode === "register" ? " and " : " · "}</span>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: isDark ? "rgba(96,165,250,0.65)" : BLUE2,
            textDecoration: "none",
            borderBottom: `1px solid currentColor`,
            opacity: 0.9,
          }}
        >
          Privacy Policy
        </a>
        {mode === "register" && "."}
      </p>

      {isNativePlatform() && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <button
            onClick={() => {
              refreshDebug();
              setShowDebug((v) => !v);
            }}
            style={{
              fontSize: 11,
              padding: "4px 12px",
              borderRadius: 7,
              border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
              background: "transparent",
              color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)",
              cursor: "pointer",
            }}
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>
      )}
    </div>
  );

  const bars = [40, 65, 50, 80, 55, 92, 68, 78, 50, 100, 72, 88];
  const dashMockup = (
    <div
      className="gsap-dash-card"
      style={{
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(59,130,246,0.20)",
        background: "rgba(17,17,17,0.96)",
        boxShadow: "0 32px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(59,130,246,0.06)",
        backdropFilter: "blur(20px)",
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          background: "rgba(59,130,246,0.06)",
          borderBottom: "1px solid rgba(59,130,246,0.10)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(239,68,68,0.55)" }}
        />
        <div
          style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(251,191,36,0.55)" }}
        />
        <div
          style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(34,197,94,0.45)" }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontWeight: 500 }}>
          Dashboard · ArtixPOS
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <div
          className="gsap-d-l1"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            { l: "Today's Sales", v: "24,850", d: "+12%", c: NEON },
            { l: "Orders", v: "137", d: "+8%", c: "#34d399" },
            { l: "Active Staff", v: "9 / 12", d: "3 available", c: "#a78bfa" },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: "10px 11px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  fontSize: 8,
                  color: "rgba(255,255,255,0.35)",
                  fontWeight: 600,
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {s.l}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 3 }}>
                {s.v}
              </div>
              <div style={{ fontSize: 9, color: s.c, fontWeight: 700 }}>{s.d}</div>
            </div>
          ))}
        </div>
        <div
          className="gsap-d-l2"
          style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 34, marginBottom: 12 }}
        >
          {bars.map((h, i) => (
            <div
              key={i}
              className="dash-bar"
              style={{
                flex: 1,
                borderRadius: 3,
                height: `${h}%`,
                background: `rgba(59,130,246,${0.15 + (h / 100) * 0.55})`,
              }}
            />
          ))}
        </div>
        <div className="gsap-d-l3" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            { l: "POS", v: "Live", c: NEON },
            { l: "Offline", v: "Ready", c: "#34d399" },
            { l: "AI", v: "Active", c: "#a78bfa" },
            { l: "2 Branches", v: "Synced", c: "#f59e0b" },
          ].map((p, i) => (
            <div
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: p.c,
                  boxShadow: `0 0 6px ${p.c}`,
                }}
              />
              <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                {p.l}
              </span>
              <span style={{ fontSize: 9.5, color: "#fff", fontWeight: 700 }}>{p.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const landingPage = (
    <div
      ref={lpScrollRef}
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch" as const,
        background: DARK,
        color: "#fff",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          className="lp-orb"
          style={{
            position: "absolute",
            width: 1000,
            height: 1000,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 58%)",
            top: -380,
            left: -280,
          }}
        />
        <div
          className="lp-orb-b"
          style={{
            position: "absolute",
            width: 660,
            height: 660,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(96,165,250,0.04) 0%, transparent 60%)",
            bottom: -100,
            right: -140,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: `linear-gradient(90deg,transparent,${BLUE},transparent)`,
          }}
        />
      </div>

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          borderBottom: "1px solid rgba(39,39,42,0.80)",
          backdropFilter: "blur(24px)",
          background: "rgba(9,9,11,0.82)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 32px",
            height: 64,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 48 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                boxShadow: `0 0 20px rgba(59,130,246,0.45)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>A</span>
            </div>
            <span
              style={{ color: "#fff", fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}
            >
              ArtixPOS
            </span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 32, flex: 1 }}>
            {[
              { label: "Features", id: "features" },
              { label: "Devices", id: "devices" },
              { label: "Security", id: "security" },
              { label: "Pricing", id: "pricing" },
            ].map(({ label, id }) => (
              <button
                key={id}
                className="nav-link"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                }}
                onClick={() => {
                  const el = document.getElementById(id);
                  const container = lpScrollRef.current;
                  if (!el || !container) return;
                  const offset =
                    el.getBoundingClientRect().top -
                    container.getBoundingClientRect().top +
                    container.scrollTop -
                    80;
                  container.scrollTo({ top: offset, behavior: "smooth" });
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {canInstall && (
            <button
              onClick={install}
              data-testid="button-header-install"
              style={{
                marginLeft: "auto",
                marginRight: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.35)",
                color: "#a5b4fc",
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                backdropFilter: "blur(8px)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.28)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.15)")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16l-4-4h2.5V4h3v8H16l-4 4z" />
                <path d="M20 18H4v2h16v-2z" />
              </svg>
              Install App
            </button>
          )}
          <button
            onClick={() => openPanel("signin")}
            className="hdr-cta"
            data-testid="button-header-login"
            style={{ marginLeft: canInstall ? 0 : "auto" }}
          >
            Log in
          </button>
        </div>
      </header>

      <section
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "100px 32px 88px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 72,
          alignItems: "center",
        }}
      >
        <div>
          <h1
            className="gsap-h-title"
            style={{
              fontSize: 56,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
              margin: "0 0 22px",
            }}
          >
            <div
              className="gsap-h-line"
              style={{ display: "block", overflow: "hidden", lineHeight: 1.1 }}
            >
              <span style={{ display: "inline-block" }}>Your industry.</span>
            </div>
            <div
              className="gsap-h-line"
              style={{ display: "block", overflow: "hidden", lineHeight: 1.1 }}
            >
              <span style={{ display: "inline-block" }}>Your </span>{" "}
              <span
                style={{
                  display: "inline-block",
                  background: `linear-gradient(90deg,${NEON} 0%,${BLUE} 35%,#38bdf8 70%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                POS.
              </span>
            </div>
            <div
              className="gsap-h-line"
              style={{ display: "block", overflow: "hidden", lineHeight: 1.1 }}
            >
              <span style={{ display: "inline-block" }}>No demo needed.</span>
            </div>
          </h1>
          <p
            className="gsap-h-sub"
            style={{
              fontSize: 16.5,
              lineHeight: 1.75,
              color: "rgba(255,255,255,0.48)",
              marginBottom: 38,
              maxWidth: 440,
            }}
          >
            ArtixPOS adapts to your business type — cafe, salon, pharmacy, hotel, and more. Each
            industry gets its own terminology, dedicated features, and tailored workflows. Set up in
            minutes, free to start. No demo call required.
          </p>
          <div className="gsap-h-ctas" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button onClick={() => openPanel("register")} className="hero-primary">
              Start for free →
            </button>
          </div>
          <div
            className="gsap-h-trust"
            style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 30 }}
          >
            {["No credit card required", "Free to start", "Works offline"].map((txt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 13 13"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <path
                    d="M2 6.5l3 3 6-6"
                    stroke="#34d399"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                  {txt}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div
          ref={dashWrapRef}
          className="gsap-h-dash float-mockup"
          style={{ position: "relative", perspective: 900 }}
        >
          <div
            style={{
              position: "absolute",
              inset: -60,
              background:
                "radial-gradient(ellipse at center, rgba(59,130,246,0.12) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />
          {dashMockup}
        </div>
      </section>

      <div
        ref={statsRef}
        style={{
          position: "relative",
          zIndex: 1,
          overflow: "hidden",
          padding: "18px 0",
          transform: "rotate(-1.5deg) scaleX(1.06)",
          background: "rgba(255,255,255,0.03)",
          borderTop: "1px solid rgba(59,130,246,0.10)",
          borderBottom: "1px solid rgba(59,130,246,0.10)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          className="lp-marquee-track"
          style={{ display: "flex", whiteSpace: "nowrap", width: "max-content" }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {[
                "Full-stack POS",
                "Works 100% Offline",
                "Real-time Analytics",
                "Multi-branch Ready",
                "10+ Built-in Modules",
                "Any Device",
                "PWA + Native App",
                "Live Inventory",
                "Staff Scheduling",
                "No Monthly Lock-in",
              ].map((item, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 28,
                    padding: "0 28px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase" as const,
                      color: "rgba(255,255,255,0.38)",
                    }}
                  >
                    {item}
                  </span>
                  <span style={{ color: NEON, opacity: 0.5, fontSize: 10 }}>✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          height: 20,
          background: `linear-gradient(to bottom, rgba(255,255,255,0.015), ${DARK})`,
          position: "relative",
          zIndex: 1,
          marginTop: -1,
        }}
      />

      <section style={{ position: "relative", zIndex: 1, background: DARK, overflow: "hidden" }}>
        <ContainerScroll
          scrollContainer={lpScrollRef}
          titleComponent={
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: NEON,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase" as const,
                  marginBottom: 14,
                }}
              >
                See it in action
              </div>
              <h2
                style={{
                  fontSize: "clamp(28px, 5vw, 52px)",
                  fontWeight: 900,
                  lineHeight: 1.08,
                  letterSpacing: "-0.04em",
                  color: "#fff",
                  margin: "0 0 12px",
                }}
              >
                One dashboard.{" "}
                <span
                  style={{
                    background: `linear-gradient(90deg,${NEON} 0%,${BLUE} 50%,#38bdf8 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Every insight.
                </span>
              </h2>
              <p
                style={{
                  fontSize: 15,
                  color: "rgba(255,255,255,0.40)",
                  maxWidth: 440,
                  margin: "0 auto",
                  lineHeight: 1.65,
                }}
              >
                Sales, inventory, staff, and analytics — all in one beautifully unified view.
              </p>
            </div>
          }
        >
          <div
            ref={mockSectionRef}
            style={{
              width: "100%",
              height: "100%",
              background: "#0d0d0f",
              display: "flex",
              flexDirection: "row",
              fontFamily: "inherit",
              overflow: "hidden",
            }}
          >
            {/* Sidebar */}
            <div
              style={{
                width: 48,
                background: "#0a0a0c",
                borderRight: "1px solid rgba(59,130,246,0.08)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: 12,
                gap: 4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>A</span>
              </div>
              {[
                { icon: "▦", label: "Dashboard" },
                { icon: "⊡", label: "POS" },
                { icon: "⊟", label: "Orders" },
                { icon: "◫", label: "Products" },
                { icon: "⊞", label: "Staff" },
                { icon: "◈", label: "Reports" },
              ].map((item, i) => (
                <div
                  key={i}
                  title={item.label}
                  onClick={() => setActiveMockTab(item.label)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      activeMockTab === item.label ? "rgba(59,130,246,0.18)" : "transparent",
                    border:
                      activeMockTab === item.label
                        ? `1px solid rgba(59,130,246,0.30)`
                        : "1px solid transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    color: activeMockTab === item.label ? NEON : "rgba(255,255,255,0.22)",
                    transition: "all 0.18s ease",
                  }}
                >
                  {item.icon}
                </div>
              ))}
              <div style={{ flex: 1 }} />
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#a78bfa,#7c3aed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                  fontSize: 9,
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                JD
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div
                style={{
                  height: 38,
                  borderBottom: "1px solid rgba(59,130,246,0.07)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 16px",
                  gap: 10,
                  flexShrink: 0,
                  background: "rgba(9,9,11,0.6)",
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "rgba(239,68,68,0.55)",
                  }}
                />
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "rgba(251,191,36,0.55)",
                  }}
                />
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "rgba(34,197,94,0.45)",
                  }}
                />
                <span style={{ fontSize: 9, fontWeight: 700, color: NEON, marginLeft: 4 }}>
                  {activeMockTab}
                </span>
                <div style={{ flex: 1 }} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    className="pdot"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#34d399",
                      boxShadow: "0 0 6px #34d399",
                    }}
                  />
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
                    Branch 1 · Main Store
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontWeight: 500 }}>
                  Today · Jun 12, 2026
                </div>
              </div>

              <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                {activeMockTab === "Dashboard" && (
                  <div
                    key="dash"
                    className="mock-tab-content"
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                      height: "100%",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#fff",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          Good morning, Juan 👋
                        </div>
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", marginTop: 1 }}>
                          Here's what's happening at Main Store today.
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        {["Today", "Week", "Month"].map((t, i) => (
                          <div
                            key={i}
                            style={{
                              padding: "3px 9px",
                              borderRadius: 6,
                              fontSize: 8,
                              fontWeight: 600,
                              background:
                                i === 0 ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                              color: i === 0 ? NEON : "rgba(255,255,255,0.28)",
                              border:
                                i === 0
                                  ? "1px solid rgba(59,130,246,0.30)"
                                  : "1px solid rgba(255,255,255,0.06)",
                              cursor: "pointer",
                            }}
                          >
                            {t}
                          </div>
                        ))}
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 7,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          🔔
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7 }}>
                      {[
                        {
                          l: "Revenue",
                          v: "₱24,850",
                          d: "+12.4%",
                          c: NEON,
                          spark: [30, 45, 38, 60, 52, 80, 68, 92, 75, 100],
                        },
                        {
                          l: "Orders",
                          v: "137",
                          d: "+8 today",
                          c: "#34d399",
                          spark: [50, 42, 65, 55, 70, 60, 78, 65, 85, 72],
                        },
                        {
                          l: "Avg Order",
                          v: "₱181",
                          d: "+₱14 vs avg",
                          c: "#a78bfa",
                          spark: [60, 65, 55, 70, 62, 68, 72, 66, 74, 78],
                        },
                        {
                          l: "Staff Active",
                          v: "9/12",
                          d: "3 on break",
                          c: "#f59e0b",
                          spark: [80, 80, 70, 70, 80, 60, 60, 80, 80, 75],
                        },
                      ].map((s, si) => (
                        <div
                          key={si}
                          style={{
                            padding: "9px 11px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 7,
                              color: "rgba(255,255,255,0.28)",
                              fontWeight: 600,
                              textTransform: "uppercase" as const,
                              letterSpacing: "0.08em",
                            }}
                          >
                            {s.l}
                          </div>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              color: "#fff",
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {s.v}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-end",
                              justifyContent: "space-between",
                            }}
                          >
                            <span style={{ fontSize: 7, color: s.c, fontWeight: 700 }}>
                              ↑ {s.d}
                            </span>
                            <svg width="38" height="16" viewBox="0 0 38 16">
                              <polyline
                                fill="none"
                                stroke={s.c}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeDasharray="200"
                                strokeDashoffset={mockVisible ? 0 : 200}
                                style={{
                                  transition: `stroke-dashoffset 0.9s ease-out ${0.2 + si * 0.1}s`,
                                }}
                                points={s.spark
                                  .map(
                                    (v, j) =>
                                      `${(j / (s.spark.length - 1)) * 38},${16 - (v / 100) * 14}`,
                                  )
                                  .join(" ")}
                              />
                            </svg>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.6fr 1fr 0.9fr",
                        gap: 7,
                        flex: 1,
                        minHeight: 0,
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.025)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          padding: "11px 13px",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 8,
                                color: "rgba(255,255,255,0.25)",
                                fontWeight: 600,
                                textTransform: "uppercase" as const,
                                letterSpacing: "0.06em",
                              }}
                            >
                              Revenue Trend
                            </div>
                            <div
                              style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginTop: 1 }}
                            >
                              ₱24,850
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                            <div
                              style={{
                                fontSize: 7,
                                color: "#34d399",
                                fontWeight: 700,
                                background: "rgba(52,211,153,0.10)",
                                border: "1px solid rgba(52,211,153,0.20)",
                                padding: "2px 6px",
                                borderRadius: 20,
                              }}
                            >
                              ↑ 12.4%
                            </div>
                            <div
                              style={{
                                fontSize: 7,
                                color: "rgba(255,255,255,0.22)",
                                padding: "2px 6px",
                                borderRadius: 20,
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              vs yesterday
                            </div>
                          </div>
                        </div>
                        <div style={{ flex: 1, position: "relative" }}>
                          <svg
                            width="100%"
                            height="100%"
                            viewBox="0 0 200 65"
                            preserveAspectRatio="none"
                            style={{ overflow: "visible" }}
                          >
                            <defs>
                              <linearGradient id="ag3" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={BLUE} stopOpacity="0.32" />
                                <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {[0.25, 0.5, 0.75].map((y, gi) => (
                              <line
                                key={gi}
                                x1="0"
                                y1={y * 65}
                                x2="200"
                                y2={y * 65}
                                stroke="rgba(255,255,255,0.04)"
                                strokeWidth="1"
                              />
                            ))}
                            <path
                              d="M0,56 C10,51 20,42 35,35 C50,28 60,44 75,29 C90,14 105,25 120,17 C135,9 150,19 165,7 C175,1 190,5 200,2 L200,65 L0,65 Z"
                              fill="url(#ag3)"
                              style={{
                                opacity: mockVisible ? 1 : 0,
                                transition: "opacity 1s ease-out 0.5s",
                              }}
                            />
                            <path
                              d="M0,56 C10,51 20,42 35,35 C50,28 60,44 75,29 C90,14 105,25 120,17 C135,9 150,19 165,7 C175,1 190,5 200,2"
                              fill="none"
                              stroke={NEON}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeDasharray="500"
                              strokeDashoffset={mockVisible ? 0 : 500}
                              style={{ transition: "stroke-dashoffset 1.4s ease-out 0.3s" }}
                            />
                            <circle
                              cx="200"
                              cy="2"
                              r="3"
                              fill={NEON}
                              style={{
                                opacity: mockVisible ? 1 : 0,
                                transition: "opacity 0.3s ease-out 1.6s",
                              }}
                            />
                            <circle
                              cx="200"
                              cy="2"
                              r="6"
                              fill={NEON}
                              fillOpacity="0.18"
                              style={{
                                opacity: mockVisible ? 1 : 0,
                                transition: "opacity 0.3s ease-out 1.6s",
                              }}
                            />
                          </svg>
                        </div>
                        <div
                          style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}
                        >
                          {["6am", "9am", "12pm", "3pm", "6pm", "9pm", "Now"].map((d, di) => (
                            <span
                              key={di}
                              style={{
                                fontSize: 6,
                                color: "rgba(255,255,255,0.16)",
                                fontWeight: 500,
                              }}
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.025)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          padding: "11px 12px",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 7,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 8,
                              color: "rgba(255,255,255,0.25)",
                              fontWeight: 600,
                              textTransform: "uppercase" as const,
                              letterSpacing: "0.06em",
                            }}
                          >
                            Live Orders
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div
                              className="pdot"
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: "#34d399",
                                boxShadow: "0 0 5px #34d399",
                              }}
                            />
                            <span style={{ fontSize: 7, color: "#34d399", fontWeight: 600 }}>
                              6 active
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            overflow: "hidden",
                            flex: 1,
                          }}
                        >
                          {[
                            {
                              id: "#4292",
                              items: "Espresso ×2, Croissant",
                              amt: "₱225",
                              status: "Ready",
                              sc: "#34d399",
                              av: "MS",
                            },
                            {
                              id: "#4291",
                              items: "Matcha Latte, Frappe",
                              amt: "₱270",
                              status: "Preparing",
                              sc: "#f59e0b",
                              av: "CR",
                            },
                            {
                              id: "#4290",
                              items: "Americano ×3, Water",
                              amt: "₱220",
                              status: "Pending",
                              sc: BLUE,
                              av: "AG",
                            },
                            {
                              id: "#4289",
                              items: "Cake Slice, Hot Choco",
                              amt: "₱185",
                              status: "Paid",
                              sc: NEON,
                              av: "JD",
                            },
                            {
                              id: "#4288",
                              items: "Croissant ×2, OJ",
                              amt: "₱175",
                              status: "Done",
                              sc: "rgba(255,255,255,0.22)",
                              av: "MS",
                            },
                          ].map((o, oi) => (
                            <div
                              key={oi}
                              style={{
                                padding: "5px 7px",
                                borderRadius: 7,
                                background: "rgba(255,255,255,0.025)",
                                border: "1px solid rgba(255,255,255,0.05)",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  background: "rgba(59,130,246,0.18)",
                                  border: "1px solid rgba(59,130,246,0.25)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 6,
                                  fontWeight: 800,
                                  color: NEON,
                                  flexShrink: 0,
                                }}
                              >
                                {o.av}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 7, fontWeight: 700, color: NEON }}>
                                  {o.id}
                                </div>
                                <div
                                  style={{
                                    fontSize: 7,
                                    color: "rgba(255,255,255,0.40)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {o.items}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 8, fontWeight: 800, color: "#fff" }}>
                                  {o.amt}
                                </div>
                                <div
                                  style={{
                                    fontSize: 6,
                                    fontWeight: 700,
                                    color: o.sc,
                                    textAlign: "right" as const,
                                  }}
                                >
                                  {o.status}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <div
                          style={{
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            padding: "10px 12px",
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 8,
                              color: "rgba(255,255,255,0.25)",
                              fontWeight: 600,
                              textTransform: "uppercase" as const,
                              letterSpacing: "0.06em",
                              marginBottom: 8,
                            }}
                          >
                            Top Items
                          </div>
                          {[
                            { name: "Espresso", sold: 48, pct: 86, c: NEON },
                            { name: "Matcha Latte", sold: 34, pct: 64, c: "#a78bfa" },
                            { name: "Croissant", sold: 29, pct: 52, c: "#34d399" },
                            { name: "Frappe", sold: 22, pct: 40, c: "#f59e0b" },
                          ].map((p, pi) => (
                            <div key={pi} style={{ marginBottom: 6 }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: 2,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: "rgba(255,255,255,0.50)",
                                    fontWeight: 500,
                                  }}
                                >
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: "rgba(255,255,255,0.28)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.sold}
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 3,
                                  borderRadius: 999,
                                  background: "rgba(255,255,255,0.06)",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    borderRadius: 999,
                                    width: mockVisible ? `${p.pct}%` : "0%",
                                    background: `linear-gradient(90deg,${p.c}88,${p.c})`,
                                    transition: `width 0.8s ease-out ${0.3 + pi * 0.12}s`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            padding: "10px 12px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 8,
                              color: "rgba(255,255,255,0.25)",
                              fontWeight: 600,
                              textTransform: "uppercase" as const,
                              letterSpacing: "0.06em",
                              marginBottom: 6,
                            }}
                          >
                            Payment Mix
                          </div>
                          {[
                            { method: "GCash", pct: 52, c: BLUE },
                            { method: "Cash", pct: 31, c: "#34d399" },
                            { method: "Card", pct: 17, c: "#a78bfa" },
                          ].map((p, pi) => (
                            <div key={pi} style={{ marginBottom: 5 }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: 1,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: "rgba(255,255,255,0.38)",
                                    fontWeight: 500,
                                  }}
                                >
                                  {p.method}
                                </span>
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: "rgba(255,255,255,0.55)",
                                    fontWeight: 700,
                                  }}
                                >
                                  {p.pct}%
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 3,
                                  borderRadius: 999,
                                  background: "rgba(255,255,255,0.06)",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    borderRadius: 999,
                                    width: mockVisible ? `${p.pct}%` : "0%",
                                    background: p.c,
                                    transition: `width 0.7s ease-out ${0.5 + pi * 0.1}s`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                          <div
                            style={{
                              marginTop: 8,
                              paddingTop: 7,
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span
                                style={{
                                  fontSize: 7,
                                  color: "rgba(255,255,255,0.28)",
                                  fontWeight: 500,
                                }}
                              >
                                Today's goal
                              </span>
                              <span style={{ fontSize: 7, color: NEON, fontWeight: 700 }}>83%</span>
                            </div>
                            <div
                              style={{
                                height: 4,
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.06)",
                                marginTop: 4,
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  borderRadius: 999,
                                  width: mockVisible ? "83%" : "0%",
                                  background: `linear-gradient(90deg,${BLUE2},${NEON})`,
                                  transition: "width 1s ease-out 0.8s",
                                }}
                              />
                            </div>
                            <div
                              style={{ fontSize: 6, color: "rgba(255,255,255,0.20)", marginTop: 3 }}
                            >
                              ₱24,850 / ₱30,000
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeMockTab === "POS" && (
                  <div
                    key="pos"
                    className="mock-tab-content"
                    style={{ display: "flex", height: "100%", overflow: "hidden" }}
                  >
                    <div
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                        <div
                          style={{
                            flex: 1,
                            height: 26,
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "0 10px",
                          }}
                        >
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.20)" }}>🔍</span>
                          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.20)" }}>
                            Search products…
                          </span>
                        </div>
                        <div
                          style={{
                            height: 26,
                            padding: "0 10px",
                            borderRadius: 8,
                            background: "rgba(59,130,246,0.12)",
                            border: "1px solid rgba(59,130,246,0.22)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontSize: 9 }}>📷</span>
                          <span style={{ fontSize: 7, color: NEON, fontWeight: 600 }}>Scan</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {["All", "Drinks", "Food", "Snacks", "Desserts"].map((c, ci) => (
                          <div
                            key={ci}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 20,
                              fontSize: 7,
                              fontWeight: 600,
                              background:
                                ci === 0 ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                              color: ci === 0 ? NEON : "rgba(255,255,255,0.30)",
                              border:
                                ci === 0
                                  ? "1px solid rgba(59,130,246,0.25)"
                                  : "1px solid rgba(255,255,255,0.06)",
                              cursor: "pointer",
                            }}
                          >
                            {c}
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3,1fr)",
                          gap: 7,
                          flex: 1,
                        }}
                      >
                        {[
                          { e: "☕", name: "Espresso", price: 80, stock: 48 },
                          { e: "🍵", name: "Matcha Latte", price: 120, stock: 34 },
                          { e: "🥤", name: "Frappe", price: 150, stock: 22 },
                          { e: "🥐", name: "Croissant", price: 65, stock: 15 },
                          { e: "🍰", name: "Cake Slice", price: 95, stock: 8 },
                          { e: "💧", name: "Water", price: 25, stock: 60 },
                        ].map((p, pi) => {
                          const hl = posHighlight === pi;
                          return (
                            <div
                              key={pi}
                              style={{
                                borderRadius: 10,
                                background: hl ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.03)",
                                border: hl
                                  ? "1px solid rgba(59,130,246,0.42)"
                                  : "1px solid rgba(255,255,255,0.07)",
                                padding: "8px 6px 6px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 3,
                                cursor: "pointer",
                                transition: "all 0.22s",
                                position: "relative",
                                transform: hl ? "scale(1.04)" : "scale(1)",
                              }}
                            >
                              {p.stock <= 10 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 4,
                                    right: 4,
                                    fontSize: 5,
                                    fontWeight: 700,
                                    color: "#f59e0b",
                                    background: "rgba(245,158,11,0.15)",
                                    border: "1px solid rgba(245,158,11,0.30)",
                                    borderRadius: 4,
                                    padding: "1px 4px",
                                  }}
                                >
                                  LOW
                                </div>
                              )}
                              <div style={{ fontSize: 20, lineHeight: 1 }}>{p.e}</div>
                              <div
                                style={{
                                  fontSize: 7,
                                  fontWeight: 700,
                                  color: "rgba(255,255,255,0.75)",
                                  textAlign: "center" as const,
                                }}
                              >
                                {p.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 800,
                                  color: hl ? NEON : "rgba(255,255,255,0.85)",
                                }}
                              >
                                ₱{p.price}
                              </div>
                              <div style={{ fontSize: 6, color: "rgba(255,255,255,0.20)" }}>
                                Stock: {p.stock}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 132,
                        borderLeft: "1px solid rgba(255,255,255,0.06)",
                        background: "rgba(0,0,0,0.15)",
                        display: "flex",
                        flexDirection: "column",
                        padding: "10px 9px",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 3,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.35)",
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.08em",
                          }}
                        >
                          Cart
                        </div>
                        <div
                          style={{
                            fontSize: 7,
                            color: NEON,
                            fontWeight: 700,
                            background: "rgba(59,130,246,0.12)",
                            border: "1px solid rgba(59,130,246,0.20)",
                            borderRadius: 10,
                            padding: "1px 7px",
                          }}
                        >
                          {posCart.reduce((a, i) => a + i.qty, 0)} items
                        </div>
                      </div>
                      {posCart.length === 0 ? (
                        <div
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexDirection: "column",
                            gap: 5,
                          }}
                        >
                          <span style={{ fontSize: 22, opacity: 0.2 }}>🛒</span>
                          <span
                            style={{
                              fontSize: 7,
                              color: "rgba(255,255,255,0.18)",
                              textAlign: "center" as const,
                            }}
                          >
                            Tap a product to add to cart
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                            overflow: "hidden",
                          }}
                        >
                          {posCart.map((item) => (
                            <div
                              key={item.name}
                              style={{
                                borderRadius: 7,
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.07)",
                                padding: "5px 7px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 7,
                                    fontWeight: 600,
                                    color: "rgba(255,255,255,0.75)",
                                  }}
                                >
                                  {item.e} {item.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 7,
                                    fontWeight: 800,
                                    color: "rgba(255,255,255,0.40)",
                                    background: "rgba(255,255,255,0.06)",
                                    borderRadius: 4,
                                    padding: "0 4px",
                                  }}
                                >
                                  ×{item.qty}
                                </span>
                              </div>
                              <div
                                style={{ fontSize: 8, fontWeight: 800, color: NEON, marginTop: 2 }}
                              >
                                ₱{item.price * item.qty}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.07)",
                          paddingTop: 7,
                          marginTop: 2,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 2,
                          }}
                        >
                          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.28)" }}>
                            Subtotal
                          </span>
                          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.45)" }}>
                            ₱{posCart.reduce((a, i) => a + i.price * i.qty, 0)}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 7,
                          }}
                        >
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>Total</span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: NEON }}>
                            ₱{posCart.reduce((a, i) => a + i.price * i.qty, 0)}
                          </span>
                        </div>
                        <div
                          style={{
                            background: posCharging
                              ? `linear-gradient(135deg,#34d399,#059669)`
                              : `linear-gradient(135deg,${BLUE},${BLUE2})`,
                            borderRadius: 8,
                            padding: "7px 0",
                            textAlign: "center" as const,
                            fontSize: 8,
                            fontWeight: 800,
                            color: "#fff",
                            cursor: "pointer",
                            transition: "background 0.4s ease",
                            boxShadow: posCharging
                              ? "0 4px 14px rgba(52,211,153,0.35)"
                              : `0 4px 14px rgba(59,130,246,0.35)`,
                          }}
                        >
                          {posCharging
                            ? "✓ Processing…"
                            : `Charge ₱${posCart.reduce((a, i) => a + i.price * i.qty, 0)}`}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                          {["Cash", "GCash", "Card"].map((m, mi) => (
                            <div
                              key={mi}
                              style={{
                                flex: 1,
                                textAlign: "center" as const,
                                fontSize: 6,
                                fontWeight: 600,
                                padding: "3px 0",
                                borderRadius: 5,
                                background:
                                  mi === 1 ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
                                color: mi === 1 ? NEON : "rgba(255,255,255,0.28)",
                                border:
                                  mi === 1
                                    ? "1px solid rgba(59,130,246,0.25)"
                                    : "1px solid rgba(255,255,255,0.06)",
                                cursor: "pointer",
                              }}
                            >
                              {m}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeMockTab === "Orders" && (
                  <div
                    key="orders"
                    className="mock-tab-content"
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                      height: "100%",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ display: "flex", gap: 5 }}>
                        {[
                          { l: "All", n: 12 },
                          { l: "Pending", n: 4 },
                          { l: "Preparing", n: 5 },
                          { l: "Ready", n: 3 },
                        ].map((tab, ti) => (
                          <div
                            key={ti}
                            style={{
                              padding: "3px 9px",
                              borderRadius: 20,
                              fontSize: 7,
                              fontWeight: 600,
                              background:
                                ti === 0 ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                              color: ti === 0 ? NEON : "rgba(255,255,255,0.30)",
                              border:
                                ti === 0
                                  ? "1px solid rgba(59,130,246,0.25)"
                                  : "1px solid rgba(255,255,255,0.06)",
                              cursor: "pointer",
                            }}
                          >
                            {tab.l} <span style={{ opacity: 0.55 }}>·{tab.n}</span>
                          </div>
                        ))}
                      </div>
                      <div
                        style={{ fontSize: 7, color: "rgba(255,255,255,0.22)", fontWeight: 500 }}
                      >
                        Auto-refresh 30s
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        overflow: "hidden",
                        flex: 1,
                      }}
                    >
                      {[
                        {
                          id: "#4295",
                          table: "Table 4",
                          items: "Espresso ×2, Matcha Latte",
                          amt: "₱320",
                          status: "Pending",
                          sc: "#f59e0b",
                          time: "1m",
                          av: "MS",
                          urgent: true,
                        },
                        {
                          id: "#4294",
                          table: "Table 2",
                          items: "Frappe, Cake Slice, Water ×2",
                          amt: "₱265",
                          status: "Preparing",
                          sc: BLUE,
                          time: "4m",
                          av: "CR",
                          urgent: false,
                        },
                        {
                          id: "#4293",
                          table: "Takeaway",
                          items: "Americano ×3, Croissant ×2",
                          amt: "₱435",
                          status: "Ready",
                          sc: "#34d399",
                          time: "7m",
                          av: "AG",
                          urgent: false,
                        },
                        {
                          id: "#4292",
                          table: "Table 7",
                          items: "Hot Choco, Muffin, OJ",
                          amt: "₱260",
                          status: "Paid",
                          sc: NEON,
                          time: "11m",
                          av: "JD",
                          urgent: false,
                        },
                        {
                          id: "#4291",
                          table: "Table 1",
                          items: "Espresso, BLT Sandwich",
                          amt: "₱245",
                          status: "Done",
                          sc: "rgba(255,255,255,0.22)",
                          time: "18m",
                          av: "MS",
                          urgent: false,
                        },
                      ].map((o, oi) => (
                        <div
                          key={oi}
                          style={{
                            padding: "7px 10px",
                            borderRadius: 9,
                            background: o.urgent
                              ? "rgba(245,158,11,0.06)"
                              : "rgba(255,255,255,0.025)",
                            border: o.urgent
                              ? "1px solid rgba(245,158,11,0.18)"
                              : "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: "rgba(59,130,246,0.18)",
                              border: "1px solid rgba(59,130,246,0.22)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 7,
                              fontWeight: 800,
                              color: NEON,
                              flexShrink: 0,
                            }}
                          >
                            {o.av}
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: NEON }}>{o.id}</div>
                            <div
                              style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", marginTop: 1 }}
                            >
                              {o.table}
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 7,
                                color: "rgba(255,255,255,0.50)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {o.items}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: "#fff" }}>
                              {o.amt}
                            </div>
                            <div
                              style={{ fontSize: 6, color: "rgba(255,255,255,0.22)", marginTop: 1 }}
                            >
                              {o.time} ago
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 7,
                              fontWeight: 700,
                              color: o.sc,
                              padding: "2px 7px",
                              borderRadius: 20,
                              background: "rgba(255,255,255,0.04)",
                              border: `1px solid ${o.sc}44`,
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {o.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeMockTab === "Products" && (
                  <div
                    key="products"
                    className="mock-tab-content"
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      height: "100%",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
                        Products{" "}
                        <span
                          style={{ color: "rgba(255,255,255,0.28)", fontWeight: 500, fontSize: 8 }}
                        >
                          24 items
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <div
                          style={{
                            padding: "4px 9px",
                            borderRadius: 7,
                            fontSize: 7,
                            fontWeight: 600,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            color: "rgba(255,255,255,0.40)",
                            cursor: "pointer",
                          }}
                        >
                          ↑ Import
                        </div>
                        <div
                          style={{
                            background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                            borderRadius: 7,
                            padding: "4px 10px",
                            fontSize: 7,
                            fontWeight: 700,
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          + Add
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        flex: 1,
                        overflow: "hidden",
                      }}
                    >
                      {[
                        {
                          e: "☕",
                          name: "Espresso",
                          cat: "Coffee",
                          price: 80,
                          cost: 18,
                          stock: 48,
                          c: NEON,
                          low: false,
                        },
                        {
                          e: "🍵",
                          name: "Matcha Latte",
                          cat: "Tea",
                          price: 120,
                          cost: 32,
                          stock: 34,
                          c: "#34d399",
                          low: false,
                        },
                        {
                          e: "🥤",
                          name: "Frappe",
                          cat: "Blended",
                          price: 150,
                          cost: 45,
                          stock: 22,
                          c: "#a78bfa",
                          low: false,
                        },
                        {
                          e: "🥐",
                          name: "Croissant",
                          cat: "Pastry",
                          price: 65,
                          cost: 20,
                          stock: 15,
                          c: "#f59e0b",
                          low: false,
                        },
                        {
                          e: "🍰",
                          name: "Cake Slice",
                          cat: "Dessert",
                          price: 95,
                          cost: 28,
                          stock: 8,
                          c: "#fb7185",
                          low: true,
                        },
                        {
                          e: "🧃",
                          name: "Fresh Juice",
                          cat: "Drinks",
                          price: 45,
                          cost: 12,
                          stock: 60,
                          c: BLUE,
                          low: false,
                        },
                      ].map((p, pi) => {
                        const margin = Math.round(((p.price - p.cost) / p.price) * 100);
                        return (
                          <div
                            key={pi}
                            style={{
                              borderRadius: 9,
                              background: "rgba(255,255,255,0.025)",
                              border: p.low
                                ? "1px solid rgba(251,113,133,0.20)"
                                : "1px solid rgba(255,255,255,0.06)",
                              padding: "7px 10px",
                              display: "flex",
                              alignItems: "center",
                              gap: 9,
                            }}
                          >
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 7,
                                background: `${p.c}18`,
                                border: `1px solid ${p.c}33`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                flexShrink: 0,
                              }}
                            >
                              {p.e}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 6,
                                    color: "rgba(255,255,255,0.28)",
                                    background: "rgba(255,255,255,0.05)",
                                    borderRadius: 4,
                                    padding: "1px 5px",
                                  }}
                                >
                                  {p.cat}
                                </span>
                                {p.low && (
                                  <span
                                    style={{
                                      fontSize: 6,
                                      color: "#fb7185",
                                      background: "rgba(251,113,133,0.12)",
                                      borderRadius: 4,
                                      padding: "1px 5px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    LOW STOCK
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: p.c }}>
                                ₱{p.price}
                              </div>
                              <div style={{ fontSize: 6, color: "rgba(255,255,255,0.25)" }}>
                                Cost ₱{p.cost}
                              </div>
                            </div>
                            <div
                              style={{ textAlign: "right" as const, flexShrink: 0, minWidth: 36 }}
                            >
                              <div style={{ fontSize: 8, fontWeight: 700, color: "#34d399" }}>
                                {margin}%
                              </div>
                              <div style={{ fontSize: 6, color: "rgba(255,255,255,0.22)" }}>
                                margin
                              </div>
                            </div>
                            <div
                              style={{ textAlign: "right" as const, flexShrink: 0, minWidth: 28 }}
                            >
                              <div
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: p.stock <= 10 ? "#fb7185" : "rgba(255,255,255,0.55)",
                                }}
                              >
                                {p.stock}
                              </div>
                              <div style={{ fontSize: 6, color: "rgba(255,255,255,0.22)" }}>
                                stock
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeMockTab === "Staff" && (
                  <div
                    key="staff"
                    className="mock-tab-content"
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      height: "100%",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                      {[
                        { l: "Clocked In", v: "9", c: "#34d399" },
                        { l: "On Break", v: "3", c: "#f59e0b" },
                        { l: "Hrs Today", v: "76.5h", c: NEON },
                        { l: "Wages Today", v: "₱4,200", c: "#a78bfa" },
                      ].map((s, si) => (
                        <div
                          key={si}
                          style={{
                            flex: 1,
                            borderRadius: 9,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            padding: "8px 10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 6,
                              color: "rgba(255,255,255,0.28)",
                              fontWeight: 600,
                              textTransform: "uppercase" as const,
                              letterSpacing: "0.07em",
                            }}
                          >
                            {s.l}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: s.c, marginTop: 3 }}>
                            {s.v}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        overflow: "hidden",
                        flex: 1,
                      }}
                    >
                      {[
                        {
                          name: "Juan dela Cruz",
                          role: "Manager",
                          in: "8:00 AM",
                          hrs: "4h 12m",
                          sales: "₱8,420",
                          status: "Active",
                          c: "#34d399",
                          av: "JD",
                        },
                        {
                          name: "Maria Santos",
                          role: "Cashier",
                          in: "8:30 AM",
                          hrs: "3h 42m",
                          sales: "₱5,180",
                          status: "Active",
                          c: "#34d399",
                          av: "MS",
                        },
                        {
                          name: "Carlo Reyes",
                          role: "Barista",
                          in: "9:00 AM",
                          hrs: "3h 12m",
                          sales: "—",
                          status: "Break",
                          c: "#f59e0b",
                          av: "CR",
                        },
                        {
                          name: "Ana Gomez",
                          role: "Cashier",
                          in: "10:00 AM",
                          hrs: "2h 12m",
                          sales: "₱2,640",
                          status: "Active",
                          c: "#34d399",
                          av: "AG",
                        },
                        {
                          name: "Ben Torres",
                          role: "Kitchen",
                          in: "—",
                          hrs: "—",
                          sales: "—",
                          status: "Off",
                          c: "rgba(255,255,255,0.20)",
                          av: "BT",
                        },
                      ].map((s, si) => (
                        <div
                          key={si}
                          style={{
                            padding: "7px 10px",
                            borderRadius: 9,
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: `linear-gradient(135deg,${s.c}44,${s.c}18)`,
                              border: `1px solid ${s.c}44`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 8,
                              fontWeight: 800,
                              color: s.c,
                              flexShrink: 0,
                            }}
                          >
                            {s.av}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>
                              {s.name}
                            </div>
                            <div
                              style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", marginTop: 1 }}
                            >
                              {s.role} · In: {s.in}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                            <div style={{ fontSize: 8, fontWeight: 700, color: NEON }}>
                              {s.sales}
                            </div>
                            <div
                              style={{ fontSize: 6, color: "rgba(255,255,255,0.22)", marginTop: 1 }}
                            >
                              {s.hrs}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 7,
                              fontWeight: 700,
                              color: s.c,
                              padding: "2px 7px",
                              borderRadius: 20,
                              background: `${s.c}18`,
                              border: `1px solid ${s.c}33`,
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {s.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeMockTab === "Reports" && (
                  <div
                    key="reports"
                    className="mock-tab-content"
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      height: "100%",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                      {[
                        { l: "This Week", v: "₱134,200", d: "+18% vs last", c: NEON },
                        { l: "Best Day", v: "Thursday", d: "₱28,500 revenue", c: "#a78bfa" },
                        { l: "Daily Avg", v: "₱19,171", d: "7-day rolling avg", c: "#34d399" },
                      ].map((m, mi) => (
                        <div
                          key={mi}
                          style={{
                            flex: 1,
                            borderRadius: 9,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            padding: "9px 11px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 7,
                              color: "rgba(255,255,255,0.28)",
                              fontWeight: 600,
                              textTransform: "uppercase" as const,
                              letterSpacing: "0.07em",
                            }}
                          >
                            {m.l}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: m.c, marginTop: 3 }}>
                            {m.v}
                          </div>
                          <div
                            style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", marginTop: 2 }}
                          >
                            {m.d}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        padding: "11px 13px",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 8,
                            color: "rgba(255,255,255,0.25)",
                            fontWeight: 600,
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.06em",
                          }}
                        >
                          Daily Revenue — This Week
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <div
                              style={{ width: 8, height: 3, borderRadius: 2, background: NEON }}
                            />
                            <span style={{ fontSize: 6, color: "rgba(255,255,255,0.30)" }}>
                              This week
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <div
                              style={{
                                width: 8,
                                height: 3,
                                borderRadius: 2,
                                background: "rgba(255,255,255,0.18)",
                              }}
                            />
                            <span style={{ fontSize: 6, color: "rgba(255,255,255,0.30)" }}>
                              Last week
                            </span>
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 5,
                          overflow: "hidden",
                        }}
                      >
                        {[
                          { day: "Mon", val: 58, prev: 48 },
                          { day: "Tue", val: 72, prev: 61 },
                          { day: "Wed", val: 65, prev: 70 },
                          { day: "Thu", val: 100, prev: 82 },
                          { day: "Fri", val: 88, prev: 75 },
                          { day: "Sat", val: 79, prev: 66 },
                          { day: "Sun", val: 45, prev: 52 },
                        ].map((b, bi) => (
                          <div
                            key={bi}
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 3,
                              height: "100%",
                              justifyContent: "flex-end",
                            }}
                          >
                            <div
                              style={{
                                width: "100%",
                                display: "flex",
                                gap: 1,
                                height: "100%",
                                alignItems: "flex-end",
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  borderRadius: "3px 3px 0 0",
                                  background: "rgba(255,255,255,0.10)",
                                  height: mockVisible ? `${b.prev}%` : "0%",
                                  transition: `height 0.6s ease-out ${0.05 + bi * 0.08}s`,
                                  minHeight: 0,
                                }}
                              />
                              <div
                                style={{
                                  flex: 1,
                                  borderRadius: "3px 3px 0 0",
                                  background:
                                    b.day === "Thu"
                                      ? `linear-gradient(to top,${NEON},${NEON}99)`
                                      : `linear-gradient(to top,${BLUE},${BLUE}88)`,
                                  height: mockVisible ? `${b.val}%` : "0%",
                                  transition: `height 0.7s ease-out ${0.1 + bi * 0.09}s`,
                                  minHeight: 0,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 6,
                                color: b.day === "Thu" ? NEON : "rgba(255,255,255,0.25)",
                                fontWeight: b.day === "Thu" ? 700 : 500,
                                flexShrink: 0,
                              }}
                            >
                              {b.day}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ContainerScroll>
      </section>

      <div
        style={{
          height: 80,
          background: `linear-gradient(to bottom, ${DARK}, rgba(255,255,255,0.015))`,
          position: "relative",
          zIndex: 1,
          marginBottom: -1,
        }}
      />

      <section
        id="features"
        className="scroll-section lp-section-lazy"
        style={{ position: "relative", zIndex: 1, padding: "88px 0" }}
      >
        <div className="sr" style={{ textAlign: "center", marginBottom: 52, padding: "0 32px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: BLUE,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            What's included
          </div>
          <h2
            style={{
              fontSize: 38,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              margin: "0 0 10px",
              lineHeight: 1.1,
            }}
          >
            Everything your business needs.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.38)",
              maxWidth: 420,
              margin: "0 auto",
              lineHeight: 1.65,
            }}
          >
            Actual features, not a roadmap.
          </p>
        </div>

        <div
          style={{ overflow: "hidden", position: "relative", cursor: "grab", userSelect: "none" }}
          onMouseEnter={() => {
            featHoveredRef.current = true;
          }}
          onMouseLeave={() => {
            featHoveredRef.current = false;
            featDraggingRef.current = false;
          }}
          onMouseDown={(e) => {
            featDraggingRef.current = true;
            featLastXRef.current = e.clientX;
            featVelRef.current = 0;
            (e.currentTarget as HTMLElement).style.cursor = "grabbing";
          }}
          onMouseMove={(e) => {
            if (!featDraggingRef.current) return;
            const delta = featLastXRef.current - e.clientX;
            featLastXRef.current = e.clientX;
            featVelRef.current = delta;
            const el = featTrackRef.current;
            if (!el) return;
            const halfW = el.scrollWidth / 2;
            featPosRef.current = (((featPosRef.current + delta) % halfW) + halfW) % halfW;
            el.style.transform = `translateX(${-featPosRef.current}px)`;
          }}
          onMouseUp={(e) => {
            featDraggingRef.current = false;
            (e.currentTarget as HTMLElement).style.cursor = "grab";
          }}
          onTouchStart={(e) => {
            featDraggingRef.current = true;
            featLastXRef.current = e.touches[0].clientX;
            featVelRef.current = 0; // hold instantly stops
          }}
          onTouchMove={(e) => {
            const el = featTrackRef.current;
            if (!el) return;
            const currentX = e.touches[0].clientX;
            const delta = featLastXRef.current - currentX;
            featLastXRef.current = currentX;
            featVelRef.current = delta;
            const halfW = el.scrollWidth / 2;
            featPosRef.current = (((featPosRef.current + delta) % halfW) + halfW) % halfW;
            el.style.transform = `translateX(${-featPosRef.current}px)`;
          }}
          onTouchEnd={() => {
            featDraggingRef.current = false;
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 80,
              background: `linear-gradient(to right, ${DARK}, transparent)`,
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 80,
              background: `linear-gradient(to left, ${DARK}, transparent)`,
              zIndex: 2,
              pointerEvents: "none",
            }}
          />

          <div
            ref={featTrackRef}
            style={{ display: "flex", gap: 18, padding: "4px 0 12px", willChange: "transform" }}
          >
            {[0, 1].map((pass) => (
              <div key={pass} style={{ display: "flex", gap: 18, flexShrink: 0 }}>
                {[
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="9" cy="21" r="1" />
                        <circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                    ),
                    title: "Point of Sale",
                    desc: "Barcode scanning, cash/card/split payments, receipt printing. Works offline and syncs when back online.",
                    color: BLUE,
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                    ),
                    title: "Real-time Analytics",
                    desc: "Live revenue, top products, hourly trends, and staff performance. Export to Excel or PDF anytime.",
                    color: "#34d399",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4l3 3" />
                      </svg>
                    ),
                    title: "AI Business Assistant",
                    desc: 'Ask questions about your own data. "What sold most this week?" Multiple AI providers with automatic fallback.',
                    color: "#a78bfa",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    ),
                    title: "Multi-branch",
                    desc: "One account, multiple locations. Assign staff to branches, transfer stock, and view per-branch reports.",
                    color: BLUE,
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    ),
                    title: "Inventory & Expiry",
                    desc: "Automatic low-stock alerts, expiry tracking, and full purchase order flow from supplier to shelf.",
                    color: "#34d399",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    ),
                    title: "Staff & Payroll",
                    desc: "Time clock, shift scheduling, payroll entries. Staff clock in from any device. Track labor cost vs. revenue.",
                    color: "#f59e0b",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <path d="m9 16 2 2 4-4" />
                      </svg>
                    ),
                    title: "Appointments & Rooms",
                    desc: "Book and check out service appointments directly. Works for salons, clinics, spas, and hospitality.",
                    color: "#a78bfa",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 12 20 22 4 22 4 12" />
                        <rect x="2" y="7" width="20" height="5" />
                        <path d="M12 22V7" />
                        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                      </svg>
                    ),
                    title: "Loyalty & Memberships",
                    desc: "Points-based loyalty with tiered rewards. Membership plans with recurring check-ins and redemptions at checkout.",
                    color: "#f472b6",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    ),
                    title: "Tax & Audit Log",
                    desc: "OR number tracking, VAT computation, and a full void/refund audit trail. Every transaction is logged and tamper-evident.",
                    color: "#34d399",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    ),
                    title: "Expenses & Suppliers",
                    desc: "Track expenses by category, manage suppliers and purchase orders, and compare costs against revenue.",
                    color: "#f59e0b",
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <line x1="12" y1="20" x2="12.01" y2="20" />
                      </svg>
                    ),
                    title: "WiFi Voucher Management",
                    desc: "Generate and sell timed WiFi access vouchers directly from the POS. Built for cafes, hotels, and restaurants.",
                    color: BLUE,
                  },
                  {
                    svg: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                    ),
                    title: "Receipt & Kitchen Print",
                    desc: "Bluetooth, network, and USB printer support. Kitchen Display System routes orders in real time — no paper tickets.",
                    color: "#a78bfa",
                  },
                ].map(({ svg, title, desc, color }, i) => (
                  <div
                    key={i}
                    className="fcard"
                    style={{
                      width: 300,
                      flexShrink: 0,
                      padding: "24px 22px",
                      borderRadius: 16,
                      background: CARD,
                      border: "1px solid rgba(59,130,246,0.10)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: `${color}14`,
                        border: `1px solid ${color}26`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color,
                        flexShrink: 0,
                      }}
                    >
                      {svg}
                    </div>
                    <div>
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "rgba(255,255,255,0.42)",
                          lineHeight: 1.68,
                        }}
                      >
                        {desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 12,
            color: "rgba(255,255,255,0.22)",
            letterSpacing: "0.04em",
          }}
        >
          Swipe or hover to pause
        </div>
      </section>

      <section
        id="devices"
        className="scroll-section"
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(255,255,255,0.018)",
          borderTop: "1px solid rgba(59,130,246,0.07)",
          borderBottom: "1px solid rgba(59,130,246,0.07)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "88px 32px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 72,
            alignItems: "center",
          }}
        >
          <div>
            <div
              className="sr sr-left"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: BLUE,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Works everywhere
            </div>
            <h2
              className="sr sr-left sr-d1"
              style={{
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                margin: "0 0 16px",
                lineHeight: 1.1,
              }}
            >
              Your team uses it on
              <br />
              whatever they have.
            </h2>
            <p
              className="sr sr-left sr-d2"
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.44)",
                lineHeight: 1.75,
                marginBottom: 32,
                maxWidth: 400,
              }}
            >
              Cashiers use a tablet at the counter. Managers check analytics on a laptop. Owners
              monitor sales on their phone. All synced, all real-time.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                {
                  svg: (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  ),
                  d: "Phone",
                  sub: "Full POS, approvals, and push notifications",
                },
                {
                  svg: (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  ),
                  d: "Tablet",
                  sub: "Best cashier screen — fast, touch-optimized",
                },
                {
                  svg: (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  ),
                  d: "Laptop",
                  sub: "Analytics, management, and back-office",
                },
                {
                  svg: (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                      <polyline points="2 20 22 20" />
                    </svg>
                  ),
                  d: "Desktop",
                  sub: "Kitchen display, kiosk mode, multi-window",
                },
              ].map((dev, i) => (
                <div
                  key={i}
                  className={`sr sr-left sr-d${i + 2}`}
                  style={{ display: "flex", alignItems: "center", gap: 14 }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 13,
                      background: "rgba(59,130,246,0.09)",
                      border: "1px solid rgba(59,130,246,0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: NEON,
                      flexShrink: 0,
                    }}
                  >
                    {dev.svg}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{dev.d}</div>
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
                      {dev.sub}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              {
                label: "Offline POS",
                desc: "Sells even with no connection. Auto-syncs when you're back online.",
                color: NEON,
              },
              {
                label: "Install as App",
                desc: "Add to home screen — behaves like a native app, no app store needed.",
                color: "#34d399",
              },
              {
                label: "Wireless Printing",
                desc: "Print to Bluetooth or network thermal printers from any device.",
                color: "#a78bfa",
              },
              {
                label: "Push Notifications",
                desc: "Get alerts when stock runs low, staff clock in, or daily sales targets are hit.",
                color: "#f59e0b",
              },
            ].map((c, i) => (
              <div
                key={i}
                className={`sr sr-right sr-d${i + 1} dcard`}
                style={{
                  padding: "20px",
                  borderRadius: 14,
                  background: CARD,
                  border: "1px solid rgba(59,130,246,0.11)",
                }}
              >
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: c.color,
                    boxShadow: `0 0 10px ${c.color}`,
                    marginBottom: 11,
                  }}
                />
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 7 }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.65 }}>
                  {c.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="scroll-section lp-section-lazy"
        style={{ position: "relative", zIndex: 1, borderTop: "1px solid rgba(59,130,246,0.07)" }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "80px 32px" }}>
          <div className="sr" style={{ textAlign: "center", marginBottom: 56 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: NEON,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              How it works
            </div>
            <h2
              style={{
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                margin: "0 0 10px",
                lineHeight: 1.1,
              }}
            >
              Up and running in under 10 minutes.
            </h2>
            <p
              style={{
                fontSize: 14.5,
                color: "rgba(255,255,255,0.38)",
                maxWidth: 400,
                margin: "0 auto",
                lineHeight: 1.65,
              }}
            >
              No installation. No hardware required. Just a browser and your products.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0,
              position: "relative",
            }}
          >
            <div
              className="gsap-hiw-line"
              style={{
                position: "absolute",
                top: 32,
                left: "12.5%",
                right: "12.5%",
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(59,130,246,0.20), rgba(59,130,246,0.20), transparent)",
                zIndex: 0,
              }}
            />
            {[
              {
                step: "01",
                svg: (
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                ),
                title: "Create your account",
                body: "Sign up free in 2 minutes. No credit card, no setup fee, no expiry on the free plan.",
                color: BLUE,
              },
              {
                step: "02",
                svg: (
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                ),
                title: "Add your products",
                body: "Enter products manually or import a list. Set prices, categories, and stock levels.",
                color: "#34d399",
              },
              {
                step: "03",
                svg: (
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                ),
                title: "Make your first sale",
                body: "Open the POS on any device — phone, tablet, or desktop. Works even without internet.",
                color: "#a78bfa",
              },
              {
                step: "04",
                svg: (
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                ),
                title: "Watch your business",
                body: "Sales, inventory, staff activity, and expenses — all updating in real time, one screen.",
                color: "#f59e0b",
              },
            ].map((item, i) => (
              <div
                key={i}
                className={`sr sr-d${i + 1} lp-step`}
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  padding: "0 20px",
                }}
              >
                <div
                  className="lp-step-circle"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: "rgba(24,24,27,0.95)",
                    border: `1.5px solid ${item.color}40`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 24,
                    flexShrink: 0,
                    position: "relative",
                    color: item.color,
                  }}
                >
                  {item.svg}
                  <div
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: item.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 900, color: "#09090b" }}>
                      {item.step}
                    </span>
                  </div>
                </div>
                <div
                  className="lp-step-title"
                  style={{ fontSize: 15, fontWeight: 800, marginBottom: 10, lineHeight: 1.3 }}
                >
                  {item.title}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", lineHeight: 1.7 }}>
                  {item.body}
                </div>
              </div>
            ))}
          </div>

          <div className="sr sr-d4" style={{ textAlign: "center", marginTop: 52 }}>
            <button
              onClick={() => openPanel("register")}
              className="cta-primary"
              data-testid="button-how-it-works-cta"
            >
              Start for free, no card needed
            </button>
          </div>
        </div>
      </section>

      <section
        id="security"
        className="scroll-section lp-section-lazy"
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "1px solid rgba(59,130,246,0.07)",
          borderBottom: "1px solid rgba(59,130,246,0.07)",
        }}
      >
        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 860,
            margin: "0 auto",
            padding: "80px 32px",
          }}
        >
          <div className="sr" style={{ textAlign: "center", marginBottom: 48 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#34d399",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Security
            </div>
            <h2
              style={{
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                margin: "0 0 12px",
                lineHeight: 1.1,
              }}
            >
              Built for businesses that handle real money.
            </h2>
            <p
              style={{
                fontSize: 14.5,
                color: "rgba(255,255,255,0.40)",
                maxWidth: 440,
                margin: "0 auto",
                lineHeight: 1.65,
              }}
            >
              When cash and staff are involved, accountability is not optional.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="sr sr-left sr-d1 sec-card-pink">
              <div style={{ height: 3, background: "linear-gradient(90deg, #f472b6, #e879f9)" }} />
              <div style={{ padding: "36px 36px 40px" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: "rgba(244,114,182,0.10)",
                    border: "1px solid rgba(244,114,182,0.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#f472b6",
                    marginBottom: 20,
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#fff",
                    marginBottom: 14,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  Every action leaves a permanent record. Nobody can delete it.
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.50)",
                    lineHeight: 1.78,
                    margin: "0 0 20px",
                  }}
                >
                  A cashier voids a sale. A manager gives an unauthorized discount. A staff account
                  quietly gets promoted. In most POS systems, these things happen and then they
                  disappear.
                </p>
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.68)",
                    lineHeight: 1.78,
                    margin: "0 0 28px",
                  }}
                >
                  In ArtixPOS, every void, refund, discount, permission change, and login is
                  permanently logged with a timestamp and who did it. Staff can't delete it.
                  Managers can't delete it. We can't delete it either. That record will always be
                  there.
                </p>
                <div
                  style={{
                    padding: "14px 18px",
                    borderRadius: 12,
                    background: "rgba(244,114,182,0.07)",
                    border: "1px solid rgba(244,114,182,0.20)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>
                    When staff handle your cash every day, you need a history that can't be cleaned
                    up before you look at it.
                  </div>
                </div>
              </div>
            </div>

            <div className="sr sr-right sr-d1 sec-card-blue">
              <div style={{ height: 3, background: "linear-gradient(90deg, #0ea5e9, #38bdf8)" }} />
              <div style={{ padding: "36px 36px 40px" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: "rgba(14,165,233,0.10)",
                    border: "1px solid rgba(14,165,233,0.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#38bdf8",
                    marginBottom: 20,
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#fff",
                    marginBottom: 14,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  Remove a staff account and they're locked out instantly — on every device.
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.50)",
                    lineHeight: 1.78,
                    margin: "0 0 20px",
                  }}
                >
                  Staff turnover is common in most businesses. When someone leaves, you need their
                  access gone immediately — not in an hour, not after their session expires.
                </p>
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.68)",
                    lineHeight: 1.78,
                    margin: "0 0 28px",
                  }}
                >
                  The moment you deactivate an account in ArtixPOS, every active session for that
                  person is terminated. It doesn't matter if they're logged in on their phone, a
                  shop tablet, or their home computer. They're out.
                </p>
                <div
                  style={{
                    padding: "14px 18px",
                    borderRadius: 12,
                    background: "rgba(14,165,233,0.07)",
                    border: "1px solid rgba(14,165,233,0.18)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>
                    Most systems let old sessions linger for hours. We kill them the second you pull
                    access.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="scroll-section lp-section-lazy"
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(255,255,255,0.015)",
          borderTop: "1px solid rgba(59,130,246,0.07)",
        }}
      >
        <div
          style={{ maxWidth: 1060, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}
        >
          <div
            className="sr"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: BLUE,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Simple pricing
          </div>
          <h2
            className="sr sr-d1"
            style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 10px" }}
          >
            Start free. Grow when ready.
          </h2>
          <p
            className="sr sr-d2"
            style={{
              fontSize: 14.5,
              color: "rgba(255,255,255,0.38)",
              maxWidth: 420,
              margin: "0 auto 44px",
              lineHeight: 1.65,
            }}
          >
            Core POS is always free. Unlock more with Pro or Business.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 16,
              margin: "0 auto",
            }}
          >
            <div
              className="price-card sr sr-left sr-d2"
              style={{
                padding: "28px 24px",
                borderRadius: 18,
                background: CARD,
                border: "1px solid rgba(59,130,246,0.14)",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.40)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Free
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginBottom: 3 }}>
                Free{" "}
                <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.35)" }}>
                  /mo
                </span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginBottom: 20 }}>
                No credit card. No expiry.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {[
                  "Full POS — cash, card, split pay",
                  "Unlimited products & categories",
                  "Basic daily analytics",
                  "Single branch",
                  "Transaction history",
                  "Receipt printing",
                  "Offline mode",
                  "Up to 3 staff accounts",
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 13 13"
                      fill="none"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    >
                      <path
                        d="M2 6.5l3 3 6-6"
                        stroke="#34d399"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", lineHeight: 1.4 }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => openPanel("register")}
                style={{
                  marginTop: 22,
                  width: "100%",
                  padding: "11px 0",
                  borderRadius: 11,
                  fontSize: 13,
                  fontWeight: 700,
                  background: "rgba(59,130,246,0.10)",
                  border: "1px solid rgba(59,130,246,0.26)",
                  color: NEON,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.18s",
                }}
              >
                Get started free
              </button>
            </div>

            <div
              className="price-card sr sr-d2"
              style={{
                padding: "28px 24px",
                borderRadius: 18,
                background: "rgba(59,130,246,0.05)",
                border: "1.5px solid rgba(59,130,246,0.35)",
                textAlign: "left",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                POPULAR
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: NEON,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Pro
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginBottom: 3 }}>
                {(() => {
                  const locale = detectLocale();
                  const p = getPricingByCurrency(locale.currency);
                  return (
                    <>
                      {formatPrice(p.proMonthly, p.symbol)}
                      <span
                        style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.35)" }}
                      >
                        /mo
                      </span>
                    </>
                  );
                })()}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginBottom: 20 }}>
                {(() => {
                  const locale = detectLocale();
                  const p = getPricingByCurrency(locale.currency);
                  return `${formatPrice(p.proAnnual, p.symbol)}/yr · ${p.proSavingsText}`;
                })()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {[
                  "Everything in Free",
                  "Unlimited staff & role permissions",
                  "Multi-branch management",
                  "Staff time clock & payroll",
                  "AI business assistant",
                  "Appointments & room booking",
                  "Customer loyalty & memberships",
                  "WiFi voucher management",
                  "Advanced analytics & exports",
                  "Inventory hub & expiry tracker",
                  "Discount codes & promotions",
                  "Priority support",
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 13 13"
                      fill="none"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    >
                      <path
                        d="M2 6.5l3 3 6-6"
                        stroke={NEON}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", lineHeight: 1.4 }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => openPanel("register")}
                style={{
                  marginTop: 22,
                  width: "100%",
                  padding: "11px 0",
                  borderRadius: 11,
                  fontSize: 13,
                  fontWeight: 700,
                  background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 4px 16px rgba(59,130,246,0.28)",
                  transition: "opacity 0.15s",
                }}
              >
                Start free, upgrade anytime
              </button>
            </div>

            <div
              className="price-card sr sr-right sr-d2"
              style={{
                padding: "28px 24px",
                borderRadius: 18,
                background: "rgba(124,58,237,0.06)",
                border: "1.5px solid rgba(124,58,237,0.32)",
                textAlign: "left",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                SCALE
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#a78bfa",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Business
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginBottom: 3 }}>
                {(() => {
                  const locale = detectLocale();
                  const p = getPricingByCurrency(locale.currency);
                  return (
                    <>
                      {formatPrice(p.businessMonthly, p.symbol)}
                      <span
                        style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.35)" }}
                      >
                        /mo
                      </span>
                    </>
                  );
                })()}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginBottom: 20 }}>
                {(() => {
                  const locale = detectLocale();
                  const p = getPricingByCurrency(locale.currency);
                  return `${formatPrice(p.businessAnnual, p.symbol)}/yr · ${p.businessSavingsText}`;
                })()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {[
                  "Everything in Pro",
                  "Unlimited branches",
                  "Supplier & purchase orders",
                  "Full expense tracking",
                  "BIR compliance & audit logs",
                  "Advanced role permissions",
                  "Custom business type configs",
                  "Kitchen display system",
                  "Table management",
                  "Dedicated onboarding call",
                  "SLA-backed priority support",
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 13 13"
                      fill="none"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    >
                      <path
                        d="M2 6.5l3 3 6-6"
                        stroke="#a78bfa"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", lineHeight: 1.4 }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => openPanel("register")}
                style={{
                  marginTop: 22,
                  width: "100%",
                  padding: "11px 0",
                  borderRadius: 11,
                  fontSize: 13,
                  fontWeight: 700,
                  background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 4px 16px rgba(59,130,246,0.28)",
                  transition: "opacity 0.15s",
                }}
              >
                Start free, upgrade anytime
              </button>
            </div>
          </div>

          <p
            className="sr sr-d3"
            style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.22)" }}
          >
            Annual billing saves up to 17% · All plans start with a free account · No credit card
            required
          </p>
        </div>
      </section>

      <section
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "108px 32px 96px",
          borderTop: "1px solid rgba(59,130,246,0.07)",
          overflow: "hidden",
        }}
      >
        <div
          className="lp-aurora-orb"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "70vw",
            height: "60vh",
            borderRadius: "50%",
            background: `radial-gradient(circle at 50% 50%, rgba(59,130,246,0.12) 0%, rgba(96,165,250,0.06) 45%, transparent 70%)`,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: "-4vh",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "clamp(80px, 18vw, 22vw)",
            fontWeight: 900,
            letterSpacing: "-0.06em",
            lineHeight: 0.82,
            color: "transparent",
            WebkitTextStroke: `1px rgba(59,130,246,0.08)`,
            background: `linear-gradient(180deg, rgba(59,130,246,0.10) 0%, transparent 70%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 0,
          }}
        >
          ARTIXPOS
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <h2
            className="sr"
            style={{
              fontSize: 52,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              margin: "0 0 14px",
              lineHeight: 1.05,
            }}
          >
            Ready to start?
          </h2>
          <p
            className="sr sr-d1"
            style={{ fontSize: 16, color: "rgba(255,255,255,0.40)", marginBottom: 40 }}
          >
            Takes less than 2 minutes. Your first sale is free.
          </p>
          <button onClick={() => openPanel("register")} className="cta-primary sr sr-scale sr-d2">
            Create your free account →
          </button>
          <div
            className="sr sr-d3"
            style={{
              marginTop: 56,
              paddingTop: 32,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>A</span>
            </div>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>
              © 2026 ArtixPOS
              <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "rgba(255,255,255,0.28)",
                  textDecoration: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}
              >
                Terms
              </a>
              <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "rgba(255,255,255,0.28)",
                  textDecoration: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}
              >
                Privacy
              </a>
            </span>
          </div>
        </div>
      </section>

      {showLoginPanel && (
        <>
          <div
            onClick={() => setShowLoginPanel(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(0,0,0,0.70)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              cursor: "pointer",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 201,
              width: "100%",
              maxWidth: 460,
              overflowY: "auto",
              background: DARK2,
              borderLeft: "1px solid rgba(59,130,246,0.15)",
              boxShadow: "-32px 0 100px rgba(0,0,0,0.75)",
              animation: "slide-in-right 0.35s cubic-bezier(0.16,1,0.3,1) both",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <button
              onClick={() => setShowLoginPanel(false)}
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                width: 34,
                height: 34,
                borderRadius: 9,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.55)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              }}
            >
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "52px 44px",
              }}
            >
              {loginForm}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const forgotModal = showForgot ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(5px)",
        padding: "0 20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 22,
          padding: "34px 30px",
          background: DARK2,
          border: "1px solid rgba(59,130,246,0.15)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.9)",
        }}
      >
        {forgotSuccess ? (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                margin: "0 auto 16px",
                background: "rgba(59,130,246,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                fill="none"
                stroke={NEON}
                strokeWidth="2.2"
                viewBox="0 0 24 24"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 5.29 5.29l1-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 15.5" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: "#fff" }}>
              Check your email
            </h2>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.52)",
                margin: "0 0 24px",
              }}
            >
              If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent.
            </p>
            <button
              onClick={closeForgot}
              data-testid="button-back-to-signin"
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                color: "#fff",
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={closeForgot}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "rgba(255,255,255,0.38)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontFamily: "inherit",
                marginBottom: 20,
              }}
            >
              <svg
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 7px", color: "#fff" }}>
              Reset password
            </h2>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.48)",
                margin: "0 0 22px",
              }}
            >
              Enter your email and we'll send a reset link.
            </p>
            <form
              onSubmit={handleForgotSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    display: "block",
                    marginBottom: 5,
                    color: "rgba(255,255,255,0.48)",
                  }}
                >
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  data-testid="input-forgot-email"
                  className="finput"
                  style={inputBase}
                  autoComplete="email"
                />
              </div>
              {forgotError && (
                <div
                  style={{
                    padding: "10px 13px",
                    borderRadius: 10,
                    fontSize: 13,
                    background: "rgba(239,68,68,0.10)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "#f87171",
                  }}
                >
                  {forgotError}
                </div>
              )}
              <button
                type="submit"
                disabled={forgotLoading}
                data-testid="button-send-reset"
                style={{
                  padding: "12px 0",
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 700,
                  border: "none",
                  cursor: forgotLoading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: forgotLoading ? 0.7 : 1,
                  background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                  color: "#fff",
                  boxShadow: "0 4px 18px rgba(59,130,246,0.30)",
                }}
              >
                {forgotLoading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  ) : null;

  const debugPanel =
    isNativePlatform() && showDebug ? (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "65vh",
          display: "flex",
          flexDirection: "column",
          background: "#060f18",
          borderTop: "1px solid rgba(59,130,246,0.2)",
          zIndex: 9999,
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}
        >
          <span style={{ color: NEON, fontWeight: 700, fontSize: 12, letterSpacing: "0.05em" }}>
            ARTIXPOS DEBUG
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                const text = debugEntries.map((e) => `${e.ts} [${e.tag}] ${e.msg}`).join("\n");
                navigator.clipboard?.writeText(text).then(() => alert("Logs copied!"));
              }}
              style={{
                color: "#60a5fa",
                background: "rgba(96,165,250,0.1)",
                border: "1px solid rgba(96,165,250,0.2)",
                borderRadius: 5,
                cursor: "pointer",
                fontSize: 10,
                padding: "2px 8px",
              }}
            >
              Copy
            </button>
            <button
              onClick={refreshDebug}
              style={{
                color: "#94a3b8",
                background: "none",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 5,
                cursor: "pointer",
                fontSize: 10,
                padding: "2px 8px",
              }}
            >
              Refresh
            </button>
            <button
              onClick={() => {
                clearDebugLogs();
                setDebugEntries([]);
              }}
              style={{
                color: "#f87171",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 5,
                cursor: "pointer",
                fontSize: 10,
                padding: "2px 8px",
              }}
            >
              Clear
            </button>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
          {debugEntries.length === 0 ? (
            <div style={{ color: "#475569", fontStyle: "italic", padding: "8px 12px" }}>
              No logs yet.
            </div>
          ) : (
            debugEntries
              .slice()
              .reverse()
              .map((e, i) => (
                <div
                  key={i}
                  style={{
                    padding: "3px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "#475569", flexShrink: 0 }}>{e.ts}</span>
                  <span style={{ color: NEON, flexShrink: 0 }}>[{e.tag}]</span>
                  <span style={{ color: "#cbd5e1", wordBreak: "break-all" }}>{e.msg}</span>
                </div>
              ))
          )}
        </div>
      </div>
    ) : null;

  const mobileCard = (
    <div className="md:hidden">
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          background: isDark ? DARK : "#eef7fb",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "32px 26px",
            borderRadius: 22,
            background: isDark ? "rgba(255,255,255,0.033)" : "rgba(255,255,255,0.90)",
            border: `1px solid ${isDark ? "rgba(59,130,246,0.12)" : "rgba(0,0,0,0.06)"}`,
            boxShadow: isDark
              ? "0 0 0 1px rgba(59,130,246,0.05), 0 32px 80px rgba(0,0,0,0.65)"
              : "0 8px 48px rgba(0,0,0,0.09)",
          }}
        >
          {loginForm}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:block">{landingPage}</div>
      {mobileCard}
      {forgotModal}
      {debugPanel}
    </>
  );
}
