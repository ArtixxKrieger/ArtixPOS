import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { resolveUrl } from "@/lib/queryClient";

function getIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(getIsDark);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("Invalid or missing reset token.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(resolveUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    fontSize: 14,
    outline: "none",
    background: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    color: isDark ? "rgba(255,255,255,0.9)" : "#1a1a1a",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-500"
      style={{ background: isDark ? "#080810" : "#f8f7ff" }}
    >
      {/* Background orbs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(109,40,217,0.12) 0%, transparent 65%)",
          top: "-10%", left: "-5%", animation: "orb1 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)",
          bottom: "-10%", right: "-10%", animation: "orb2 17s ease-in-out infinite",
        }} />
      </div>

      <style>{`
        @keyframes orb1 { 0%,100% { transform: translate(0,0) scale(1); } 40% { transform: translate(60px,40px) scale(1.1); } }
        @keyframes orb2 { 0%,100% { transform: translate(0,0) scale(1); } 35% { transform: translate(-70px,-50px) scale(1.12); } }
        @keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .rp-rise { animation: rise 0.55s cubic-bezier(0.16,1,0.3,1) both; }
      `}</style>

      <main
        className="rp-rise relative z-10 w-full max-w-[420px] mx-5 rounded-3xl"
        style={{
          padding: "36px 32px",
          background: isDark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.85)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
          boxShadow: isDark
            ? "0 0 0 1px rgba(255,255,255,0.04), 0 32px 100px rgba(0,0,0,0.7)"
            : "0 8px 60px rgba(0,0,0,0.09), 0 2px 12px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{
          fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          color: isDark ? "rgba(167,139,250,0.7)" : "rgba(109,40,217,0.6)", marginBottom: 10,
        }}>
          ArtixPOS
        </div>

        {success ? (
          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px",
              background: isDark ? "rgba(34,197,94,0.12)" : "rgba(34,197,94,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" fill="none" stroke={isDark ? "#86efac" : "#16a34a"} strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: isDark ? "#fff" : "#0f0a1e" }}>
              Password updated!
            </h2>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(15,10,30,0.6)", margin: "0 0 24px" }}>
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button
              onClick={() => setLocation("/login")}
              data-testid="button-goto-signin"
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, fontSize: 14, fontWeight: 700,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff",
                boxShadow: "0 4px 16px rgba(109,40,217,0.3)",
              }}
            >
              Sign in
            </button>
          </div>
        ) : (
          <>
            <h1 style={{
              fontSize: 26, fontWeight: 800, lineHeight: 1.18, letterSpacing: "-0.02em",
              color: isDark ? "#ffffff" : "#0f0a1e", margin: "0 0 6px",
            }}>
              Set new password
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: isDark ? "rgba(255,255,255,0.58)" : "rgba(15,10,30,0.62)", margin: "0 0 24px" }}>
              Choose a strong password for your account.
            </p>

            {!token && (
              <div style={{
                padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16,
                background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
                border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.18)"}`,
                color: isDark ? "#f87171" : "#dc2626",
              }}>
                Invalid or missing reset token. Please request a new reset link.
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)" }}>
                  New password <span style={{ fontWeight: 400, opacity: 0.7 }}>(min. 8 characters)</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    data-testid="input-new-password"
                    style={{ ...inputStyle, paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", padding: 2,
                      color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)",
                      display: "flex", alignItems: "center",
                    }}
                  >
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

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)" }}>
                  Confirm password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  data-testid="input-confirm-password"
                  style={inputStyle}
                />
              </div>

              {error && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10, fontSize: 13,
                  background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
                  border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.18)"}`,
                  color: isDark ? "#f87171" : "#dc2626",
                }} data-testid="text-reset-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !token}
                data-testid="button-reset-submit"
                style={{
                  padding: "13px 0", borderRadius: 12, fontSize: 14, fontWeight: 700,
                  border: "none", cursor: loading || !token ? "not-allowed" : "pointer",
                  fontFamily: "inherit", opacity: loading || !token ? 0.7 : 1, marginTop: 4,
                  background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff",
                  boxShadow: "0 4px 16px rgba(109,40,217,0.3)",
                }}
              >
                {loading ? "Updating password…" : "Update password"}
              </button>
            </form>

            <p style={{ marginTop: 20, fontSize: 12, textAlign: "center" }}>
              <button
                onClick={() => setLocation("/login")}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontFamily: "inherit", fontSize: 12, fontWeight: 500,
                  color: isDark ? "rgba(167,139,250,0.75)" : "rgba(109,40,217,0.7)",
                }}
              >
                Back to sign in
              </button>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
