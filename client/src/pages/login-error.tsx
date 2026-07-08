/**
 * Minimal error page — no hooks, no GSAP, no API calls.
 * Renders instantly, never white-screens.
 */
export default function LoginError() {
  const p = new URLSearchParams(window.location.search);
  const error = p.get("error") ?? "unknown";
  const detail = p.get("detail");

  const messages: Record<string, string> = {
    state_mismatch: "Sign-in expired. Please try again.",
    google_not_configured: "Google sign-in is not configured.",
    google_init: "Could not start Google sign-in. Please try again.",
    google_cb: detail ? decodeURIComponent(detail) : "Google sign-in failed. Please try again.",
    google_no_user: "Google account not recognized. Please sign up first.",
    server_unavailable: "Server is starting up. Please wait a moment and try again.",
    server_misconfigured: "Server is not configured. Check environment variables.",
    cookie: "Could not save your session. Please try again.",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#09090b",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#18181b",
          borderRadius: 16,
          padding: 32,
          maxWidth: 420,
          width: "100%",
          margin: 16,
          textAlign: "center",
          border: "1px solid #27272a",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#fafafa", marginBottom: 8 }}>
          Sign-in failed
        </div>
        <div style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 20, lineHeight: 1.5 }}>
          {messages[error] ?? "An unexpected error occurred."}
        </div>
        <a
          href="/login"
          style={{
            display: "inline-block",
            background: "#3b82f6",
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Try again
        </a>
      </div>
    </div>
  );
}
