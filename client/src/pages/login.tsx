import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

function getIsDark(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(getIsDark);

  useEffect(() => {
    if (!isLoading && isAuthenticated) setLocation("/");
  }, [isAuthenticated, isLoading, setLocation]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setIsDark(getIsDark());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");
  const detail = urlParams.get("detail");

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#080810]" : "bg-slate-50"}`}>
        <div className={`w-7 h-7 border-2 rounded-full animate-spin ${isDark ? "border-violet-500 border-t-transparent" : "border-violet-600 border-t-transparent"}`} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-500"
      style={{ background: isDark ? "#080810" : "#f8f7ff" }}
    >
      <style>{`
        @keyframes orb1 {
          0%,100% { transform: translate(0,0) scale(1); }
          40% { transform: translate(60px,40px) scale(1.1); }
          70% { transform: translate(-30px,60px) scale(0.95); }
        }
        @keyframes orb2 {
          0%,100% { transform: translate(0,0) scale(1); }
          35% { transform: translate(-70px,-50px) scale(1.12); }
          70% { transform: translate(40px,-20px) scale(0.9); }
        }
        @keyframes orb3 {
          0%,100% { transform: translate(-50%,-50%) scale(1); }
          50% { transform: translate(-50%,-50%) scale(1.25); }
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rise { animation: rise 0.65s cubic-bezier(0.16,1,0.3,1) both; }
        .d1 { animation-delay: 0.05s; }
        .d2 { animation-delay: 0.15s; }
        .d3 { animation-delay: 0.25s; }
        .d4 { animation-delay: 0.35s; }
        .btn-social {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 14px 20px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s ease, opacity 0.18s ease;
          position: relative;
          overflow: hidden;
        }
        .btn-social:hover { transform: translateY(-2px); }
        .btn-social:active { transform: translateY(0) scale(0.98); }
        .btn-social::after {
          content: '';
          position: absolute;
          inset: 0;
          background: white;
          opacity: 0;
          transition: opacity 0.15s;
          border-radius: inherit;
        }
        .btn-social:hover::after { opacity: 0.06; }
      `}</style>

      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {isDark ? (
          <>
            <div style={{
              position: "absolute", width: 700, height: 700, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(109,40,217,0.18) 0%, transparent 65%)",
              top: "-15%", left: "-15%", animation: "orb1 14s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 600, height: 600, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(37,99,235,0.13) 0%, transparent 65%)",
              bottom: "-10%", right: "-10%", animation: "orb2 17s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 350, height: 350, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(219,39,119,0.09) 0%, transparent 65%)",
              top: "50%", left: "55%", animation: "orb3 11s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
              backgroundSize: "64px 64px",
            }} />
          </>
        ) : (
          <>
            <div style={{
              position: "absolute", width: 700, height: 700, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 65%)",
              top: "-15%", left: "-15%", animation: "orb1 14s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 600, height: 600, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)",
              bottom: "-10%", right: "-10%", animation: "orb2 17s ease-in-out infinite",
            }} />
          </>
        )}
      </div>

      {/* Card */}
      <div
        className="rise relative z-10 w-full max-w-[400px] mx-5 rounded-3xl"
        style={{
          padding: "40px 36px",
          background: isDark
            ? "rgba(255,255,255,0.035)"
            : "rgba(255,255,255,0.85)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
          backdropFilter: "blur(32px)",
          boxShadow: isDark
            ? "0 0 0 1px rgba(255,255,255,0.04), 0 32px 100px rgba(0,0,0,0.7), 0 0 100px rgba(109,40,217,0.07)"
            : "0 8px 60px rgba(0,0,0,0.09), 0 2px 12px rgba(0,0,0,0.04)",
        }}
      >
        {/* Wordmark */}
        <div className="rise d1 mb-8">
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isDark ? "rgba(167,139,250,0.7)" : "rgba(109,40,217,0.6)",
            marginBottom: 12,
          }}>
            ArtixPOS
          </div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
            color: isDark ? "#ffffff" : "#0f0a1e",
            margin: 0,
          }}>
            Stop guessing.<br />Start selling.
          </h1>
          <p style={{
            marginTop: 10,
            fontSize: 14,
            lineHeight: 1.6,
            color: isDark ? "rgba(255,255,255,0.38)" : "rgba(15,10,30,0.45)",
          }}>
            One sign-in. Your entire store — products, sales, analytics — private and ready to go.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rise d1 mb-4" style={{
            padding: "11px 16px",
            borderRadius: 12,
            fontSize: 13,
            textAlign: "center",
            background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
            border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.18)"}`,
            color: isDark ? "#f87171" : "#dc2626",
          }}>
            {error === "state_mismatch"
              ? "Sign-in expired or invalid state. Please try again."
              : error === "google_not_configured" || error === "facebook_not_configured"
              ? "This sign-in method is not configured yet."
              : `Sign-in failed (${error})${detail ? `: ${detail}` : ""}. Please try again.`}
          </div>
        )}

        {/* Buttons */}
        <div className="rise d2 space-y-3">
          {/* Google */}
          <a
            href="/auth/google"
            className="btn-social"
            style={isDark ? {
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.88)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
            } : {
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.10)",
              color: "#1a1a1a",
              boxShadow: "0 2px 8px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span style={{ flex: 1, textAlign: "center" }}>Continue with Google</span>
          </a>

          {/* Facebook */}
          <a
            href="/auth/facebook"
            className="btn-social"
            style={isDark ? {
              background: "linear-gradient(135deg, #1877F2 0%, #0c63d4 100%)",
              border: "1px solid rgba(24,119,242,0.4)",
              color: "#ffffff",
              boxShadow: "0 4px 20px rgba(24,119,242,0.3)",
            } : {
              background: "linear-gradient(135deg, #1877F2 0%, #1464cc 100%)",
              border: "1px solid rgba(24,119,242,0.25)",
              color: "#ffffff",
              boxShadow: "0 4px 16px rgba(24,119,242,0.25)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <span style={{ flex: 1, textAlign: "center" }}>Continue with Facebook</span>
          </a>
        </div>

        {/* Footer line */}
        <p className="rise d4" style={{
          marginTop: 28,
          fontSize: 12,
          textAlign: "center",
          color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.28)",
          lineHeight: 1.5,
        }}>
          No credit card. No setup fees. Your data stays yours.
        </p>
      </div>
    </div>
  );
}
