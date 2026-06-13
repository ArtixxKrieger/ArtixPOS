import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";

type Status = "verifying" | "success" | "error" | "expired";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("verifying");
  const [, navigate] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        if (res.ok) {
          setStatus("success");
          await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
          setTimeout(() => navigate("/"), 2500);
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus(data.code === "EXPIRED" ? "expired" : "error");
        }
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  const messages: Record<Status, { icon: string; title: string; body: string; color: string }> = {
    verifying: {
      icon: "⏳",
      title: "Verifying your email…",
      body: "Just a moment.",
      color: "#7c3aed",
    },
    success: {
      icon: "✅",
      title: "Email verified!",
      body: "Your account is confirmed. Taking you to the app…",
      color: "#16a34a",
    },
    error: {
      icon: "❌",
      title: "Invalid link",
      body: "This verification link is invalid. Please request a new one from inside the app.",
      color: "#dc2626",
    },
    expired: {
      icon: "⏱️",
      title: "Link expired",
      body: "This verification link has expired (links are valid for 24 hours). Please request a new one from inside the app.",
      color: "#d97706",
    },
  };

  const m = messages[status];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f5f3ff",
      fontFamily: "sans-serif",
      padding: "24px",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: "16px",
        padding: "40px 32px",
        maxWidth: "420px",
        width: "100%",
        textAlign: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>{m.icon}</div>
        <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 800, color: "#0f0a1e" }}>
          {m.title}
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: "14px", color: "#555", lineHeight: 1.6 }}>
          {m.body}
        </p>
        {status !== "verifying" && status !== "success" && (
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
              color: "#fff",
              textDecoration: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            Back to login
          </a>
        )}
        <div style={{ marginTop: "32px" }}>
          <span style={{ fontSize: "18px", fontWeight: 800, color: "#0f0a1e" }}>Artix</span>
          <span style={{ fontSize: "18px", fontWeight: 800, color: "#7c3aed" }}>POS</span>
        </div>
      </div>
    </div>
  );
}
