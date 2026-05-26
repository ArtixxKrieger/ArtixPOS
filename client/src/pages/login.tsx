import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { debugLog, getDebugLogs, clearDebugLogs, type DebugEntry } from "@/lib/debug-log";
import { NATIVE_TOKEN_KEY, apiRequest, setNativeToken, queryClient, resolveUrl, getCsrfHeaders } from "@/lib/queryClient";
import { clearAllCache } from "@/lib/offline-db";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

function isNativePlatform(): boolean {
  try { return (window as any).Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}
function diagnoseNativeError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("10:") || msg.includes("developer_error") || msg.includes("something went wrong"))
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
  const initOptions: Record<string, any> = { scopes: ["profile", "email"], grantOfflineAccess: true };
  if (webClientId) initOptions.serverClientId = webClientId;
  if (platform === "ios" && iosClientId) initOptions.clientId = iosClientId;
  else if (webClientId) initOptions.clientId = webClientId;
  await GoogleAuth.initialize(initOptions);
  let googleUser: any;
  try { googleUser = await GoogleAuth.signIn(); }
  catch (e: any) { throw new Error(diagnoseNativeError(e?.message ?? String(e))); }
  const idToken = googleUser?.authentication?.idToken;
  if (!idToken) throw new Error(diagnoseNativeError("no id token returned"));
  const res = await apiRequest("POST", "/api/auth/google/native", { idToken });
  const data = await res.json();
  if (!data.token) throw new Error("Server did not return a session token");
  return data.token;
}
function getIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const INVITE_STORAGE_KEY = "artixpos_pending_invite";
const OAUTH_FLOW_KEY = "artixpos_oauth_flow";
type AuthMode = "signin" | "register";

const BLUE  = "#14b8e8";
const BLUE2 = "#0284c7";
const NEON  = "#38d9f5";
const DARK  = "#0C1420";
const DARK2 = "#0a1220";
const CARD  = "rgba(15,30,48,0.92)";

// ── Scroll-reveal hook ───────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("sr-visible");
        }
      });
    }, { threshold: 0.10, rootMargin: "0px 0px -40px 0px" });
    const targets = document.querySelectorAll(".sr");
    targets.forEach(el => io.observe(el));
    return () => io.disconnect();
  });
}

// ── Counter animation hook ───────────────────────────────────────────────────
function useCountUp(target: number, visible: boolean, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = target / (duration / 16);
    const tick = () => {
      start = Math.min(start + step, target);
      setVal(Math.round(start));
      if (start < target) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [visible]);
  return val;
}

export default function Login() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(getIsDark);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>(() => getDebugLogs());
  const refreshDebug = () => setDebugEntries(getDebugLogs());
  const [googleClientId, setGoogleClientId] = useState<string | null>(
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || null
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

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Stats counter visibility
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  // ── Unlock body scroll — index.html sets html,body{overflow:hidden} globally ──
  // We override inline so it wins regardless of screen width or desktop-mode emulation.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow, htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow, bodyHeight: body.style.height,
    };
    const unlock = () => {
      html.style.setProperty("overflow", "auto", "important");
      html.style.setProperty("height",   "auto", "important");
      body.style.setProperty("overflow", "auto", "important");
      body.style.setProperty("height",   "auto", "important");
    };
    unlock();
    // Also re-apply after any potential framework paint that might reset it
    const raf = requestAnimationFrame(unlock);
    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = prev.htmlOverflow;
      html.style.height   = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height   = prev.bodyHeight;
    };
  }, []);

  // Lock body scroll while login panel is open, restore when closed
  useEffect(() => {
    const body = document.body;
    if (showLoginPanel) {
      body.style.setProperty("overflow", "hidden", "important");
    } else {
      body.style.setProperty("overflow", "auto", "important");
    }
  }, [showLoginPanel]);

  // Scroll reveal
  useScrollReveal();

  // Stats visibility observer
  useEffect(() => {
    if (!statsRef.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true); }, { threshold: 0.4 });
    io.observe(statsRef.current);
    return () => io.disconnect();
  }, []);

  const oauthPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (oauthPollTimerRef.current !== null) clearInterval(oauthPollTimerRef.current); }, []);

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (!inviteToken) return;
    localStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
    if (isAuthenticated) {
      (async () => {
        try { await fetch("/auth/logout", { method: "POST", credentials: "include", headers: getCsrfHeaders("POST") }); } catch {}
        const { clearNativeToken } = await import("@/lib/queryClient");
        clearNativeToken();
        queryClient.setQueryData(["auth-me"], null);
        queryClient.clear();
        window.history.replaceState({}, "", "/login");
      })();
    }
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { sessionStorage.removeItem("artix-logout-pending"); return; }
    const logoutPending = sessionStorage.getItem("artix-logout-pending") === "1";
    if (logoutPending) {
      sessionStorage.removeItem("artix-logout-pending");
      (async () => {
        try { await fetch("/auth/logout", { method: "POST", credentials: "include", headers: getCsrfHeaders("POST") }); } catch {}
        const { clearNativeToken } = await import("@/lib/queryClient");
        clearNativeToken();
        await clearAllCache();
        queryClient.cancelQueries();
        queryClient.clear();
        window.location.replace("/login");
      })();
      return;
    }
    setLocation("/");
  }, [isAuthenticated, isLoading, setLocation]);

  useEffect(() => { document.documentElement.classList.toggle("dark", isDark); }, [isDark]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  useEffect(() => {
    const handler = () => setDebugEntries(getDebugLogs());
    window.addEventListener("artixpos-debug-update", handler);
    return () => window.removeEventListener("artixpos-debug-update", handler);
  }, []);
  useEffect(() => {
    if (googleClientId) return;
    fetch("/api/auth/config").then(r => r.json()).then((cfg: { googleClientId?: string | null }) => {
      if (cfg.googleClientId) setGoogleClientId(cfg.googleClientId);
    }).catch(() => {});
  }, []);

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
      return { id: payload.id, name: payload.name ?? null, email: payload.email ?? null, avatar: payload.avatar ?? null, provider: payload.provider ?? "google", tenantId: payload.tenantId ?? null, role: payload.role ?? "owner", activeBranchId: payload.activeBranchId ?? null, activeBranch: null };
    } catch { return null; }
  }

  async function handleNativeGoogleSignIn() {
    setNativeError(null); setSigningIn(true);
    sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
    try {
      const token = await nativeGoogleSignIn();
      await queryClient.cancelQueries();
      setNativeToken(token);
      const userFromToken = decodeTokenUser(token);
      if (userFromToken) queryClient.setQueryData(["auth-me"], userFromToken);
      else await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth-me" });
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const isUserCancel = msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("dismissed") || msg.toLowerCase().includes("12501");
      sessionStorage.removeItem(OAUTH_FLOW_KEY);
      if (!isUserCancel) setNativeError(msg.length < 120 ? msg : "Sign-in failed — tap 'Show debug' for details.");
    } finally { setSigningIn(false); }
  }

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "google-auth-ok") { queryClient.invalidateQueries({ queryKey: ["auth-me"] }); setSigningIn(false); }
      else if (data.type === "google-auth-error") {
        setSigningIn(false);
        sessionStorage.removeItem(OAUTH_FLOW_KEY);
        setNativeError(data.error === "google_not_configured" ? "Google sign-in is not configured." : data.error ? `Sign-in failed: ${data.error}` : "Google sign-in failed. Please try again.");
      }
    }
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

  function handleGoogleClick() {
    if (isNativePlatform()) { handleNativeGoogleSignIn(); return; }
    sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
    window.location.href = `${API_BASE}/auth/google`;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError(null); setFormLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body: any = { email: formEmail, password: formPassword };
      if (mode === "register") body.name = formName;
      if (mode === "signin") body.rememberMe = rememberMe;
      const res = await fetch(resolveUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders("POST") },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.message ?? "Something went wrong."); return; }
      sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
      window.location.href = "/";
    } catch { setFormError("Network error. Please try again."); }
    finally { setFormLoading(false); }
  }

  function switchMode(next: AuthMode) {
    setMode(next); setFormError(null);
    setFormName(""); setFormEmail(""); setFormPassword("");
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault(); setForgotError(null); setForgotLoading(true);
    try {
      const res = await fetch(resolveUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders("POST") },
        body: JSON.stringify({ email: forgotEmail }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { setForgotError(data.message ?? "Something went wrong."); return; }
      setForgotSuccess(true);
    } catch { setForgotError("Network error. Please try again."); }
    finally { setForgotLoading(false); }
  }

  function openForgot() { setShowForgot(true); setForgotEmail(formEmail); setForgotSuccess(false); setForgotError(null); }
  function closeForgot() { setShowForgot(false); setForgotSuccess(false); setForgotError(null); setForgotEmail(""); }
  function openPanel(m: AuthMode = "signin") { setMode(m); setFormError(null); setShowLoginPanel(true); }

  if (isLoading || signingIn) return null;

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14, outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    background: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
    border: `1.5px solid ${isDark ? "rgba(20,184,232,0.15)" : "rgba(0,0,0,0.10)"}`,
    color: isDark ? "rgba(255,255,255,0.92)" : "#1a1a1a",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN FORM
  // ─────────────────────────────────────────────────────────────────────────
  const loginForm = (
    <div style={{ width: "100%", maxWidth: 400 }}>
      <style>{`
        @keyframes rise  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin  { to{transform:rotate(360deg)} }
        @keyframes slide-in-right { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes sr-in { from{opacity:0;transform:translateY(36px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sr-in-left { from{opacity:0;transform:translateX(-36px)} to{opacity:1;transform:translateX(0)} }
        @keyframes sr-in-right { from{opacity:0;transform:translateX(36px)} to{opacity:1;transform:translateX(0)} }
        @keyframes sr-scale { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 20px rgba(20,184,232,0.25)} 50%{box-shadow:0 0 40px rgba(20,184,232,0.5)} }
        @keyframes float-slow { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        @keyframes count-bar  { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes pulse-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.75)} }
        @keyframes shimmer    { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes border-glow { 0%,100%{border-color:rgba(20,184,232,0.15)} 50%{border-color:rgba(56,217,245,0.4)} }

        .rise  { animation:rise 0.45s cubic-bezier(0.16,1,0.3,1) both }
        .d1{ animation-delay:0.03s } .d2{ animation-delay:0.10s } .d3{ animation-delay:0.17s } .d4{ animation-delay:0.24s }

        /* Scroll-reveal base state */
        .sr { opacity:0; transform:translateY(36px); transition:opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1); }
        .sr.sr-left  { transform:translateX(-36px) }
        .sr.sr-right { transform:translateX(36px) }
        .sr.sr-scale { transform:scale(0.93) }
        .sr.sr-visible { opacity:1!important; transform:none!important; }
        .sr-d1 { transition-delay:0.05s } .sr-d2 { transition-delay:0.12s } .sr-d3 { transition-delay:0.19s }
        .sr-d4 { transition-delay:0.26s } .sr-d5 { transition-delay:0.33s } .sr-d6 { transition-delay:0.40s }
        .sr-d7 { transition-delay:0.47s } .sr-d8 { transition-delay:0.54s } .sr-d9 { transition-delay:0.61s }
        .sr-d10{ transition-delay:0.68s } .sr-d11{ transition-delay:0.75s } .sr-d12{ transition-delay:0.82s }

        .btn-blue {
          width:100%;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;
          cursor:pointer;border:none;font-family:inherit;
          background:linear-gradient(135deg,#14b8e8 0%,#0284c7 100%);
          color:#fff;box-shadow:0 4px 18px rgba(20,184,232,0.35);
          transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),opacity 0.15s,box-shadow 0.2s;
        }
        .btn-blue:hover:not(:disabled) { transform:translateY(-2px) scale(1.01); box-shadow:0 8px 28px rgba(20,184,232,0.5) }
        .btn-blue:active:not(:disabled){ transform:translateY(0) scale(0.98) }
        .btn-blue:disabled { opacity:0.55;cursor:not-allowed }

        .btn-social {
          display:flex;align-items:center;gap:12px;width:100%;padding:12px 18px;border-radius:12px;
          font-size:14px;font-weight:600;cursor:pointer;border:none;background:none;font-family:inherit;
          transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
          -webkit-tap-highlight-color:transparent;
        }
        .btn-social:hover  { transform:translateY(-2px) }
        .btn-social:active { transform:scale(0.97) }
        .btn-social:disabled { opacity:0.6;cursor:not-allowed;transform:none }

        .finput:focus {
          border-color:rgba(20,184,232,0.55)!important;
          box-shadow:0 0 0 3px rgba(20,184,232,0.13)!important;
        }

        /* Landing page nav link */
        .nav-link {
          color:rgba(255,255,255,0.52);font-size:13.5px;font-weight:500;
          text-decoration:none;transition:color 0.18s;cursor:pointer;
          background:none;border:none;font-family:inherit;padding:0;position:relative;
        }
        .nav-link::after {
          content:'';position:absolute;bottom:-3px;left:0;right:0;height:1.5px;
          background:linear-gradient(90deg,#14b8e8,#38d9f5);
          transform:scaleX(0);transform-origin:left;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .nav-link:hover { color:rgba(255,255,255,0.95) }
        .nav-link:hover::after { transform:scaleX(1) }

        /* Feature cards */
        .fcard {
          transition:border-color 0.25s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s;
          cursor:default;
        }
        .fcard:hover {
          border-color:rgba(20,184,232,0.40)!important;
          transform:translateY(-5px) scale(1.01)!important;
          box-shadow:0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(20,184,232,0.15)!important;
        }
        .fcard .fcard-icon {
          transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
        }
        .fcard:hover .fcard-icon { transform:scale(1.2) rotate(-5deg) }

        /* Header login btn */
        .hdr-login {
          padding:8px 18px;border-radius:10px;font-size:13.5px;font-weight:600;
          background:transparent;border:1px solid rgba(20,184,232,0.28);color:#38d9f5;
          cursor:pointer;font-family:inherit;
          transition:background 0.18s, border-color 0.18s, transform 0.18s;
        }
        .hdr-login:hover { background:rgba(20,184,232,0.10);border-color:rgba(56,217,245,0.5);transform:translateY(-1px) }

        .hdr-cta {
          padding:8px 20px;border-radius:10px;font-size:13.5px;font-weight:700;
          background:linear-gradient(135deg,#14b8e8,#0284c7);border:none;color:#fff;
          cursor:pointer;font-family:inherit;
          box-shadow:0 3px 14px rgba(20,184,232,0.35);
          transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
        }
        .hdr-cta:hover { transform:translateY(-2px) scale(1.03); box-shadow:0 6px 22px rgba(20,184,232,0.50) }
        .hdr-cta:active { transform:scale(0.97) }

        /* Hero CTA buttons */
        .hero-primary {
          padding:14px 32px;border-radius:13px;font-size:15.5px;font-weight:800;
          background:linear-gradient(135deg,#14b8e8,#0284c7);border:none;color:#fff;
          cursor:pointer;font-family:inherit;
          box-shadow:0 5px 24px rgba(20,184,232,0.40);
          transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s;
          animation:glow-pulse 3s ease-in-out infinite;
        }
        .hero-primary:hover { transform:translateY(-3px) scale(1.03); box-shadow:0 10px 36px rgba(20,184,232,0.55); animation:none }
        .hero-primary:active { transform:scale(0.97); animation:none }

        .hero-secondary {
          padding:14px 26px;border-radius:13px;font-size:15.5px;font-weight:600;
          background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:rgba(255,255,255,0.85);
          cursor:pointer;font-family:inherit;
          transition:background 0.18s, transform 0.18s, border-color 0.18s;
        }
        .hero-secondary:hover { background:rgba(255,255,255,0.11);border-color:rgba(255,255,255,0.25);transform:translateY(-2px) }

        /* Section CTA */
        .cta-primary {
          padding:15px 40px;border-radius:14px;font-size:16px;font-weight:800;
          background:linear-gradient(135deg,#14b8e8,#0284c7);border:none;color:#fff;
          cursor:pointer;font-family:inherit;
          box-shadow:0 6px 28px rgba(20,184,232,0.40);
          transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s;
        }
        .cta-primary:hover { transform:translateY(-3px) scale(1.03); box-shadow:0 12px 40px rgba(20,184,232,0.55) }

        /* Security item hover */
        .sec-item {
          transition:background 0.2s, border-color 0.2s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
          cursor:default;
        }
        .sec-item:hover {
          background:rgba(20,184,232,0.06)!important;
          border-color:rgba(20,184,232,0.28)!important;
          transform:translateX(4px);
        }

        /* Pricing card hover */
        .price-card {
          transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s;
        }
        .price-card:hover { transform:translateY(-6px); box-shadow:0 24px 64px rgba(0,0,0,0.6) }

        /* Float animation for mockup */
        .float-mockup { animation:float-slow 7s ease-in-out infinite }

        /* Gradient text shimmer for stat numbers */
        .stat-num {
          background:linear-gradient(90deg,#38d9f5,#14b8e8,#38d9f5);
          background-size:200% auto;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
        }
        .stat-num.visible { animation:shimmer 3s linear infinite }

        /* Scroll-section anchor offset */
        .scroll-section { scroll-margin-top:72px }

        /* Pulse dot */
        .pdot { animation:pulse-dot 2.2s ease-in-out infinite }

        /* Bar chart bars on hover */
        .dash-bar { transition:height 0.3s, opacity 0.3s }
      `}</style>

      {/* Logo */}
      <div className="rise d1" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${BLUE},${BLUE2})`, boxShadow: `0 4px 14px rgba(20,184,232,0.35)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>A</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", color: isDark ? "rgba(56,217,245,0.8)" : "rgba(2,132,199,0.8)" }}>ArtixPOS</span>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em", color: isDark ? "#fff" : "#0c1a26", margin: "0 0 6px" }}>
          {mode === "register" ? t("login.createAccount") : t("login.welcomeBack")}
        </h2>
        <p style={{ fontSize: 13.5, color: isDark ? "rgba(255,255,255,0.48)" : "rgba(12,26,38,0.52)", margin: 0 }}>
          {mode === "register" ? t("login.createSubtitle") : t("login.signInSubtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="rise d1" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 11, marginBottom: 20, background: isDark ? "rgba(20,184,232,0.07)" : "rgba(0,0,0,0.05)" }}>
        {(["signin", "register"] as AuthMode[]).map(m => (
          <button key={m} onClick={() => switchMode(m)} data-testid={`tab-${m}`} style={{
            flex: 1, padding: "8px 0", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none",
            cursor: "pointer", fontFamily: "inherit",
            transition: "background 0.2s,color 0.2s,box-shadow 0.2s",
            background: mode === m ? (isDark ? "rgba(20,184,232,0.2)" : "#fff") : "transparent",
            color: mode === m ? (isDark ? NEON : BLUE2) : (isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)"),
            boxShadow: mode === m ? (isDark ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.08)") : "none",
          }}>
            {m === "signin" ? t("login.signIn") : t("login.createAccount")}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {reason === "banned" && <div className="rise d1" style={{ padding: "11px 14px", borderRadius: 10, fontSize: 13, marginBottom: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <div style={{ fontWeight: 700, color: "#f87171", marginBottom: 3 }}>Account Suspended</div>
        <div style={{ color: "rgba(248,113,113,0.85)", lineHeight: 1.55 }}>Your account has been suspended for violating our Terms of Service.</div>
      </div>}
      {hasPendingInvite && !error && !reason && <div className="rise d1" style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, textAlign: "center", marginBottom: 14, background: "rgba(20,184,232,0.10)", border: `1px solid rgba(56,217,245,0.25)`, color: NEON }}>
        You've been invited to join a team. Sign in to accept.
      </div>}
      {error && <div className="rise d1" style={{ padding: "11px 14px", borderRadius: 10, fontSize: 13, marginBottom: 14, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", wordBreak: "break-word" }}>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>
          {error === "state_mismatch" ? "Sign-in expired — please try again." : error === "google_not_configured" ? "Google sign-in is not configured." : "Sign-in failed"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{error === "state_mismatch" ? "Click 'Continue with Google' again." : detail ?? `Error code: ${error}`}</div>
      </div>}
      {nativeError && <div className="rise d1" style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, textAlign: "center", marginBottom: 14, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>{nativeError}</div>}

      {/* Google */}
      <div className="rise d2">
        <button type="button" className="btn-social" data-testid="button-google-signin" onClick={handleGoogleClick} disabled={signingIn}
          style={isDark ? { background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(20,184,232,0.15)", color: "rgba(255,255,255,0.88)", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }
            : { background: "#fff", border: "1.5px solid rgba(0,0,0,0.09)", color: "#1a1a1a", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          {signingIn
            ? <div style={{ width: 20, height: 20, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
            : <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>}
          <span style={{ flex: 1, textAlign: "center" }}>{signingIn ? t("login.signingInGoogle") : t("login.continueWithGoogle")}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="rise d2" style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(20,184,232,0.10)" : "rgba(0,0,0,0.08)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.30)", whiteSpace: "nowrap" }}>
          {mode === "register" ? t("login.orCreateEmail") : t("login.orSignInEmail")}
        </span>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(20,184,232,0.10)" : "rgba(0,0,0,0.08)" }} />
      </div>

      {/* Form */}
      <form onSubmit={handleEmailSubmit} className="rise d3" style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {mode === "register" && <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.46)", display: "block", marginBottom: 5 }}>{t("login.fullName")}</label>
          <input type="text" placeholder="Jane Smith" value={formName} onChange={e => setFormName(e.target.value)} required data-testid="input-name" className="finput" style={inputBase} autoComplete="name" />
        </div>}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.46)", display: "block", marginBottom: 5 }}>{t("login.emailAddress")}</label>
          <input type="email" placeholder="Email" value={formEmail} onChange={e => setFormEmail(e.target.value)} required data-testid="input-email" className="finput" style={inputBase} autoComplete="email" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.46)", display: "block", marginBottom: 5 }}>
            Password {mode === "register" && <span style={{ fontWeight: 400, opacity: 0.6 }}>(min. 8 characters)</span>}
          </label>
          <div style={{ position: "relative" }}>
            <input type={showPassword ? "text" : "password"} placeholder={mode === "register" ? "Create a password" : "Password"} value={formPassword} onChange={e => setFormPassword(e.target.value)} required minLength={mode === "register" ? 8 : undefined} data-testid="input-password" className="finput" style={{ ...inputBase, paddingRight: 44 }} autoComplete={mode === "register" ? "new-password" : "current-password"} />
            <button type="button" onClick={() => setShowPassword(v => !v)} data-testid="button-toggle-password"
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)", display: "flex", alignItems: "center", transition: "color 0.15s" }}>
              {showPassword
                ? <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>
        </div>
        {mode === "signin" && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -3 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
            <div onClick={() => setRememberMe(v => !v)} data-testid="checkbox-remember-me"
              style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: `1.5px solid ${rememberMe ? BLUE : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`, background: rememberMe ? BLUE : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s,border-color 0.2s" }}>
              {rememberMe && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.46)" }}>{t("login.rememberDevice")}</span>
          </label>
          <button type="button" onClick={openForgot} data-testid="button-forgot-password"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: isDark ? "rgba(56,217,245,0.8)" : BLUE2, padding: 0, transition: "color 0.15s" }}>
            {t("login.forgotPassword")}
          </button>
        </div>}
        {formError && <div style={{ padding: "10px 13px", borderRadius: 10, fontSize: 12.5, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }} data-testid="text-form-error">{formError}</div>}
        <button type="submit" disabled={formLoading} data-testid="button-submit" className="btn-blue" style={{ marginTop: 3 }}>
          {formLoading ? (mode === "register" ? t("login.creatingAccount") : t("login.signingIn")) : (mode === "register" ? t("login.createAccount") : t("login.signIn"))}
        </button>
      </form>

      <p className="rise d4" style={{ marginTop: 18, fontSize: 11.5, textAlign: "center", color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.35)", lineHeight: 1.5 }}>
        {t("login.noCC")}
      </p>

      {isNativePlatform() && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <button onClick={() => { refreshDebug(); setShowDebug(v => !v); }}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 7, border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`, background: "transparent", color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)", cursor: "pointer" }}>
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MINI DASHBOARD MOCKUP
  // ─────────────────────────────────────────────────────────────────────────
  const bars = [40,65,50,80,55,92,68,78,50,100,72,88];
  const dashMockup = (
    <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(20,184,232,0.22)", background: "rgba(10,18,32,0.96)", boxShadow: "0 32px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(20,184,232,0.07)", backdropFilter: "blur(20px)" }}>
      <div style={{ padding: "10px 16px", background: "rgba(20,184,232,0.06)", borderBottom: "1px solid rgba(20,184,232,0.10)", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(239,68,68,0.55)" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(251,191,36,0.55)" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(34,197,94,0.45)" }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontWeight: 500 }}>Dashboard · ArtixPOS</span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
          {[{ l: "Today's Sales", v: "₱ 24,850", d: "+12%", c: NEON }, { l: "Orders", v: "137", d: "+8%", c: "#34d399" }, { l: "Active Staff", v: "9 / 12", d: "3 available", c: "#a78bfa" }].map((s, i) => (
            <div key={i} style={{ padding: "10px 11px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", transition: "background 0.2s" }}>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{s.v}</div>
              <div style={{ fontSize: 9, color: s.c, fontWeight: 700 }}>{s.d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 34, marginBottom: 12 }}>
          {bars.map((h, i) => (
            <div key={i} className="dash-bar" style={{ flex: 1, borderRadius: 3, height: `${h}%`, background: `rgba(20,184,232,${0.15 + (h / 100) * 0.55})` }} />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[{ l: "POS", v: "Live", c: NEON }, { l: "Offline", v: "Ready", c: "#34d399" }, { l: "AI", v: "Active", c: "#a78bfa" }, { l: "2 Branches", v: "Synced", c: "#f59e0b" }].map((p, i) => (
            <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", transition: "background 0.2s" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: p.c, boxShadow: `0 0 6px ${p.c}` }} />
              <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{p.l}</span>
              <span style={{ fontSize: 9.5, color: "#fff", fontWeight: 700 }}>{p.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // FULL LANDING PAGE
  // ─────────────────────────────────────────────────────────────────────────
  const landingPage = (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", fontFamily: "var(--font-sans, system-ui, sans-serif)", overflowX: "hidden" }}>

      {/* Background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", width: 1100, height: 1100, borderRadius: "50%", background: "radial-gradient(circle, rgba(20,184,232,0.08) 0%, transparent 58%)", top: -400, left: -300 }} />
        <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,217,245,0.05) 0%, transparent 60%)", bottom: -100, right: -150 }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(20,184,232,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(20,184,232,0.03) 1px,transparent 1px)", backgroundSize: "52px 52px" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${BLUE},transparent)` }} />
      </div>

      {/* ── STICKY HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid rgba(20,184,232,0.09)", backdropFilter: "blur(24px)", background: "rgba(12,20,32,0.82)", WebkitBackdropFilter: "blur(24px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", height: 64, display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 48 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${BLUE},${BLUE2})`, boxShadow: `0 0 20px rgba(20,184,232,0.45)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>A</span>
            </div>
            <span style={{ color: "#fff", fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>ArtixPOS</span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 32, flex: 1 }}>
            <a href="#features" className="nav-link">Features</a>
            <a href="#devices" className="nav-link">Devices</a>
            <a href="#security" className="nav-link">Security</a>
            <a href="#pricing" className="nav-link">Pricing</a>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => openPanel("signin")} className="hdr-login" data-testid="button-header-login">Log in</button>
            <button onClick={() => openPanel("register")} className="hdr-cta" data-testid="button-header-register">Get started free</button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "100px 32px 88px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
        <div>
          <div className="sr sr-left" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 20, background: "rgba(20,184,232,0.10)", border: "1px solid rgba(20,184,232,0.22)", marginBottom: 26 }}>
            <div className="pdot" style={{ width: 6, height: 6, borderRadius: "50%", background: NEON, boxShadow: `0 0 8px ${NEON}` }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: NEON, letterSpacing: "0.04em" }}>Full-stack POS · Works offline too</span>
          </div>
          <h1 className="sr sr-left sr-d1" style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.045em", margin: "0 0 22px" }}>
            Run your entire<br />
            <span style={{ background: `linear-gradient(90deg,${NEON} 0%,${BLUE} 35%,#38bdf8 70%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>business</span>{" "}from<br />one screen.
          </h1>
          <p className="sr sr-left sr-d2" style={{ fontSize: 16.5, lineHeight: 1.75, color: "rgba(255,255,255,0.48)", marginBottom: 38, maxWidth: 440 }}>
            ArtixPOS is a complete business platform — point of sale, inventory, staff, payroll, analytics, and a built-in AI assistant. Works on any device. Even without internet.
          </p>
          <div className="sr sr-left sr-d3" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button onClick={() => openPanel("register")} className="hero-primary">Start for free →</button>
            <button onClick={() => openPanel("signin")} className="hero-secondary">Log in</button>
          </div>
          <div className="sr sr-left sr-d4" style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 30 }}>
            {["No credit card required", "Free to start", "Works offline"].map((txt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><path d="M2 6.5l3 3 6-6" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{txt}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="sr sr-right sr-d1 float-mockup" style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: -60, background: "radial-gradient(ellipse at center, rgba(20,184,232,0.13) 0%, transparent 65%)", pointerEvents: "none" }} />
          {dashMockup}
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section ref={statsRef} style={{ position: "relative", zIndex: 1, borderTop: "1px solid rgba(20,184,232,0.07)", borderBottom: "1px solid rgba(20,184,232,0.07)", background: "rgba(255,255,255,0.015)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 24 }}>
          {[
            { n: "10+",        label: "Built-in modules" },
            { n: "Any device", label: "Phone · Tablet · Laptop" },
            { n: "100%",       label: "Works without internet" },
            { n: "Live",       label: "Real-time analytics" },
            { n: "Multi",      label: "Branch & team support" },
          ].map((s, i) => (
            <div key={i} className="sr sr-d1" style={{ textAlign: "center" }}>
              <div className={`stat-num${statsVisible ? " visible" : ""}`} style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>{s.n}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", fontWeight: 500, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="scroll-section" style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
        <div className="sr" style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>What's included</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.035em", margin: "0 0 14px", lineHeight: 1.1 }}>
            Everything your business needs.<br />
            <span style={{ color: "rgba(255,255,255,0.32)", fontWeight: 600, fontSize: 28 }}>Nothing it doesn't.</span>
          </h2>
          <p style={{ fontSize: 15.5, color: "rgba(255,255,255,0.40)", maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>
            These are the actual features in the system — not a roadmap, not a marketing checklist.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {[
            { icon: "🛒", title: "Point of Sale", desc: "Full POS with barcode scanning, cash/card/split payment, receipt printing, and pending orders. Keeps working without internet — sales sync when you're back online." },
            { icon: "📊", title: "Real-time Analytics", desc: "Live dashboard with today's revenue, top products, staff performance, and hourly trends. Export to Excel or PDF. Data updates the instant a sale is made." },
            { icon: "🧠", title: "AI Business Assistant", desc: "Ask the built-in AI about your own data — \"What sold most this week?\" or \"Which branch is underperforming?\" Powered by fast AI with automatic fallback." },
            { icon: "🏢", title: "Multi-branch Management", desc: "Run multiple locations under one account. Assign staff to branches, move stock between them, and see combined or per-branch reports in one view." },
            { icon: "📦", title: "Inventory & Expiry Tracking", desc: "Track stock levels with automatic low-stock alerts. Expiry tracker flags items before they go bad. Full purchase order flow from supplier to shelf." },
            { icon: "👥", title: "Staff & Payroll", desc: "Time clock, shift scheduling, payroll periods, and payroll entries. Staff clock in from any device. Owners see labor cost vs. revenue in one place." },
            { icon: "📅", title: "Appointments & Rooms", desc: "Book service appointments, assign to staff and rooms, and check out directly from an appointment. Works for salons, clinics, spas, and more." },
            { icon: "🎁", title: "Loyalty & Memberships", desc: "Points-based loyalty with tiered rewards. Membership plans with recurring check-ins. Customers track their balance and redeem at checkout." },
            { icon: "🧾", title: "Tax Compliance & Audit Log", desc: "Built-in compliance reports with OR number tracking, VAT computation, and a full void/refund audit trail. Every transaction is logged and tamper-evident." },
            { icon: "💸", title: "Expenses & Suppliers", desc: "Log business expenses by category, attach notes, and track against revenue. Manage suppliers and purchase orders from the same screen." },
            { icon: "📶", title: "WiFi Voucher Management", desc: "Generate and sell timed internet vouchers directly from the POS. Built for cafes, hotels, and restaurants that offer paid WiFi to guests." },
            { icon: "🖨️", title: "Receipt & Kitchen Printing", desc: "Bluetooth, network, and USB printer support. Kitchen Display System routes orders to the kitchen in real time — no paper tickets needed." },
          ].map((f, i) => (
            <div key={i} className={`fcard sr sr-d${(i % 6) + 1}`} style={{ padding: "24px", borderRadius: 16, background: CARD, border: "1px solid rgba(20,184,232,0.11)" }}>
              <div className="fcard-icon" style={{ fontSize: 28, marginBottom: 13, display: "inline-block" }}>{f.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.40)", lineHeight: 1.72 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── DEVICES ── */}
      <section id="devices" className="scroll-section" style={{ position: "relative", zIndex: 1, background: "rgba(255,255,255,0.018)", borderTop: "1px solid rgba(20,184,232,0.07)", borderBottom: "1px solid rgba(20,184,232,0.07)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "88px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
          <div>
            <div className="sr sr-left" style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Works everywhere</div>
            <h2 className="sr sr-left sr-d1" style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 16px", lineHeight: 1.1 }}>
              Your team uses it on<br />whatever they have.
            </h2>
            <p className="sr sr-left sr-d2" style={{ fontSize: 15, color: "rgba(255,255,255,0.44)", lineHeight: 1.75, marginBottom: 32, maxWidth: 400 }}>
              Cashiers use a tablet at the counter. Managers check analytics on a laptop. Owners monitor sales on their phone. All synced, all real-time.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { icon: "📱", d: "Phone", sub: "Full POS, approvals, and push notifications" },
                { icon: "📟", d: "Tablet", sub: "Best cashier screen — fast, touch-optimized" },
                { icon: "💻", d: "Laptop", sub: "Analytics, management, and back-office" },
                { icon: "🖥️", d: "Desktop", sub: "Kitchen display, kiosk mode, multi-window" },
              ].map((dev, i) => (
                <div key={i} className={`sr sr-left sr-d${i + 2}`} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: "rgba(20,184,232,0.09)", border: "1px solid rgba(20,184,232,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, transition: "background 0.2s, transform 0.2s" }}>{dev.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{dev.d}</div>
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>{dev.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Offline POS", desc: "Sells even with no connection. Auto-syncs when you're back online.", color: NEON },
              { label: "Install as App", desc: "Add to home screen — behaves like a native app, no app store.", color: "#34d399" },
              { label: "Wireless Printing", desc: "Print to Bluetooth or network thermal printers from any device.", color: "#a78bfa" },
              { label: "QR Payments", desc: "Show payment QR codes at checkout for bank transfer and e-wallets.", color: "#f59e0b" },
            ].map((c, i) => (
              <div key={i} className={`sr sr-right sr-d${i + 1}`} style={{ padding: "20px", borderRadius: 14, background: CARD, border: "1px solid rgba(20,184,232,0.11)", transition: "border-color 0.2s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(20,184,232,0.35)"; (e.currentTarget as HTMLElement).style.transform = "scale(1.03)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(20,184,232,0.11)"; (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, boxShadow: `0 0 10px ${c.color}`, marginBottom: 11 }} />
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 7 }}>{c.label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.65 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY — only what genuinely stands out ── */}
      <section id="security" className="scroll-section" style={{ position: "relative", zIndex: 1, borderTop: "1px solid rgba(20,184,232,0.07)", borderBottom: "1px solid rgba(20,184,232,0.07)" }}>
        {/* faint green ambient */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, rgba(52,211,153,0.04) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "96px 32px" }}>
          <div className="sr" style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Security</div>
            <h2 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.04em", margin: "0 0 14px", lineHeight: 1.06 }}>
              Two things we do that<br />
              <span style={{ background: "linear-gradient(90deg,#34d399,#38d9f5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>most systems don't.</span>
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.40)", maxWidth: 460, margin: "0 auto", lineHeight: 1.72 }}>
              Basic login protection and HTTPS are table stakes — we don't count those. Here's what actually sets ArtixPOS apart.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            {/* Card 1 — Structural data isolation */}
            <div className="sr sr-left sr-d1" style={{ borderRadius: 22, overflow: "hidden", border: "1px solid rgba(52,211,153,0.22)", background: "rgba(52,211,153,0.04)", transition: "border-color 0.25s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(52,211,153,0.50)"; el.style.transform = "translateY(-5px)"; el.style.boxShadow = "0 20px 60px rgba(52,211,153,0.10)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(52,211,153,0.22)"; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}>
              {/* accent bar */}
              <div style={{ height: 3, background: "linear-gradient(90deg, #34d399, #10b981)" }} />
              <div style={{ padding: "36px 36px 40px" }}>
                <div style={{ fontSize: 40, marginBottom: 20 }}>🏛️</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 14, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                  Your data is structurally sealed — not just filtered.
                </div>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", lineHeight: 1.78, marginBottom: 24, margin: "0 0 24px" }}>
                  Most multi-tenant software separates businesses by adding a filter to every database query. That works — until a developer forgets the filter, or a bug slips through.
                </p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.68)", lineHeight: 1.78, margin: "0 0 28px" }}>
                  ArtixPOS enforces isolation at the database engine level. Each business's data lives in its own sealed partition. Even if the application code had a critical bug, the database itself would reject any cross-business query. One business cannot see another's transactions, customers, or staff — period.
                </p>
                <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.20)" }}>
                  <div style={{ fontSize: 12.5, color: "#34d399", fontWeight: 700, marginBottom: 4 }}>Why this matters</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>If you share a POS platform with other businesses — as every SaaS does — you want the wall between you and them to be a vault, not a curtain.</div>
                </div>
              </div>
            </div>

            {/* Card 2 — Permanent audit trail */}
            <div className="sr sr-right sr-d1" style={{ borderRadius: 22, overflow: "hidden", border: "1px solid rgba(244,114,182,0.22)", background: "rgba(244,114,182,0.03)", transition: "border-color 0.25s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(244,114,182,0.50)"; el.style.transform = "translateY(-5px)"; el.style.boxShadow = "0 20px 60px rgba(244,114,182,0.08)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(244,114,182,0.22)"; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}>
              <div style={{ height: 3, background: "linear-gradient(90deg, #f472b6, #e879f9)" }} />
              <div style={{ padding: "36px 36px 40px" }}>
                <div style={{ fontSize: 40, marginBottom: 20 }}>📋</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 14, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                  Nothing can be quietly undone. Every action leaves a permanent record.
                </div>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", lineHeight: 1.78, marginBottom: 24, margin: "0 0 24px" }}>
                  A manager voids a transaction. A cashier applies a discount that wasn't authorized. A staff account gets promoted. In most POS systems, these things happen and disappear.
                </p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.68)", lineHeight: 1.78, margin: "0 0 28px" }}>
                  In ArtixPOS, every void, refund, discount, permission change, and login event is permanently logged with a timestamp and exactly who did it. Records cannot be deleted — not by staff, not by managers, and not by us. The audit trail is append-only by design.
                </p>
                <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(244,114,182,0.07)", border: "1px solid rgba(244,114,182,0.20)" }}>
                  <div style={{ fontSize: 12.5, color: "#f472b6", fontWeight: 700, marginBottom: 4 }}>Why this matters</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>When you have staff handling cash and transactions, accountability is everything. This gives you a complete, unalterable history of your business — not just today, but forever.</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="scroll-section" style={{ position: "relative", zIndex: 1, background: "rgba(255,255,255,0.018)", borderTop: "1px solid rgba(20,184,232,0.07)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "88px 32px", textAlign: "center" }}>
          <div className="sr" style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Simple pricing</div>
          <h2 className="sr sr-d1" style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.035em", margin: "0 0 14px" }}>Start free. Grow when ready.</h2>
          <p className="sr sr-d2" style={{ fontSize: 15.5, color: "rgba(255,255,255,0.40)", maxWidth: 420, margin: "0 auto 52px", lineHeight: 1.7 }}>
            The core POS is free — sales, products, inventory, and analytics. Advanced features unlock on Pro.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, maxWidth: 720, margin: "0 auto" }}>
            <div className="price-card sr sr-left sr-d2" style={{ padding: "34px 30px", borderRadius: 20, background: CARD, border: "1px solid rgba(20,184,232,0.15)", textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.48)", marginBottom: 7 }}>FREE</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: "#fff", marginBottom: 5 }}>₱0 <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.38)" }}>/mo</span></div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)", marginBottom: 26 }}>No credit card. No expiry.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["Full POS", "Products & inventory", "Basic analytics", "Single branch", "Transaction history"].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l3 3 6-6" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.58)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => openPanel("register")} style={{ marginTop: 26, width: "100%", padding: "12px 0", borderRadius: 12, fontSize: 13.5, fontWeight: 700, background: "rgba(20,184,232,0.12)", border: "1px solid rgba(20,184,232,0.28)", color: NEON, cursor: "pointer", fontFamily: "inherit", transition: "background 0.18s" }}>
                Get started free
              </button>
            </div>
            <div className="price-card sr sr-right sr-d2" style={{ padding: "34px 30px", borderRadius: 20, background: "rgba(20,184,232,0.06)", border: `1.5px solid rgba(20,184,232,0.38)`, textAlign: "left", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 16, right: 16, padding: "3px 11px", borderRadius: 20, background: `linear-gradient(135deg,${BLUE},${BLUE2})`, fontSize: 10, fontWeight: 700, color: "#fff" }}>POPULAR</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NEON, marginBottom: 7 }}>PRO</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: "#fff", marginBottom: 5 }}>Contact <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.38)" }}>for pricing</span></div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)", marginBottom: 26 }}>Per branch · billed monthly.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["Everything in Free", "Multi-branch", "Staff & payroll", "AI assistant", "Appointments & rooms", "Loyalty & memberships", "WiFi vouchers", "Advanced analytics", "Priority support"].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l3 3 6-6" stroke={NEON} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => openPanel("register")} style={{ marginTop: 26, width: "100%", padding: "12px 0", borderRadius: 12, fontSize: 13.5, fontWeight: 700, background: `linear-gradient(135deg,${BLUE},${BLUE2})`, border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 18px rgba(20,184,232,0.35)", transition: "transform 0.18s, box-shadow 0.18s" }}>
                Start free, upgrade anytime
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FOOTER ── */}
      <section style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "88px 32px", borderTop: "1px solid rgba(20,184,232,0.07)" }}>
        <h2 className="sr" style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em", margin: "0 0 14px" }}>Ready to start?</h2>
        <p className="sr sr-d1" style={{ fontSize: 16, color: "rgba(255,255,255,0.40)", marginBottom: 36 }}>Takes less than 2 minutes. Your first sale is free.</p>
        <button onClick={() => openPanel("register")} className="cta-primary sr sr-scale sr-d2">Create your free account →</button>
        <div className="sr sr-d3" style={{ marginTop: 56, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 8, background: `linear-gradient(135deg,${BLUE},${BLUE2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>A</span>
          </div>
          <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>© 2025 ArtixPOS · Business Platform</span>
        </div>
      </section>

      {/* ── LOGIN PANEL (slide-over) ── */}
      {showLoginPanel && (
        <>
          <div onClick={() => setShowLoginPanel(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.70)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", cursor: "pointer" }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: "100%", maxWidth: 460, overflowY: "auto", background: DARK2, borderLeft: "1px solid rgba(20,184,232,0.15)", boxShadow: "-32px 0 100px rgba(0,0,0,0.75)", animation: "slide-in-right 0.35s cubic-bezier(0.16,1,0.3,1) both", display: "flex", flexDirection: "column" }}>
            <button onClick={() => setShowLoginPanel(false)} style={{ position: "absolute", top: 18, right: 18, width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, transition: "background 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "52px 44px" }}>
              {loginForm}
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // FORGOT PASSWORD MODAL
  // ─────────────────────────────────────────────────────────────────────────
  const forgotModal = showForgot ? (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.78)", backdropFilter: "blur(5px)", padding: "0 20px" }}>
      <div style={{ width: "100%", maxWidth: 420, borderRadius: 22, padding: "34px 30px", background: DARK2, border: "1px solid rgba(20,184,232,0.15)", boxShadow: "0 40px 120px rgba(0,0,0,0.9)" }}>
        {forgotSuccess ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px", background: "rgba(20,184,232,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="24" height="24" fill="none" stroke={NEON} strokeWidth="2.2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 5.29 5.29l1-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 15.5"/></svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: "#fff" }}>Check your email</h2>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.52)", margin: "0 0 24px" }}>If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent.</p>
            <button onClick={closeForgot} data-testid="button-back-to-signin" style={{ width: "100%", padding: "12px 0", borderRadius: 11, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", background: `linear-gradient(135deg,${BLUE},${BLUE2})`, color: "#fff" }}>Back to sign in</button>
          </div>
        ) : (
          <>
            <button onClick={closeForgot} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "rgba(255,255,255,0.38)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontFamily: "inherit", marginBottom: 20 }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Back
            </button>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 7px", color: "#fff" }}>Reset password</h2>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.48)", margin: "0 0 22px" }}>Enter your email and we'll send a reset link.</p>
            <form onSubmit={handleForgotSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, color: "rgba(255,255,255,0.48)" }}>Email address</label>
                <input type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required data-testid="input-forgot-email" className="finput" style={inputBase} autoComplete="email" />
              </div>
              {forgotError && <div style={{ padding: "10px 13px", borderRadius: 10, fontSize: 13, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>{forgotError}</div>}
              <button type="submit" disabled={forgotLoading} data-testid="button-send-reset" style={{ padding: "12px 0", borderRadius: 11, fontSize: 14, fontWeight: 700, border: "none", cursor: forgotLoading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: forgotLoading ? 0.7 : 1, background: `linear-gradient(135deg,${BLUE},${BLUE2})`, color: "#fff", boxShadow: "0 4px 18px rgba(20,184,232,0.30)" }}>
                {forgotLoading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // DEBUG PANEL
  // ─────────────────────────────────────────────────────────────────────────
  const debugPanel = (isNativePlatform() && showDebug) ? (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxHeight: "65vh", display: "flex", flexDirection: "column", background: "#060f18", borderTop: "1px solid rgba(20,184,232,0.2)", zIndex: 9999, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <span style={{ color: NEON, fontWeight: 700, fontSize: 12, letterSpacing: "0.05em" }}>ARTIXPOS DEBUG</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => { const text = debugEntries.map(e => `${e.ts} [${e.tag}] ${e.msg}`).join("\n"); navigator.clipboard?.writeText(text).then(() => alert("Logs copied!")); }} style={{ color: "#60a5fa", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 5, cursor: "pointer", fontSize: 10, padding: "2px 8px" }}>Copy</button>
          <button onClick={refreshDebug} style={{ color: "#94a3b8", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, cursor: "pointer", fontSize: 10, padding: "2px 8px" }}>Refresh</button>
          <button onClick={() => { clearDebugLogs(); setDebugEntries([]); }} style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 5, cursor: "pointer", fontSize: 10, padding: "2px 8px" }}>Clear</button>
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {debugEntries.length === 0
          ? <div style={{ color: "#475569", fontStyle: "italic", padding: "8px 12px" }}>No logs yet.</div>
          : debugEntries.slice().reverse().map((e, i) => (
            <div key={i} style={{ padding: "3px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 8 }}>
              <span style={{ color: "#475569", flexShrink: 0 }}>{e.ts}</span>
              <span style={{ color: NEON, flexShrink: 0 }}>[{e.tag}]</span>
              <span style={{ color: "#cbd5e1", wordBreak: "break-all" }}>{e.msg}</span>
            </div>
          ))}
      </div>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE CARD
  // ─────────────────────────────────────────────────────────────────────────
  const mobileCard = (
    <div className="md:hidden" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", background: isDark ? DARK : "#eef7fb" }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "32px 26px", borderRadius: 22, background: isDark ? "rgba(255,255,255,0.033)" : "rgba(255,255,255,0.90)", border: `1px solid ${isDark ? "rgba(20,184,232,0.12)" : "rgba(0,0,0,0.06)"}`, boxShadow: isDark ? "0 0 0 1px rgba(20,184,232,0.05), 0 32px 80px rgba(0,0,0,0.65)" : "0 8px 48px rgba(0,0,0,0.09)" }}>
        {loginForm}
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
