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
function isPluginAvailable(name: string): boolean {
  try { return (window as any).Capacitor?.isPluginAvailable?.(name) === true; } catch { return false; }
}

function diagnoseNativeError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("10:") || msg.includes("developer_error") || msg.includes("something went wrong"))
    return "Google error 10 (DEVELOPER_ERROR): The app's signing fingerprint (SHA-1) is not registered in Google Cloud Console.";
  if (msg.includes("7:") || msg.includes("network"))
    return "Google error 7: Network error — check your internet connection.";
  if (msg.includes("no id token") || msg.includes("idtoken"))
    return "Google sign-in returned no ID token. Ensure GOOGLE_CLIENT_ID is set.";
  return raw;
}

async function nativeGoogleSignIn(): Promise<string> {
  debugLog("google", "importing GoogleAuth plugin…");
  const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
  const { Capacitor } = await import("@capacitor/core");

  const webClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || "";
  const iosClientId = (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string) || webClientId;
  const platform = Capacitor.getPlatform();
  debugLog("google", `platform=${platform} webClientId=${webClientId ? "SET" : "MISSING"}`);

  const initOptions: Record<string, any> = {
    scopes: ["profile", "email"],
    grantOfflineAccess: true,
  };

  if (webClientId) initOptions.serverClientId = webClientId;

  if (platform === "ios" && iosClientId) {
    initOptions.clientId = iosClientId;
  } else if (webClientId) {
    initOptions.clientId = webClientId;
  }

  debugLog("google", `initialize options: clientId=${initOptions.clientId ? "SET" : "NONE"} serverClientId=${initOptions.serverClientId ? "SET" : "NONE"}`);
  await GoogleAuth.initialize(initOptions);

  let googleUser: any;
  try { googleUser = await GoogleAuth.signIn(); }
  catch (e: any) {
    const raw = e?.message ?? String(e);
    debugLog("google", `signIn raw error: ${raw}`);
    throw new Error(diagnoseNativeError(raw));
  }

  const idToken = googleUser?.authentication?.idToken;
  if (!idToken) throw new Error(diagnoseNativeError("no id token returned"));
  debugLog("google", "sending idToken to server…");
  const res = await apiRequest("POST", "/api/auth/google/native", { idToken });
  const data = await res.json();
  if (!data.token) throw new Error("Server did not return a session token");
  debugLog("google", "server auth OK ✓");
  return data.token;
}

function getIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const INVITE_STORAGE_KEY = "artixpos_pending_invite";
const OAUTH_FLOW_KEY = "artixpos_oauth_flow";
type AuthMode = "signin" | "register";

// ── Tiny animated stat card used in the device mockup ───────────────────────
function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "5px 11px", borderRadius: 20,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
      <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{value}</span>
    </div>
  );
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

  const oauthPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (oauthPollTimerRef.current !== null) clearInterval(oauthPollTimerRef.current);
  }, []);

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
    if (!isAuthenticated) {
      sessionStorage.removeItem("artix-logout-pending");
      return;
    }
    const logoutPending = sessionStorage.getItem("artix-logout-pending") === "1";
    if (logoutPending) {
      sessionStorage.removeItem("artix-logout-pending");
      (async () => {
        try {
          await fetch("/auth/logout", {
            method: "POST",
            credentials: "include",
            headers: getCsrfHeaders("POST"),
          });
        } catch { }
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

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
    fetch("/api/auth/config")
      .then(r => r.json())
      .then((cfg: { googleClientId?: string | null }) => {
        if (cfg.googleClientId) setGoogleClientId(cfg.googleClientId);
      })
      .catch(() => {});
  }, []);

  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");
  const detail = urlParams.get("detail");
  const reason = urlParams.get("reason");
  const hasStoredToken = !!localStorage.getItem(NATIVE_TOKEN_KEY);
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
      const userFromToken = decodeTokenUser(token);
      if (userFromToken) {
        queryClient.setQueryData(["auth-me"], userFromToken);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      }
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth-me" });
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const isUserCancel = msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("dismissed") || msg.toLowerCase().includes("12501");
      sessionStorage.removeItem(OAUTH_FLOW_KEY);
      if (!isUserCancel) setNativeError(msg.length < 120 ? msg : "Sign-in failed — tap 'Show debug' for details.");
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
        queryClient.invalidateQueries({ queryKey: ["auth-me"] });
        setSigningIn(false);
      } else if (data.type === "google-auth-error") {
        setSigningIn(false);
        sessionStorage.removeItem(OAUTH_FLOW_KEY);
        setNativeError(
          data.error === "google_not_configured"
            ? "Google sign-in is not configured on this server."
            : data.error
              ? `Sign-in failed: ${data.error}`
              : "Google sign-in failed. Please try again."
        );
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
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
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
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setFormLoading(false);
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next); setFormError(null);
    setFormName(""); setFormEmail(""); setFormPassword("");
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);
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
    } catch {
      setForgotError("Network error. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  function openForgot() {
    setShowForgot(true); setForgotEmail(formEmail);
    setForgotSuccess(false); setForgotError(null);
  }
  function closeForgot() {
    setShowForgot(false); setForgotSuccess(false);
    setForgotError(null); setForgotEmail("");
  }

  if (isLoading || signingIn) return null;

  // ── System sky-blue palette ────────────────────────────────────────────────
  const C = {
    primary:    "#14b8e8",
    primaryDim: "#0ea5e9",
    primaryGlow:"rgba(20,184,232,0.35)",
    neon:       "#38d9f5",
    neonGlow:   "rgba(56,217,245,0.25)",
    dark:       "#0C1420",
    darkCard:   "#0f1e2e",
    darkBorder: "rgba(20,184,232,0.12)",
    text:       "rgba(255,255,255,0.88)",
    textMuted:  "rgba(255,255,255,0.45)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    background: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
    border: `1.5px solid ${isDark ? "rgba(20,184,232,0.15)" : "rgba(0,0,0,0.10)"}`,
    color: isDark ? "rgba(255,255,255,0.92)" : "#1a1a1a",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  const formPanel = (
    <div style={{ width: "100%", maxWidth: 400 }}>
      <style>{`
        @keyframes rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .rise { animation: rise 0.55s cubic-bezier(0.16,1,0.3,1) both; }
        .d1 { animation-delay: 0.04s; }
        .d2 { animation-delay: 0.12s; }
        .d3 { animation-delay: 0.20s; }
        .d4 { animation-delay: 0.28s; }
        .btn-social {
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 600;
          text-decoration: none; transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s ease, opacity 0.18s ease;
          position: relative; overflow: hidden; cursor: pointer; border: none;
          background: none; font-family: inherit; -webkit-tap-highlight-color: transparent;
        }
        .btn-social:hover { transform: translateY(-1px); }
        .btn-social:active { transform: translateY(0) scale(0.98); }
        .btn-social:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-primary-blue {
          width: 100%; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 700;
          cursor: pointer; border: none; font-family: inherit;
          transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), opacity 0.18s ease, box-shadow 0.18s ease;
          -webkit-tap-highlight-color: transparent;
          background: linear-gradient(135deg, #14b8e8 0%, #0284c7 100%);
          color: #ffffff;
          box-shadow: 0 4px 18px rgba(20,184,232,0.35);
        }
        .btn-primary-blue:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(20,184,232,0.45); }
        .btn-primary-blue:active:not(:disabled) { transform: translateY(0) scale(0.98); }
        .btn-primary-blue:disabled { opacity: 0.55; cursor: not-allowed; }
        .form-input:focus {
          border-color: rgba(20,184,232,0.55) !important;
          box-shadow: 0 0 0 3px rgba(20,184,232,0.12) !important;
        }
        .tab-active-blue {
          background: ${isDark ? "rgba(20,184,232,0.2)" : "#ffffff"} !important;
          color: ${isDark ? "#38d9f5" : "#0284c7"} !important;
          box-shadow: ${isDark ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.08)"} !important;
        }
      `}</style>

      {/* Logo + heading */}
      <div className="rise d1" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #14b8e8 0%, #0284c7 100%)",
            boxShadow: "0 4px 14px rgba(20,184,232,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>A</span>
          </div>
          <span style={{
            fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
            color: isDark ? "rgba(56,217,245,0.8)" : "rgba(2,132,199,0.75)",
          }}>ArtixPOS</span>
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.025em",
          color: isDark ? "#ffffff" : "#0c1a26", margin: 0, marginBottom: 8,
        }}>
          {mode === "register" ? t("login.createAccount") : t("login.welcomeBack")}
        </h1>
        <p style={{
          fontSize: 14, lineHeight: 1.6,
          color: isDark ? "rgba(255,255,255,0.52)" : "rgba(12,26,38,0.55)",
          margin: 0,
        }}>
          {mode === "register" ? t("login.createSubtitle") : t("login.signInSubtitle")}
        </p>
      </div>

      {/* Mode tabs */}
      <div className="rise d1" style={{
        display: "flex", gap: 3, padding: 3, borderRadius: 11, marginBottom: 22,
        background: isDark ? "rgba(20,184,232,0.07)" : "rgba(0,0,0,0.05)",
      }}>
        {(["signin", "register"] as AuthMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            data-testid={`tab-${m}`}
            className={mode === m ? "tab-active-blue" : ""}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.18s, color 0.18s, box-shadow 0.18s",
              background: "transparent",
              color: mode === m
                ? isDark ? "#38d9f5" : "#0284c7"
                : isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)",
            }}
          >
            {m === "signin" ? t("login.signIn") : t("login.createAccount")}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {reason === "banned" && (
        <div className="rise d1" style={{
          padding: "12px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16,
          background: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.06)",
          border: `1px solid ${isDark ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.2)"}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: isDark ? "#f87171" : "#b91c1c", marginBottom: 4 }}>Account Suspended</div>
          <div style={{ color: isDark ? "rgba(248,113,113,0.85)" : "#dc2626", lineHeight: 1.55 }}>
            Your account has been suspended for violating our Terms of Service.
          </div>
        </div>
      )}
      {hasPendingInvite && !error && !reason && (
        <div className="rise d1" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13, textAlign: "center", marginBottom: 16,
          background: isDark ? "rgba(20,184,232,0.10)" : "rgba(20,184,232,0.07)",
          border: `1px solid ${isDark ? "rgba(56,217,245,0.25)" : "rgba(20,184,232,0.2)"}`,
          color: isDark ? "#38d9f5" : "#0284c7",
        }}>
          You've been invited to join a team. Sign in to accept.
        </div>
      )}
      {error && (
        <div className="rise d1" style={{
          padding: "12px 14px", borderRadius: 10, fontSize: 13, textAlign: "left", marginBottom: 16,
          background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
          border: `1px solid ${isDark ? "rgba(239,68,68,0.4)" : "rgba(239,68,68,0.3)"}`,
          color: isDark ? "#f87171" : "#dc2626",
          wordBreak: "break-word",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {error === "state_mismatch" ? "Sign-in expired — please try again."
              : error === "google_not_configured" ? "Google sign-in is not configured."
              : error === "server_unavailable" ? "Server error"
              : `Sign-in failed`}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {error === "state_mismatch"
              ? "The sign-in session expired. Click 'Continue with Google' again."
              : detail
              ? detail
              : `Error code: ${error}`}
          </div>
          {detail && error !== "server_unavailable" && (
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.65 }}>Code: {error}</div>
          )}
        </div>
      )}
      {nativeError && (
        <div className="rise d1" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13, textAlign: "center", marginBottom: 16,
          background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
          border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.18)"}`,
          color: isDark ? "#f87171" : "#dc2626",
        }}>
          {nativeError}
        </div>
      )}

      {/* Google button */}
      <div className="rise d2">
        <button
          type="button"
          className="btn-social"
          data-testid="button-google-signin"
          onClick={handleGoogleClick}
          disabled={signingIn}
          style={isDark ? {
            background: "rgba(255,255,255,0.07)",
            border: "1.5px solid rgba(20,184,232,0.15)",
            color: "rgba(255,255,255,0.88)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
          } : {
            background: "#ffffff",
            border: "1.5px solid rgba(0,0,0,0.09)",
            color: "#1a1a1a",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          {signingIn ? (
            <div style={{ width: 20, height: 20, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span style={{ flex: 1, textAlign: "center" }}>
            {signingIn ? t("login.signingInGoogle") : t("login.continueWithGoogle")}
          </span>
        </button>
      </div>

      {/* Divider */}
      <div className="rise d2" style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(20,184,232,0.12)" : "rgba(0,0,0,0.08)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)", whiteSpace: "nowrap" }}>
          {mode === "register" ? t("login.orCreateEmail") : t("login.orSignInEmail")}
        </span>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(20,184,232,0.12)" : "rgba(0,0,0,0.08)" }} />
      </div>

      {/* Email form */}
      <form onSubmit={handleEmailSubmit} className="rise d3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "register" && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)", display: "block", marginBottom: 5 }}>
              {t("login.fullName")}
            </label>
            <input type="text" placeholder="Jane Smith" value={formName} onChange={e => setFormName(e.target.value)}
              required data-testid="input-name" className="form-input" style={inputStyle} />
          </div>
        )}

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)", display: "block", marginBottom: 5 }}>
            {t("login.emailAddress")}
          </label>
          <input type="email" placeholder="Email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
            required data-testid="input-email" className="form-input" style={inputStyle} autoComplete="email" />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)", display: "block", marginBottom: 5 }}>
            Password {mode === "register" && <span style={{ fontWeight: 400, opacity: 0.65 }}>(min. 8 characters)</span>}
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={mode === "register" ? "Create a password" : "Password"}
              value={formPassword} onChange={e => setFormPassword(e.target.value)}
              required minLength={mode === "register" ? 8 : undefined}
              data-testid="input-password" className="form-input"
              style={{ ...inputStyle, paddingRight: 44 }}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} data-testid="button-toggle-password"
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.32)", display: "flex", alignItems: "center" }}
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {mode === "signin" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <div
                onClick={() => setRememberMe(v => !v)}
                data-testid="checkbox-remember-me"
                style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                  border: `1.5px solid ${rememberMe ? C.primary : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
                  background: rememberMe ? C.primary : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {rememberMe && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)" }}>
                {t("login.rememberDevice")}
              </span>
            </label>
            <button type="button" onClick={openForgot} data-testid="button-forgot-password"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: isDark ? "rgba(56,217,245,0.8)" : "rgba(2,132,199,0.8)", padding: 0 }}>
              {t("login.forgotPassword")}
            </button>
          </div>
        )}

        {formError && (
          <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13,
            background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
            border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.18)"}`,
            color: isDark ? "#f87171" : "#dc2626" }} data-testid="text-form-error">
            {formError}
          </div>
        )}

        <button type="submit" disabled={formLoading} data-testid="button-submit" className="btn-primary-blue"
          style={{ marginTop: 4 }}>
          {formLoading
            ? (mode === "register" ? t("login.creatingAccount") : t("login.signingIn"))
            : (mode === "register" ? t("login.createAccount") : t("login.signIn"))}
        </button>
      </form>

      <p className="rise d4" style={{ marginTop: 20, fontSize: 12, textAlign: "center", color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)", lineHeight: 1.5 }}>
        {t("login.noCC")}
      </p>

      {isNativePlatform() && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button onClick={() => { refreshDebug(); setShowDebug(v => !v); }}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 8, border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`, background: "transparent", color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.32)", cursor: "pointer" }}>
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>
      )}
    </div>
  );

  // ── Left hero panel ────────────────────────────────────────────────────────
  const heroPanel = (
    <div
      className="w-[52%] flex-shrink-0 flex flex-col relative overflow-hidden"
      style={{ background: C.dark }}
    >
      <style>{`
        @keyframes float-a { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-18px) translateX(10px)} }
        @keyframes float-b { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(14px) translateX(-8px)} }
        @keyframes float-c { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-10px) translateX(-12px)} }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }
        @keyframes scan-line {
          0%{top:-2px;opacity:0} 5%{opacity:1} 95%{opacity:1} 100%{top:100%;opacity:0}
        }
        .hero-orb-a { animation: float-a 18s ease-in-out infinite; }
        .hero-orb-b { animation: float-b 22s ease-in-out infinite; }
        .hero-orb-c { animation: float-c 15s ease-in-out infinite; }
        .pulse-dot { animation: pulse-dot 2.4s ease-in-out infinite; }
        @keyframes slide-up-stagger {
          from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)}
        }
        .hero-in { animation: slide-up-stagger 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .hi-1{animation-delay:0.05s} .hi-2{animation-delay:0.15s} .hi-3{animation-delay:0.25s}
        .hi-4{animation-delay:0.35s} .hi-5{animation-delay:0.45s} .hi-6{animation-delay:0.55s}
      `}</style>

      {/* Background ambient glows */}
      <div className="hero-orb-a" style={{ position:"absolute", width:700, height:700, borderRadius:"50%", background:"radial-gradient(circle, rgba(20,184,232,0.10) 0%, transparent 60%)", top:"-180px", left:"-160px", pointerEvents:"none" }} />
      <div className="hero-orb-b" style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle, rgba(56,217,245,0.07) 0%, transparent 60%)", bottom:"-100px", right:"-80px", pointerEvents:"none" }} />
      <div className="hero-orb-c" style={{ position:"absolute", width:280, height:280, borderRadius:"50%", background:"radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 60%)", top:"45%", left:"55%", pointerEvents:"none" }} />

      {/* Subtle grid */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(20,184,232,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(20,184,232,0.04) 1px, transparent 1px)", backgroundSize:"44px 44px", pointerEvents:"none" }} />

      {/* Top-edge neon line */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg, transparent 0%, rgba(20,184,232,0.5) 30%, rgba(56,217,245,0.8) 50%, rgba(20,184,232,0.5) 70%, transparent 100%)", pointerEvents:"none" }} />

      <div style={{ position:"relative", display:"flex", flexDirection:"column", height:"100%", padding:"36px 44px 32px" }}>

        {/* ── Logo ── */}
        <div className="hero-in hi-1" style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{
            width:40, height:40, borderRadius:12, flexShrink:0,
            background:"linear-gradient(135deg, #14b8e8 0%, #0284c7 100%)",
            boxShadow:"0 0 28px rgba(20,184,232,0.55), 0 0 60px rgba(20,184,232,0.15)",
            display:"flex", alignItems:"center", justifyContent:"center",
            border:"1px solid rgba(56,217,245,0.3)",
          }}>
            <span style={{ color:"#fff", fontSize:18, fontWeight:900 }}>A</span>
          </div>
          <div>
            <span style={{ color:"#fff", fontSize:17, fontWeight:800, letterSpacing:"-0.01em" }}>ArtixPOS</span>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:2 }}>
              <div className="pulse-dot" style={{ width:5, height:5, borderRadius:"50%", background:"#38d9f5", boxShadow:"0 0 6px #38d9f5" }} />
              <span style={{ color:"rgba(56,217,245,0.65)", fontSize:10, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase" }}>Business OS</span>
            </div>
          </div>
        </div>

        {/* ── Headline ── */}
        <div className="hero-in hi-2" style={{ marginTop:40, marginBottom:20 }}>
          <h2 style={{ fontSize:34, fontWeight:900, lineHeight:1.08, letterSpacing:"-0.03em", margin:"0 0 14px", color:"#fff" }}>
            Run your whole<br />
            <span style={{
              background:"linear-gradient(90deg, #38d9f5 0%, #14b8e8 40%, #38bdf8 70%, #67e8f9 100%)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
              backgroundClip:"text",
            }}>
              business
            </span>
            {" "}from one<br />
            place.
          </h2>
          <p style={{ fontSize:13.5, lineHeight:1.75, color:"rgba(255,255,255,0.42)", maxWidth:340, margin:0 }}>
            Sales, inventory, payroll, analytics, and AI — all connected, always in sync, works offline too.
          </p>
        </div>

        {/* ── Device mockup block ── */}
        <div className="hero-in hi-3" style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", gap:14 }}>

          {/* Mini "dashboard" card — desktop */}
          <div style={{
            borderRadius:14, overflow:"hidden",
            border:"1px solid rgba(20,184,232,0.18)",
            background:"rgba(15,30,48,0.85)",
            backdropFilter:"blur(12px)",
            boxShadow:"0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(20,184,232,0.08)",
          }}>
            {/* Window chrome */}
            <div style={{ padding:"9px 14px", background:"rgba(20,184,232,0.06)", borderBottom:"1px solid rgba(20,184,232,0.10)", display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:"rgba(239,68,68,0.6)" }} />
              <div style={{ width:8, height:8, borderRadius:"50%", background:"rgba(251,191,36,0.6)" }} />
              <div style={{ width:8, height:8, borderRadius:"50%", background:"rgba(34,197,94,0.5)" }} />
              <div style={{ flex:1, height:1 }} />
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.25)", fontWeight:500 }}>Dashboard · ArtixPOS</span>
            </div>
            {/* Dashboard content */}
            <div style={{ padding:"14px 16px" }}>
              {/* Stat row */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:12 }}>
                {[
                  { label:"Today's Sales", val:"₱ 24,850", delta:"+12%", c:"#38d9f5" },
                  { label:"Orders",        val:"137",       delta:"+8%",  c:"#34d399" },
                  { label:"Active Staff",  val:"9",         delta:"2 on shift", c:"#a78bfa" },
                ].map((s, i) => (
                  <div key={i} style={{ padding:"10px 12px", borderRadius:10, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.38)", fontWeight:600, marginBottom:4, letterSpacing:"0.05em", textTransform:"uppercase" }}>{s.label}</div>
                    <div style={{ fontSize:15, fontWeight:800, color:"#fff", marginBottom:2 }}>{s.val}</div>
                    <div style={{ fontSize:9, color:s.c, fontWeight:600 }}>{s.delta}</div>
                  </div>
                ))}
              </div>
              {/* Mini bar chart */}
              <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:36, marginBottom:10 }}>
                {[55,70,45,88,62,95,72,84,58,100,76,90].map((h, i) => (
                  <div key={i} style={{ flex:1, borderRadius:3, background:`rgba(20,184,232,${0.15 + (h/100)*0.55})`, height:`${h}%`, transition:"height 0.3s" }} />
                ))}
              </div>
              {/* Bottom row */}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <StatPill label="POS" value="Live" color="#38d9f5" />
                <StatPill label="Sync" value="Offline ready" color="#34d399" />
                <StatPill label="AI" value="Active" color="#a78bfa" />
              </div>
            </div>
          </div>

          {/* Two smaller cards side by side */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {/* Mobile POS card */}
            <div style={{ borderRadius:12, border:"1px solid rgba(20,184,232,0.15)", background:"rgba(15,30,48,0.7)", backdropFilter:"blur(8px)", padding:"13px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                <div style={{ width:26, height:26, borderRadius:8, background:"rgba(20,184,232,0.15)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38d9f5" strokeWidth="2.2"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1"/></svg>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.75)" }}>Mobile POS</span>
              </div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)", marginBottom:6 }}>Works on phone · tablet · laptop</div>
              <div style={{ display:"flex", gap:4 }}>
                {["📱","💻","🖥️"].map((e,i)=>(
                  <div key={i} style={{ fontSize:14, padding:"4px 7px", borderRadius:7, background:"rgba(20,184,232,0.08)", border:"1px solid rgba(20,184,232,0.12)" }}>{e}</div>
                ))}
              </div>
            </div>

            {/* Security card */}
            <div style={{ borderRadius:12, border:"1px solid rgba(52,211,153,0.18)", background:"rgba(15,30,48,0.7)", backdropFilter:"blur(8px)", padding:"13px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                <div style={{ width:26, height:26, borderRadius:8, background:"rgba(52,211,153,0.12)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.75)" }}>Security</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {["JWT auth + CSRF shield","Row-level data isolation","Brute-force lockout"].map((s,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#34d399" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontSize:9.5, color:"rgba(255,255,255,0.45)", fontWeight:500 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Feature list ── */}
        <div className="hero-in hi-4" style={{ marginTop:18, display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { icon:"⚡", label:"POS with offline mode",          sub:"Keeps working when internet drops",   c:"#38d9f5" },
            { icon:"📊", label:"Real-time analytics",            sub:"Sales, margins, and trends live",     c:"#38bdf8" },
            { icon:"🧠", label:"Built-in AI assistant",          sub:"Answers business questions instantly", c:"#a78bfa" },
            { icon:"🏢", label:"Multi-branch management",        sub:"One account for all your locations",  c:"#34d399" },
          ].map((f, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:30, height:30, borderRadius:9, flexShrink:0, background:`rgba(255,255,255,0.05)`, border:`1px solid rgba(255,255,255,0.08)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.82)" }}>{f.label}</div>
                <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.35)", marginTop:1 }}>{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Bottom badge ── */}
        <div className="hero-in hi-5" style={{ marginTop:24 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px", borderRadius:8, background:"rgba(20,184,232,0.08)", border:"1px solid rgba(20,184,232,0.18)" }}>
            <div className="pulse-dot" style={{ width:4, height:4, borderRadius:"50%", background:"#38d9f5", boxShadow:"0 0 6px #38d9f5" }} />
            <span style={{ color:"rgba(56,217,245,0.6)", fontSize:11, fontWeight:600, letterSpacing:"0.07em" }}>ARTIXPOS · BUSINESS PLATFORM</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen flex relative overflow-hidden"
      style={{ background: isDark ? C.dark : "#eef7fb" }}
    >
      {/* Light-mode ambient tint */}
      {!isDark && (
        <>
          <div style={{ position:"absolute", width:700, height:700, borderRadius:"50%", background:"radial-gradient(circle, rgba(20,184,232,0.09) 0%, transparent 65%)", top:"-20%", left:"-10%", pointerEvents:"none" }} />
          <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle, rgba(14,165,233,0.07) 0%, transparent 65%)", bottom:"-10%", right:"-5%", pointerEvents:"none" }} />
        </>
      )}

      {/* ── Desktop: hero left + form right ── */}
      <div className="hidden md:flex w-full">
        {heroPanel}

        {/* Right — form panel */}
        <div
          className="flex-1 flex items-center justify-center p-12 relative overflow-y-auto"
          style={{ background: isDark ? "#07101a" : "#ffffff" }}
        >
          {formPanel}
        </div>
      </div>

      {/* ── Mobile: centered card ── */}
      <div
        className="md:hidden flex-1 flex items-center justify-center px-5 py-10 relative z-10"
        style={{ minHeight: "100vh" }}
      >
        <div
          style={{
            width: "100%", maxWidth: 420,
            padding: "32px 28px",
            borderRadius: 24,
            background: isDark ? "rgba(255,255,255,0.033)" : "rgba(255,255,255,0.88)",
            border: `1px solid ${isDark ? "rgba(20,184,232,0.12)" : "rgba(0,0,0,0.06)"}`,
            boxShadow: isDark
              ? "0 0 0 1px rgba(20,184,232,0.08), 0 32px 80px rgba(0,0,0,0.65)"
              : "0 8px 50px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.04)",
          }}
        >
          {formPanel}
        </div>
      </div>

      {/* Forgot password overlay */}
      {showForgot && (
        <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:isDark?"rgba(0,0,0,0.75)":"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)", padding:"0 20px" }}>
          <div style={{ width:"100%", maxWidth:420, borderRadius:24, padding:"36px 32px", background:isDark?"#0a1826":"#ffffff", border:`1px solid ${isDark?"rgba(20,184,232,0.15)":"rgba(0,0,0,0.06)"}`, boxShadow:isDark?"0 32px 100px rgba(0,0,0,0.8)":"0 8px 60px rgba(0,0,0,0.12)" }}>
            {forgotSuccess ? (
              <div style={{ textAlign:"center" }}>
                <div style={{ width:52, height:52, borderRadius:"50%", margin:"0 auto 16px", background:isDark?"rgba(20,184,232,0.12)":"rgba(20,184,232,0.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="24" height="24" fill="none" stroke={isDark?"#38d9f5":"#0284c7"} strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 5.29 5.29l1-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 15.5"/>
                  </svg>
                </div>
                <h2 style={{ fontSize:20, fontWeight:800, margin:"0 0 8px", color:isDark?"#fff":"#0c1a26" }}>Check your email</h2>
                <p style={{ fontSize:13, lineHeight:1.6, color:isDark?"rgba(255,255,255,0.55)":"rgba(12,26,38,0.6)", margin:"0 0 24px" }}>
                  If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent.
                </p>
                <button onClick={closeForgot} data-testid="button-back-to-signin"
                  style={{ width:"100%", padding:"12px 0", borderRadius:12, fontSize:14, fontWeight:700, border:"none", cursor:"pointer", fontFamily:"inherit", background:"linear-gradient(135deg,#14b8e8,#0284c7)", color:"#fff" }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <button onClick={closeForgot} style={{ background:"none", border:"none", cursor:"pointer", padding:0, color:isDark?"rgba(255,255,255,0.4)":"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", gap:6, fontSize:13, fontFamily:"inherit", marginBottom:20 }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Back
                </button>
                <h2 style={{ fontSize:22, fontWeight:800, margin:"0 0 6px", color:isDark?"#fff":"#0c1a26" }}>Reset password</h2>
                <p style={{ fontSize:13, lineHeight:1.6, color:isDark?"rgba(255,255,255,0.55)":"rgba(12,26,38,0.6)", margin:"0 0 22px" }}>
                  Enter your email and we'll send you a reset link.
                </p>
                <form onSubmit={handleForgotSubmit} style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, display:"block", marginBottom:5, color:isDark?"rgba(255,255,255,0.52)":"rgba(0,0,0,0.48)" }}>Email address</label>
                    <input type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      required data-testid="input-forgot-email" className="form-input" style={inputStyle} autoComplete="email" />
                  </div>
                  {forgotError && (
                    <div style={{ padding:"10px 14px", borderRadius:10, fontSize:13, background:isDark?"rgba(239,68,68,0.1)":"rgba(239,68,68,0.07)", border:`1px solid ${isDark?"rgba(239,68,68,0.25)":"rgba(239,68,68,0.18)"}`, color:isDark?"#f87171":"#dc2626" }}>
                      {forgotError}
                    </div>
                  )}
                  <button type="submit" disabled={forgotLoading} data-testid="button-send-reset"
                    style={{ padding:"13px 0", borderRadius:12, fontSize:14, fontWeight:700, border:"none", cursor:forgotLoading?"not-allowed":"pointer", fontFamily:"inherit", opacity:forgotLoading?0.7:1, background:"linear-gradient(135deg,#14b8e8,#0284c7)", color:"#fff", boxShadow:"0 4px 16px rgba(20,184,232,0.3)" }}>
                    {forgotLoading ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Debug panel (native only) */}
      {isNativePlatform() && showDebug && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, maxHeight:"65vh", display:"flex", flexDirection:"column", background:"#060f18", borderTop:"1px solid rgba(20,184,232,0.2)", zIndex:9999, fontFamily:"monospace", fontSize:11 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
            <span style={{ color:"#38d9f5", fontWeight:700, fontSize:12, letterSpacing:"0.05em" }}>ARTIXPOS DEBUG</span>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => { const text = debugEntries.map(e => `${e.ts} [${e.tag}] ${e.msg}`).join("\n"); navigator.clipboard?.writeText(text).then(() => alert("Logs copied!")); }}
                style={{ color:"#60a5fa", background:"rgba(96,165,250,0.1)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:5, cursor:"pointer", fontSize:10, padding:"2px 8px" }}>Copy</button>
              <button onClick={refreshDebug} style={{ color:"#94a3b8", background:"none", border:"1px solid rgba(255,255,255,0.1)", borderRadius:5, cursor:"pointer", fontSize:10, padding:"2px 8px" }}>Refresh</button>
              <button onClick={() => { clearDebugLogs(); setDebugEntries([]); }} style={{ color:"#f87171", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:5, cursor:"pointer", fontSize:10, padding:"2px 8px" }}>Clear</button>
            </div>
          </div>
          <div style={{ overflowY:"auto", flex:1, padding:"4px 0" }}>
            {debugEntries.length === 0 ? (
              <div style={{ color:"#475569", fontStyle:"italic", padding:"8px 12px" }}>No logs yet.</div>
            ) : (
              debugEntries.slice().reverse().map((e, i) => (
                <div key={i} style={{ padding:"3px 12px", borderBottom:"1px solid rgba(255,255,255,0.04)", display:"flex", gap:8 }}>
                  <span style={{ color:"#475569", flexShrink:0 }}>{e.ts}</span>
                  <span style={{ color:"#38d9f5", flexShrink:0 }}>[{e.tag}]</span>
                  <span style={{ color:"#cbd5e1", wordBreak:"break-all" }}>{e.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
