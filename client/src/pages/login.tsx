import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0a0a0f]">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, #7c3aed, transparent 70%)",
            top: "-10%",
            left: "-10%",
            animation: "float1 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, #2563eb, transparent 70%)",
            bottom: "-10%",
            right: "-10%",
            animation: "float2 15s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-[300px] h-[300px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, #db2777, transparent 70%)",
            top: "50%",
            left: "60%",
            animation: "float3 10s ease-in-out infinite",
          }}
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, 30px) scale(1.05); }
          66% { transform: translate(-20px, 50px) scale(0.95); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-50px, -40px) scale(1.08); }
          66% { transform: translate(30px, -20px) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.2); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-slide-up {
          animation: fadeSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
        .btn-google:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(255,255,255,0.08); }
        .btn-facebook:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(24,119,242,0.35); }
        .btn-google, .btn-facebook { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
        .logo-glow {
          box-shadow: 0 0 0 1px rgba(124,58,237,0.3), 0 0 40px rgba(124,58,237,0.3), 0 0 80px rgba(124,58,237,0.1);
        }
        .card-glow {
          box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 24px 80px rgba(0,0,0,0.6), 0 0 120px rgba(124,58,237,0.08);
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent);
        }
      `}</style>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm mx-4 rounded-2xl p-8 card-glow fade-slide-up"
        style={{
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 fade-slide-up delay-100">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 logo-glow"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            }}
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>

          <h1
            className="text-2xl font-bold tracking-tight mb-1"
            style={{
              background: "linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.5))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            QuickPOS
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            Your store. Your data.
          </p>
        </div>

        {error && (
          <div
            className="mb-5 px-4 py-3 rounded-xl text-sm text-center fade-slide-up"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171",
            }}
          >
            Sign-in failed. Please try again.
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3">
          <a
            href="/auth/google"
            className="btn-google flex items-center gap-3 w-full px-4 py-3.5 rounded-xl font-medium text-sm"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="flex-1 text-center">Continue with Google</span>
          </a>

          <a
            href="/auth/facebook"
            className="btn-facebook flex items-center gap-3 w-full px-4 py-3.5 rounded-xl font-medium text-sm"
            style={{
              background: "linear-gradient(135deg, #1877F2, #0d65d9)",
              border: "1px solid rgba(24,119,242,0.3)",
              color: "#fff",
            }}
          >
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <span className="flex-1 text-center">Continue with Facebook</span>
          </a>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6 fade-slide-up delay-400">
          <div className="divider-line" />
          <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>
            Sign in to get started
          </span>
          <div className="divider-line" />
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 fade-slide-up delay-500">
          {["Free to use", "Private data", "Multi-device"].map((f) => (
            <span
              key={f}
              className="text-[11px] px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(124,58,237,0.1)",
                border: "1px solid rgba(124,58,237,0.2)",
                color: "rgba(167,139,250,0.8)",
              }}
            >
              {f}
            </span>
          ))}
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: "rgba(255,255,255,0.18)" }}>
          Each account gets its own private POS system
        </p>
      </div>
    </div>
  );
}
