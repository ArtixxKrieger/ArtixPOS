import { useLocation } from "wouter";

const BLUE = "#14b8e8";
const DARK = "#0C1420";

export default function TermsOfService() {
  const [, setLocation] = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 96px" }}>

        <button
          onClick={() => setLocation("/login")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "rgba(255,255,255,0.40)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0, marginBottom: 48, transition: "color 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.40)")}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${BLUE},#0284c7)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>ArtixPOS</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Terms of Service</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: "0 0 52px" }}>Last updated June 2025</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>What ArtixPOS is</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              ArtixPOS is a web-based point of sale and business management platform. When you sign up, you get a workspace to manage your store, staff, inventory, and sales. You can access it from any browser on any device.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Your account</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: "0 0 12px" }}>
              You're responsible for keeping your login credentials secure. Don't share your password. If you add staff accounts, you're responsible for what they do inside your workspace.
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              You need to be at least 18 years old, or have permission from a parent or guardian, to use ArtixPOS.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Your data</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              The products, customers, sales, and business data you enter belongs to you. We store it to power the app. We don't use your business data for advertising or sell it to third parties. If you delete your account, your data is removed from our systems.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Payments and subscriptions</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: "0 0 12px" }}>
              The free plan is free and has no time limit. Pro plans are billed monthly or annually through PayMongo. Subscriptions renew automatically unless you cancel before the next billing period.
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              We don't issue refunds for partial billing periods, but if you run into a billing issue, reach out and we'll sort it out.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>What we don't allow</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: "0 0 12px" }}>
              Don't use ArtixPOS for anything illegal, and don't attempt to reverse-engineer, resell, or abuse the platform. We reserve the right to terminate accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Service availability</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              We aim for high uptime and take reliability seriously. That said, we can't guarantee 100% availability. The app is provided as-is. We're not liable for losses caused by downtime, data loss from your end, or issues outside our control.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Changes to these terms</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              If we make significant changes, we'll notify you by email or through the app. Continued use after changes means you accept them.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Contact</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              Questions or concerns? Reach us at{" "}
              <a href="mailto:support@artixpos.com" style={{ color: BLUE, textDecoration: "none", borderBottom: "1px solid rgba(20,184,232,0.3)" }}>support@artixpos.com</a>.
            </p>
          </section>

        </div>

        <div style={{ marginTop: 64, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 20 }}>
          <a href="/privacy" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.28)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Privacy Policy</a>
          <a href="/login" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.28)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Back to ArtixPOS</a>
        </div>

      </div>
    </div>
  );
}
