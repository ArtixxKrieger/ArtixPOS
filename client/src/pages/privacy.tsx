import { useLocation } from "wouter";

const BLUE = "#14b8e8";
const DARK = "#0C1420";

export default function PrivacyPolicy() {
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
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: "0 0 52px" }}>Last updated June 2025</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>The short version</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              We collect what's needed to run your account and provide the service. We don't sell your data. We don't use it for ads. You can delete your account and everything in it at any time.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>What we collect</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: "0 0 16px" }}>
              When you sign up, we store your name, email address, and the business information you provide (store name, business type, etc.).
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: "0 0 16px" }}>
              As you use the app, we store the data you enter: products, sales, staff accounts, customers, inventory, expenses, and so on. That's your business data and it lives in your workspace.
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              We also log basic activity like login events and account changes for security purposes. This is what powers the audit log feature.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>How we use it</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              Your data is used to provide the app — authentication, syncing across devices, showing your reports, that kind of thing. We may use aggregate, anonymized usage data internally to improve the product. We will never use your actual business data (your sales, products, customers) for anything outside of running your account.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Third parties</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: "0 0 16px" }}>
              We use a small number of services to run the platform:
            </p>
            <ul style={{ margin: "0 0 16px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { name: "PostgreSQL hosting", desc: "where your data is stored" },
                { name: "PayMongo", desc: "handles payment processing for Pro subscriptions. Your payment details go directly to them and are subject to their privacy policy." },
                { name: "Google / Facebook OAuth", desc: "if you choose to sign in with these, they share your name and email with us. Nothing else." },
              ].map(({ name, desc }) => (
                <li key={name} style={{ fontSize: 14.5, lineHeight: 1.7, color: "rgba(255,255,255,0.55)" }}>
                  <strong style={{ color: "rgba(255,255,255,0.75)" }}>{name}</strong> — {desc}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              We don't use advertising networks or sell data to data brokers.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Cookies and storage</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              We use a session cookie to keep you logged in. That's it. We also use localStorage for things like your theme preference and offline data caching. No tracking cookies, no third-party analytics scripts.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Your rights</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              You can export or delete your data at any time from your account settings. Deleting your account removes your workspace and all associated data from our systems within 30 days. If you want a copy of your data before deleting, reach out and we'll prepare an export for you.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Data security</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              Data is encrypted in transit (HTTPS). Passwords are hashed and never stored in plain text. We take reasonable precautions to protect your data, but no system is 100% bulletproof. If we ever discover a breach that affects you, we'll let you know promptly.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#fff" }}>Contact</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              Privacy questions or data requests:{" "}
              <a href="mailto:support@artixpos.com" style={{ color: BLUE, textDecoration: "none", borderBottom: "1px solid rgba(20,184,232,0.3)" }}>support@artixpos.com</a>.
            </p>
          </section>

        </div>

        <div style={{ marginTop: 64, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 20 }}>
          <a href="/terms" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.28)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Terms of Service</a>
          <a href="/login" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.28)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Back to ArtixPOS</a>
        </div>

      </div>
    </div>
  );
}
