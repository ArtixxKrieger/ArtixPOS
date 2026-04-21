import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { debugLog, getDebugLogs, clearDebugLogs, type DebugEntry } from "@/lib/debug-log";
import { NATIVE_TOKEN_KEY, apiRequest, setNativeToken, queryClient, resolveUrl } from "@/lib/queryClient";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

function isNativePlatform(): boolean {
  try { return (window as any).Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}
function isPluginAvailable(name: string): boolean {
  try { return (window as any).Capacitor?.isPluginAvailable?.(name) === true; } catch { return false; }
}

function resolveOAuthUrl(path: string): string {
  const base = API_BASE || window.location.origin;
  if (base.startsWith("capacitor://") || base.startsWith("ionic://"))
    throw new Error("VITE_API_BASE_URL is not configured.");
  return `${base.replace(/\/$/, "")}${path}?native=1`;
}

async function openOAuthBrowser(provider: "google") {
  const url = resolveOAuthUrl("/auth/google");
  debugLog("login", `opening browser OAuth for ${provider}: ${url}`);
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, presentationStyle: "popover" });
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

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(getIsDark);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>(() => getDebugLogs());
  const refreshDebug = useCallback(() => setDebugEntries(getDebugLogs()), []);

  const [mode, setMode] = useState<AuthMode>("signin");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (!inviteToken) return;
    localStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
    if (isAuthenticated) {
      (async () => {
        try { await fetch("/auth/logout", { method: "POST", credentials: "include" }); } catch {}
        const { clearNativeToken } = await import("@/lib/queryClient");
        clearNativeToken();
        queryClient.setQueryData(["auth-me"], null);
        queryClient.clear();
        window.history.replaceState({}, "", "/login");
      })();
    }
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
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

  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");
  const detail = urlParams.get("detail");
  const reason = urlParams.get("reason");
  const hasStoredToken = !!localStorage.getItem(NATIVE_TOKEN_KEY);
  const hasPendingInvite = !!localStorage.getItem(INVITE_STORAGE_KEY) || !!urlParams.get("invite");

  async function handleNativeGoogleSignIn() {
    setNativeError(null);
    setSigningIn(true);
    sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
    try {
      const token = await nativeGoogleSignIn();
      setNativeToken(token);
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      setLocation("/");
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const isUserCancel = msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("dismissed") || msg.toLowerCase().includes("12501");
      sessionStorage.removeItem(OAUTH_FLOW_KEY);
      if (!isUserCancel) setNativeError(msg.length < 120 ? msg : "Sign-in failed — tap 'Show debug' for details.");
    } finally {
      setSigningIn(false);
    }
  }

  function handleGoogleClick(e: React.MouseEvent) {
    sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
    if (!isNativePlatform()) return;
    e.preventDefault();
    handleNativeGoogleSignIn();
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body: any = { email: formEmail, password: formPassword };
      if (mode === "register") body.name = formName;
      const res = await fetch(resolveUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.message ?? "Something went wrong."); return; }
      sessionStorage.setItem(OAUTH_FLOW_KEY, "1");
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      setLocation("/");
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
        headers: { "Content-Type": "application/json" },
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

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#06060f]" : "bg-[#f4f3f9]"}`}>
        <div className={`w-7 h-7 border-2 rounded-full animate-spin ${isDark ? "border-violet-500 border-t-transparent" : "border-violet-600 border-t-transparent"}`} />
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    background: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
    border: `1.5px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
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
        .btn-primary {
          width: 100%; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 700;
          cursor: pointer; border: none; font-family: inherit;
          transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), opacity 0.18s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); opacity: 0.92; }
        .btn-primary:active:not(:disabled) { transform: translateY(0) scale(0.98); }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .form-input:focus {
          border-color: rgba(124,58,237,0.55) !important;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12) !important;
        }
      `}</style>

      {/* Logo + heading */}
      <div className="rise d1" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
            boxShadow: "0 4px 14px rgba(109,40,217,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>A</span>
          </div>
          <span style={{
            fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
            color: isDark ? "rgba(167,139,250,0.8)" : "rgba(109,40,217,0.7)",
          }}>ArtixPOS</span>
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.025em",
          color: isDark ? "#ffffff" : "#0f0a1e", margin: 0, marginBottom: 8,
        }}>
          {mode === "register" ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{
          fontSize: 14, lineHeight: 1.6,
          color: isDark ? "rgba(255,255,255,0.52)" : "rgba(15,10,30,0.55)",
          margin: 0,
        }}>
          {mode === "register" ? "Set up your store in seconds." : "Sign in to continue to your store."}
        </p>
      </div>

      {/* Mode tabs */}
      <div className="rise d1" style={{
        display: "flex", gap: 3, padding: 3, borderRadius: 11, marginBottom: 22,
        background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      }}>
        {(["signin", "register"] as AuthMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            data-testid={`tab-${m}`}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.18s, color 0.18s, box-shadow 0.18s",
              background: mode === m
                ? isDark ? "rgba(124,58,237,0.55)" : "#ffffff"
                : "transparent",
              color: mode === m
                ? isDark ? "#ffffff" : "#7c3aed"
                : isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)",
              boxShadow: mode === m
                ? isDark ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.08)"
                : "none",
            }}
          >
            {m === "signin" ? "Sign in" : "Create account"}
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
          background: isDark ? "rgba(124,58,237,0.12)" : "rgba(124,58,237,0.07)",
          border: `1px solid ${isDark ? "rgba(167,139,250,0.25)" : "rgba(124,58,237,0.2)"}`,
          color: isDark ? "#c4b5fd" : "#7c3aed",
        }}>
          You've been invited to join a team. Sign in to accept.
        </div>
      )}
      {error && (
        <div className="rise d1" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13, textAlign: "center", marginBottom: 16,
          background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
          border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.18)"}`,
          color: isDark ? "#f87171" : "#dc2626",
        }}>
          {error === "state_mismatch" ? "Sign-in expired. Please try again."
            : error === "google_not_configured" ? "Google sign-in is not configured yet."
            : `Sign-in failed (${error})${detail ? `: ${detail}` : ""}. Please try again.`}
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
        <a
          href={`${API_BASE}/auth/google`}
          className="btn-social"
          data-testid="button-google-signin"
          onClick={handleGoogleClick}
          style={isDark ? {
            background: "rgba(255,255,255,0.07)",
            border: "1.5px solid rgba(255,255,255,0.10)",
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
            {signingIn ? "Signing in…" : "Continue with Google"}
          </span>
        </a>
      </div>

      {/* Divider */}
      <div className="rise d2" style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)", whiteSpace: "nowrap" }}>
          or {mode === "register" ? "register" : "sign in"} with email
        </span>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />
      </div>

      {/* Email form */}
      <form onSubmit={handleEmailSubmit} className="rise d3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "register" && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)", display: "block", marginBottom: 5 }}>
              Full name
            </label>
            <input type="text" placeholder="Jane Smith" value={formName} onChange={e => setFormName(e.target.value)}
              required data-testid="input-name" className="form-input" style={inputStyle} />
          </div>
        )}

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)", display: "block", marginBottom: 5 }}>
            Email address
          </label>
          <input type="email" placeholder="you@example.com" value={formEmail} onChange={e => setFormEmail(e.target.value)}
            required data-testid="input-email" className="form-input" style={inputStyle} />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)", display: "block", marginBottom: 5 }}>
            Password {mode === "register" && <span style={{ fontWeight: 400, opacity: 0.65 }}>(min. 8 characters)</span>}
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={mode === "register" ? "Create a password" : "Your password"}
              value={formPassword} onChange={e => setFormPassword(e.target.value)}
              required minLength={mode === "register" ? 8 : undefined}
              data-testid="input-password" className="form-input"
              style={{ ...inputStyle, paddingRight: 44 }}
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
          <div style={{ textAlign: "right", marginTop: -4 }}>
            <button type="button" onClick={openForgot} data-testid="button-forgot-password"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: isDark ? "rgba(167,139,250,0.75)" : "rgba(109,40,217,0.7)", padding: 0 }}>
              Forgot password?
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

        <button type="submit" disabled={formLoading} data-testid="button-submit" className="btn-primary"
          style={{ marginTop: 4, background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)", color: "#ffffff", boxShadow: "0 4px 18px rgba(109,40,217,0.35)" }}>
          {formLoading
            ? (mode === "register" ? "Creating account…" : "Signing in…")
            : (mode === "register" ? "Create account" : "Sign in")}
        </button>
      </form>

      <p className="rise d4" style={{ marginTop: 20, fontSize: 12, textAlign: "center", color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)", lineHeight: 1.5 }}>
        No credit card. No setup fees. Your data stays yours.
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

  return (
    <div
      className="min-h-screen flex relative overflow-hidden transition-colors duration-500"
      style={{ background: isDark ? "#06060f" : "#f4f3f9" }}
    >
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {isDark ? (
          <>
            <div style={{ position: "absolute", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 65%)", top: "-20%", left: "-10%", animation: "orb1 16s ease-in-out infinite" }} />
            <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 65%)", bottom: "-10%", right: "-5%", animation: "orb2 19s ease-in-out infinite" }} />
          </>
        ) : (
          <>
            <div style={{ position: "absolute", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 65%)", top: "-20%", left: "-10%" }} />
            <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 65%)", bottom: "-10%", right: "-5%" }} />
          </>
        )}
      </div>

      <style>{`
        @keyframes orb1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px,30px); } }
        @keyframes orb2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-40px,-20px); } }
      `}</style>

      {/* ── Desktop split layout ─────────────────────────────── */}
      <div className="hidden md:flex w-full">
        {/* Left — brand panel */}
        <div
          className="w-[45%] flex-shrink-0 flex flex-col justify-between p-12 relative overflow-hidden"
          style={{
            background: isDark
              ? "#060610"
              : "linear-gradient(150deg, #0f0523 0%, #1a0845 40%, #0c0330 100%)",
          }}
        >
          {/* Grid overlay */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(139,92,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.06) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
          {/* Neon glow orbs */}
          <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 65%)", top: "-80px", left: "-80px", pointerEvents: "none" }} />
          <div style={{ position: "absolute", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 65%)", bottom: "5%", right: "-60px", pointerEvents: "none" }} />
          <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 65%)", top: "50%", left: "60%", pointerEvents: "none" }} />

          {/* Logo */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                boxShadow: "0 0 24px rgba(124,58,237,0.6), 0 0 60px rgba(124,58,237,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid rgba(167,139,250,0.3)",
              }}>
                <span style={{ color: "#fff", fontSize: 18, fontWeight: 900 }}>A</span>
              </div>
              <div>
                <span style={{ color: "#fff", fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>ArtixPOS</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 6px #a78bfa" }} />
                  <span style={{ color: "rgba(167,139,250,0.7)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Business OS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center content */}
          <div style={{ position: "relative" }}>
            <h2 style={{
              fontSize: 40, fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.035em",
              margin: "0 0 18px",
            }}>
              <span style={{ color: "#fff" }}>Your store.</span><br />
              <span style={{ background: "linear-gradient(90deg, #a78bfa 0%, #818cf8 50%, #67e8f9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Fully in control.
              </span>
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(167,139,250,0.6)", margin: "0 0 36px", maxWidth: 320 }}>
              Sales, inventory, staff, analytics, and AI — all in one place. Built for speed, designed for simplicity.
            </p>

            {/* Feature list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { dot: "#a78bfa", text: "Point of Sale with offline support" },
                { dot: "#818cf8", text: "Real-time analytics & reports" },
                { dot: "#67e8f9", text: "Built-in AI business assistant" },
                { dot: "#4ade80", text: "Multi-branch & team management" },
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.dot, boxShadow: `0 0 8px ${f.dot}`, flexShrink: 0 }} />
                  <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13.5, fontWeight: 500 }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom — version badge */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 6px #a78bfa" }} />
              <span style={{ color: "rgba(167,139,250,0.65)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em" }}>ARTIXPOS · BUSINESS PLATFORM</span>
            </div>
          </div>
        </div>

        {/* Right — form panel */}
        <div
          className="flex-1 flex items-center justify-center p-12 relative"
          style={{ background: isDark ? "#06060f" : "#ffffff" }}
        >
          {formPanel}
        </div>
      </div>

      {/* ── Mobile layout — centered card ─────────────────────── */}
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
            border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
            boxShadow: isDark
              ? "0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.65)"
              : "0 8px 50px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.04)",
          }}
        >
          {formPanel}
        </div>
      </div>

      {/* Forgot password overlay */}
      {showForgot && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", padding: "0 20px" }}>
          <div style={{ width: "100%", maxWidth: 420, borderRadius: 24, padding: "36px 32px", background: isDark ? "#0f0c1a" : "#ffffff", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`, boxShadow: isDark ? "0 32px 100px rgba(0,0,0,0.8)" : "0 8px 60px rgba(0,0,0,0.12)" }}>
            {forgotSuccess ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px", background: isDark ? "rgba(124,58,237,0.15)" : "rgba(124,58,237,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" fill="none" stroke={isDark ? "#c4b5fd" : "#7c3aed"} strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 5.29 5.29l1-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 15.5"/>
                  </svg>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: isDark ? "#fff" : "#0f0a1e" }}>Check your email</h2>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(15,10,30,0.6)", margin: "0 0 24px" }}>
                  If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent.
                </p>
                <button onClick={closeForgot} data-testid="button-back-to-signin"
                  style={{ width: "100%", padding: "12px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff" }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <button onClick={closeForgot} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontFamily: "inherit", marginBottom: 20 }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Back
                </button>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", color: isDark ? "#fff" : "#0f0a1e" }}>Reset password</h2>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(15,10,30,0.6)", margin: "0 0 22px" }}>
                  Enter your email and we'll send you a reset link.
                </p>
                <form onSubmit={handleForgotSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)" }}>Email address</label>
                    <input type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      required data-testid="input-forgot-email" className="form-input" style={inputStyle} />
                  </div>
                  {forgotError && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)", border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.18)"}`, color: isDark ? "#f87171" : "#dc2626" }}>
                      {forgotError}
                    </div>
                  )}
                  <button type="submit" disabled={forgotLoading} data-testid="button-send-reset"
                    style={{ padding: "13px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, border: "none", cursor: forgotLoading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: forgotLoading ? 0.7 : 1, background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", boxShadow: "0 4px 16px rgba(109,40,217,0.3)" }}>
                    {forgotLoading ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Debug panel */}
      {isNativePlatform() && showDebug && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxHeight: "65vh", display: "flex", flexDirection: "column", background: "#0a0a14", borderTop: "1px solid rgba(167,139,250,0.2)", zIndex: 9999, fontFamily: "monospace", fontSize: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <span style={{ color: "#a78bfa", fontWeight: 700, fontSize: 12, letterSpacing: "0.05em" }}>ARTIXPOS DEBUG</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { const text = debugEntries.map(e => `${e.ts} [${e.tag}] ${e.msg}`).join("\n"); navigator.clipboard?.writeText(text).then(() => alert("Logs copied!")); }}
                style={{ color: "#60a5fa", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 5, cursor: "pointer", fontSize: 10, padding: "2px 8px" }}>Copy</button>
              <button onClick={refreshDebug} style={{ color: "#94a3b8", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, cursor: "pointer", fontSize: 10, padding: "2px 8px" }}>Refresh</button>
              <button onClick={() => { clearDebugLogs(); setDebugEntries([]); }} style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 5, cursor: "pointer", fontSize: 10, padding: "2px 8px" }}>Clear</button>
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {debugEntries.length === 0 ? (
              <div style={{ color: "#475569", fontStyle: "italic", padding: "8px 12px" }}>No logs yet.</div>
            ) : (
              [...debugEntries].reverse().map((e, i) => {
                const isFail = e.msg.toLowerCase().includes("fail") || e.msg.toLowerCase().includes("error");
                const isOk = e.msg.toLowerCase().includes("ok ✓") || e.msg.toLowerCase().includes("ready");
                return (
                  <div key={i} style={{ padding: "3px 12px", borderLeft: isFail ? "2px solid #f87171" : isOk ? "2px solid #4ade80" : "2px solid transparent", background: isFail ? "rgba(248,113,113,0.05)" : "transparent" }}>
                    <span style={{ color: "#475569" }}>{e.ts} </span>
                    <span style={{ color: isFail ? "#f87171" : isOk ? "#4ade80" : "#a78bfa" }}>[{e.tag}] </span>
                    <span style={{ color: isFail ? "#fca5a5" : "#cbd5e1", wordBreak: "break-all" }}>{e.msg}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
