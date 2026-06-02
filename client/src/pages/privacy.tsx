import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

const BLUE = "#14b8e8";
const DARK = "#0C1420";
const SURFACE = "#111827";
const BORDER = "rgba(255,255,255,0.07)";

const SECTIONS = [
  { id: "overview", title: "1. Overview" },
  { id: "who-we-are", title: "2. Who We Are" },
  { id: "information-we-collect", title: "3. Information We Collect" },
  { id: "how-we-use", title: "4. How We Use Your Information" },
  { id: "legal-basis", title: "5. Legal Basis for Processing" },
  { id: "data-sharing", title: "6. Data Sharing & Disclosure" },
  { id: "third-party-services", title: "7. Third-Party Services" },
  { id: "cookies", title: "8. Cookies & Tracking" },
  { id: "data-retention", title: "9. Data Retention" },
  { id: "data-security", title: "10. Data Security" },
  { id: "international", title: "11. International Transfers" },
  { id: "your-rights", title: "12. Your Rights & Choices" },
  { id: "children", title: "13. Children's Privacy" },
  { id: "business-transfers", title: "14. Business Transfers" },
  { id: "ai-features", title: "15. AI Features & Data" },
  { id: "changes", title: "16. Changes to This Policy" },
  { id: "contact", title: "17. Contact & Data Requests" },
];

function SectionAnchor({ id }: { id: string }) {
  return <span id={id} style={{ display: "block", marginTop: -80, paddingTop: 80, visibility: "hidden" }} />;
}

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState("overview");
  const isMobile = useIsMobile();
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const ids = SECTIONS.map((s) => s.id);
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>

      {/* Top bar */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, background: "rgba(12,20,32,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", padding: isMobile ? "0 16px" : "0 32px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg,${BLUE},#0284c7)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>ArtixPOS</span>
          {!isMobile && <><span style={{ color: BORDER, margin: "0 2px" }}>·</span><span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Privacy Policy</span></>}
        </div>
        <button
          onClick={() => setLocation("/login")}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: "5px 12px", borderRadius: 7, transition: "all 0.15s", flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; e.currentTarget.style.borderColor = BORDER; }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          {isMobile ? "Back" : "Back to login"}
        </button>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "28px 18px 80px" : "48px 32px 120px", display: "flex", gap: isMobile ? 0 : 52, alignItems: "flex-start" }}>

        {/* Sidebar TOC — hidden on mobile */}
        <aside style={{ width: 220, flexShrink: 0, position: "sticky", top: 72, maxHeight: "calc(100vh - 90px)", overflowY: "auto", display: isMobile ? "none" : "block" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: "0 0 16px" }}>Contents</p>
          <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                style={{
                  background: activeSection === s.id ? "rgba(20,184,232,0.08)" : "none",
                  border: "none",
                  borderLeft: `2px solid ${activeSection === s.id ? BLUE : "transparent"}`,
                  color: activeSection === s.id ? BLUE : "rgba(255,255,255,0.38)",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontFamily: "inherit",
                  textAlign: "left",
                  padding: "7px 12px",
                  borderRadius: "0 6px 6px 0",
                  transition: "all 0.15s",
                  lineHeight: 1.4,
                }}
                onMouseEnter={e => { if (activeSection !== s.id) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
                onMouseLeave={e => { if (activeSection !== s.id) e.currentTarget.style.color = "rgba(255,255,255,0.38)"; }}
              >
                {s.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0 }}>

          {/* Header */}
          <div style={{ marginBottom: 52, paddingBottom: 36, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(20,184,232,0.08)", border: "1px solid rgba(20,184,232,0.15)", borderRadius: 20, padding: "4px 12px", marginBottom: 20 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span style={{ fontSize: 12, color: BLUE, fontWeight: 600 }}>Privacy & Data</span>
            </div>
            <h1 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.1 }}>Privacy Policy</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", margin: "0 0 20px", lineHeight: 1.7 }}>
              This Privacy Policy describes how ArtixPOS collects, uses, stores, and shares information about you when you use our platform. We are committed to protecting your privacy and handling your data with transparency.
            </p>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)" }}>Effective: June 1, 2025</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)" }}>Last updated: June 2, 2025</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)" }}>Version 1.0</span>
            </div>
          </div>

          {/* TL;DR callout */}
          <div style={{ background: "rgba(20,184,232,0.06)", border: "1px solid rgba(20,184,232,0.15)", borderRadius: 12, padding: "20px 24px", marginBottom: 52 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BLUE, margin: "0 0 10px" }}>The short version</p>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.60)", margin: 0 }}>
              We collect what's needed to run your account and power the app. We never sell your data. We never use it for advertising. Your business data belongs to you. You can export or delete everything at any time. If you have questions, email us at <a href="mailto:privacy@artixpos.com" style={{ color: BLUE, textDecoration: "none" }}>privacy@artixpos.com</a>.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>

            {/* 1 */}
            <section>
              <SectionAnchor id="overview" />
              <SectionHeader num="1" title="Overview" />
              <Body>
                ArtixPOS ("we," "us," "our") operates the ArtixPOS web application and associated mobile applications (collectively, the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
              </Body>
              <Body>
                By creating an account or using the Service, you consent to the collection and use of your information in accordance with this Policy. If you do not agree with the terms of this Policy, please do not use the Service.
              </Body>
              <Body>
                This Policy applies to all users of the Service, including business owners, administrators, staff members, and any other individuals who interact with the platform. For the avoidance of doubt, this Policy does not apply to the practices of third parties that ArtixPOS does not own or control.
              </Body>
            </section>

            {/* 2 */}
            <section>
              <SectionAnchor id="who-we-are" />
              <SectionHeader num="2" title="Who We Are" />
              <Body>
                ArtixPOS is a business management and point-of-sale platform. For the purposes of data protection law, ArtixPOS is the data controller in respect of any personal information you provide to us when creating or managing your account.
              </Body>
              <Body>
                In the context of your business data (e.g., your customers' information, sales records, staff data), you are the data controller and ArtixPOS acts as your data processor. We process that data only on your instructions and in accordance with this Policy and our Terms of Service.
              </Body>
              <Body>
                If you are a staff member or employee whose employer uses ArtixPOS, your employer is the primary data controller of your employment-related data within the platform. We recommend reviewing your employer's own privacy practices in addition to this Policy.
              </Body>
            </section>

            {/* 3 */}
            <section>
              <SectionAnchor id="information-we-collect" />
              <SectionHeader num="3" title="Information We Collect" />
              <SubHeader>3.1 Account & Registration Information</SubHeader>
              <Body>When you create an account, we collect:</Body>
              <BulletList items={[
                "Full name and display name",
                "Email address",
                "Password (stored as a cryptographic hash — never in plaintext)",
                "Business name and business type",
                "Profile photo (optional)",
                "Phone number (optional)",
                "Billing information (processed and stored by PayMongo — we do not store raw card data)",
              ]} />
              <SubHeader>3.2 Business Data You Enter</SubHeader>
              <Body>
                As you use the Service, you create and store business data, which may include:
              </Body>
              <BulletList items={[
                "Product catalog, pricing, and inventory records",
                "Sales transactions, receipts, and order histories",
                "Customer profiles, contact information, and purchase histories",
                "Staff accounts, roles, schedules, and payroll records",
                "Expense records and financial data",
                "Supplier and purchase order information",
                "Appointment and booking records",
                "Loyalty program memberships and point balances",
              ]} />
              <Body>
                This business data belongs to you. We store it to power the Service and do not use it for any purpose beyond providing and improving the Service.
              </Body>
              <SubHeader>3.3 Automatically Collected Information</SubHeader>
              <Body>When you use the Service, we automatically collect:</Body>
              <BulletList items={[
                "Log data: IP address, browser type and version, pages visited, timestamps, referring URL",
                "Device information: device type, operating system, screen resolution, language settings",
                "Session data: authentication tokens, session duration, feature usage patterns",
                "Performance data: API response times, error logs, crash reports",
                "Security events: login attempts, failed authentications, account changes",
              ]} />
              <SubHeader>3.4 Communications</SubHeader>
              <Body>
                If you contact us via email, support tickets, or in-app feedback forms, we retain those communications to help resolve your inquiry and improve our support quality.
              </Body>
              <SubHeader>3.5 OAuth / Social Login Data</SubHeader>
              <Body>
                If you choose to sign in via Google or Facebook OAuth, we receive your name, email address, and profile photo from those providers. We do not receive your password or payment information from those services.
              </Body>
            </section>

            {/* 4 */}
            <section>
              <SectionAnchor id="how-we-use" />
              <SectionHeader num="4" title="How We Use Your Information" />
              <Body>We use the information we collect for the following purposes:</Body>
              <SubHeader>4.1 Providing & Operating the Service</SubHeader>
              <BulletList items={[
                "Authenticating your identity and maintaining your session securely",
                "Storing, syncing, and retrieving your business data across devices",
                "Processing and displaying your transactions, reports, and analytics",
                "Enabling multi-branch, multi-user collaboration features",
                "Delivering AI-powered insights and assistant responses",
                "Sending transactional emails (receipts, password resets, billing notifications)",
              ]} />
              <SubHeader>4.2 Security & Fraud Prevention</SubHeader>
              <BulletList items={[
                "Detecting and preventing unauthorized access, fraud, and abuse",
                "Monitoring for suspicious activity and enforcing rate limits",
                "Maintaining audit logs for account security and compliance",
                "Investigating reported security incidents",
              ]} />
              <SubHeader>4.3 Service Improvement</SubHeader>
              <BulletList items={[
                "Analyzing aggregated, anonymized usage patterns to improve features",
                "Diagnosing technical issues using crash reports and error logs",
                "Testing and deploying new features and performance improvements",
                "Conducting internal research on product quality and reliability",
              ]} />
              <SubHeader>4.4 Communications</SubHeader>
              <BulletList items={[
                "Responding to your support requests, feedback, and inquiries",
                "Sending important notices about your account, billing, and service changes",
                "Notifying you of significant updates to these policies (with opt-out for marketing)",
              ]} />
              <SubHeader>4.5 Legal & Compliance</SubHeader>
              <BulletList items={[
                "Complying with applicable laws, regulations, and legal processes",
                "Enforcing our Terms of Service and other agreements",
                "Protecting the rights, property, and safety of ArtixPOS and its users",
              ]} />
              <Body>
                <strong style={{ color: "rgba(255,255,255,0.75)" }}>We do not:</strong> sell your personal data, use your business data for advertising, share your data with advertising networks, or use your data to build profiles for resale to data brokers.
              </Body>
            </section>

            {/* 5 */}
            <section>
              <SectionAnchor id="legal-basis" />
              <SectionHeader num="5" title="Legal Basis for Processing" />
              <Body>
                Where applicable under data protection laws (including the Philippines Data Privacy Act of 2012 and, where relevant, the EU GDPR), we rely on the following legal bases for processing your personal information:
              </Body>
              <BulletList items={[
                "Contract performance: processing necessary to provide the Service you have subscribed to",
                "Legitimate interests: processing for fraud prevention, security, and service improvement, where our interests are not overridden by your rights",
                "Legal obligation: processing required by applicable law, court order, or regulatory requirement",
                "Consent: processing based on your affirmative consent (e.g., optional marketing communications), which you may withdraw at any time",
              ]} />
            </section>

            {/* 6 */}
            <section>
              <SectionAnchor id="data-sharing" />
              <SectionHeader num="6" title="Data Sharing & Disclosure" />
              <Body>We do not sell your personal information. We may share your information only in the following circumstances:</Body>
              <SubHeader>6.1 Service Providers</SubHeader>
              <Body>
                We engage trusted third-party service providers to assist in operating and improving the Service. These providers access your data only to perform services on our behalf and are contractually prohibited from using your data for any other purpose.
              </Body>
              <SubHeader>6.2 Legal Requirements</SubHeader>
              <Body>
                We may disclose your information if required to do so by law, or in good-faith belief that such disclosure is necessary to: (a) comply with a legal obligation or court order; (b) protect and defend the rights or property of ArtixPOS; (c) prevent or investigate possible wrongdoing in connection with the Service; or (d) protect the personal safety of users or the public.
              </Body>
              <SubHeader>6.3 Business Transfers</SubHeader>
              <Body>
                In the event of a merger, acquisition, asset sale, financing, or reorganization of ArtixPOS, your information may be transferred as part of that transaction. We will notify you before your information is subject to a different privacy policy as a result of such a transfer.
              </Body>
              <SubHeader>6.4 With Your Consent</SubHeader>
              <Body>
                We may share your information with third parties when you have given us explicit consent to do so, such as when you authorize a third-party integration with your ArtixPOS account.
              </Body>
              <SubHeader>6.5 Aggregated / Anonymized Data</SubHeader>
              <Body>
                We may share aggregated, anonymized, non-personally-identifiable information publicly or with partners for research, analytics, or product development purposes.
              </Body>
            </section>

            {/* 7 */}
            <section>
              <SectionAnchor id="third-party-services" />
              <SectionHeader num="7" title="Third-Party Services" />
              <Body>The Service integrates with the following third-party services, each with their own privacy policies:</Body>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "0 0 20px" }}>
                {[
                  {
                    name: "PayMongo",
                    role: "Payment processing for Pro subscriptions",
                    data: "Billing name, payment method details. We never store raw card data.",
                    url: "https://www.paymongo.com/privacy",
                  },
                  {
                    name: "Google OAuth",
                    role: "Optional sign-in method",
                    data: "Name, email address, and profile photo — only if you choose to sign in with Google.",
                    url: "https://policies.google.com/privacy",
                  },
                  {
                    name: "Facebook OAuth",
                    role: "Optional sign-in method",
                    data: "Name, email address, and profile photo — only if you choose to sign in with Facebook.",
                    url: "https://www.facebook.com/privacy/policy",
                  },
                  {
                    name: "Groq / Cerebras / Mistral",
                    role: "AI assistant and business insights",
                    data: "Queries you send to the AI assistant are processed by these providers. We do not send your full business database — only the context you include in your query.",
                    url: null,
                  },
                  {
                    name: "Upstash",
                    role: "Rate limiting and caching infrastructure",
                    data: "IP addresses for rate limiting purposes only. No business data is cached in Upstash.",
                    url: "https://upstash.com/trust/privacy.pdf",
                  },
                  {
                    name: "Sentry",
                    role: "Error monitoring and service reliability",
                    data: "Stack traces, error context, and basic device/browser info when errors occur. Personal data in error messages is automatically scrubbed.",
                    url: "https://sentry.io/privacy/",
                  },
                ].map(({ name, role, data, url }) => (
                  <div key={name} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{name}</span>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: BLUE, textDecoration: "none", flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                        >Privacy Policy ↗</a>
                      )}
                    </div>
                    <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)", margin: "0 0 6px" }}>{role}</p>
                    <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.50)", margin: 0, lineHeight: 1.65 }}>{data}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* 8 */}
            <section>
              <SectionAnchor id="cookies" />
              <SectionHeader num="8" title="Cookies & Tracking" />
              <SubHeader>8.1 What We Use</SubHeader>
              <Body>ArtixPOS uses a minimal set of browser storage mechanisms:</Body>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "0 0 20px" }}>
                {[
                  { name: "auth_token (HttpOnly Cookie)", purpose: "Keeps you logged in securely. Expires with your session or after 30 days. Cannot be read by JavaScript.", required: true },
                  { name: "csrf_token (Cookie)", purpose: "Protects against cross-site request forgery attacks. Readable by JavaScript to include in request headers.", required: true },
                  { name: "localStorage", purpose: "Stores your UI preferences (theme, sidebar state, language), offline POS data, and cached app state for performance.", required: true },
                  { name: "IndexedDB", purpose: "Stores offline transaction data for the PWA, enabling the app to work without an internet connection.", required: false },
                ].map(({ name, purpose, required }) => (
                  <div key={name} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 4, background: required ? "rgba(20,184,232,0.12)" : "rgba(255,255,255,0.05)", color: required ? BLUE : "rgba(255,255,255,0.30)" }}>
                        {required ? "REQUIRED" : "OPTIONAL"}
                      </span>
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)", margin: "0 0 4px" }}>{name}</p>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>{purpose}</p>
                    </div>
                  </div>
                ))}
              </div>
              <SubHeader>8.2 What We Do Not Use</SubHeader>
              <BulletList items={[
                "Third-party advertising or tracking cookies",
                "Analytics services such as Google Analytics or Mixpanel",
                "Fingerprinting or cross-site tracking technologies",
                "Social media tracking pixels",
              ]} />
            </section>

            {/* 9 */}
            <section>
              <SectionAnchor id="data-retention" />
              <SectionHeader num="9" title="Data Retention" />
              <Body>We retain your information for as long as necessary to provide the Service and fulfill the purposes described in this Policy:</Body>
              <BulletList items={[
                "Active account data: retained for the duration of your account",
                "Business data (products, sales, customers, etc.): retained for the life of your account and purged within 30 days of account deletion from active systems and 90 days from backup systems",
                "Security and audit logs: retained for 12 months to support security investigations and compliance",
                "Billing records: retained for 7 years to comply with financial record-keeping requirements",
                "Support communications: retained for 3 years after resolution",
                "Anonymized usage data: may be retained indefinitely as it cannot be used to identify you",
              ]} />
              <Body>
                After the applicable retention period, we securely delete or anonymize your data. If you request account deletion before a retention period expires, we will delete your data except where retention is required for legal or regulatory compliance.
              </Body>
            </section>

            {/* 10 */}
            <section>
              <SectionAnchor id="data-security" />
              <SectionHeader num="10" title="Data Security" />
              <Body>We take the security of your data seriously and implement multiple layers of protection:</Body>
              <SubHeader>10.1 Technical Safeguards</SubHeader>
              <BulletList items={[
                "All data is transmitted over encrypted connections (HTTPS/TLS 1.2+)",
                "Passwords are hashed using industry-standard algorithms — never stored in plaintext",
                "Authentication tokens use signed JWTs with short expiry times",
                "Database access uses Row-Level Security (RLS) to enforce tenant data isolation",
                "API endpoints are rate-limited to prevent brute-force and abuse",
                "Application security is tested regularly for common vulnerabilities (OWASP Top 10)",
                "CSRF protection is enforced on all state-changing requests",
                "HTTP security headers (CSP, HSTS, X-Frame-Options) are enforced",
              ]} />
              <SubHeader>10.2 Organizational Safeguards</SubHeader>
              <BulletList items={[
                "Access to production data is limited to authorized personnel on a need-to-know basis",
                "Internal data access is logged and audited",
                "We conduct regular security reviews and penetration testing",
              ]} />
              <SubHeader>10.3 Incident Response</SubHeader>
              <Body>
                Despite our best efforts, no security system is impenetrable. In the event of a data breach that materially affects your personal information, we will: (a) notify affected users within 72 hours of confirmed discovery; (b) provide information about what was affected and steps taken; and (c) cooperate with relevant authorities as required by law.
              </Body>
              <Body>
                To report a security vulnerability, please contact us responsibly at <a href="mailto:security@artixpos.com" style={{ color: BLUE, textDecoration: "none" }}>security@artixpos.com</a>. We have a responsible disclosure process and will acknowledge valid reports within 48 hours.
              </Body>
            </section>

            {/* 11 */}
            <section>
              <SectionAnchor id="international" />
              <SectionHeader num="11" title="International Data Transfers" />
              <Body>
                ArtixPOS is based in the Philippines and primarily serves customers in the Philippines and Southeast Asia. Your data may be processed in data centers located in the Philippines, Singapore, or the United States, depending on our infrastructure providers.
              </Body>
              <Body>
                When your data is transferred outside of your country of residence, we ensure that appropriate safeguards are in place in accordance with applicable law, including standard contractual clauses, adequacy decisions, or other legally recognized transfer mechanisms.
              </Body>
              <Body>
                By using the Service, you consent to your information being transferred to and processed in countries other than your own. We ensure that any such transfer is made in compliance with applicable data protection laws.
              </Body>
            </section>

            {/* 12 */}
            <section>
              <SectionAnchor id="your-rights" />
              <SectionHeader num="12" title="Your Rights & Choices" />
              <Body>
                Depending on your jurisdiction, you may have the following rights regarding your personal information:
              </Body>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "0 0 20px" }}>
                {[
                  { right: "Right to Access", desc: "Request a copy of the personal information we hold about you, including what data we have, how we use it, and who we share it with." },
                  { right: "Right to Rectification", desc: "Request that we correct inaccurate or incomplete personal information about you. You can update most information directly in your account settings." },
                  { right: "Right to Erasure", desc: "Request deletion of your personal information and all associated business data. You can delete your account from your settings, or email us to initiate deletion." },
                  { right: "Right to Data Portability", desc: "Request an export of your data in a structured, machine-readable format. Use the export tools in your account settings or contact us." },
                  { right: "Right to Object", desc: "Object to our processing of your personal information in certain circumstances, including where we rely on legitimate interests." },
                  { right: "Right to Restriction", desc: "Request that we restrict processing of your personal information under certain conditions." },
                  { right: "Right to Withdraw Consent", desc: "Where processing is based on your consent, you may withdraw that consent at any time without affecting the lawfulness of prior processing." },
                ].map(({ right, desc }) => (
                  <div key={right} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 18px" }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: "rgba(255,255,255,0.80)", margin: "0 0 6px" }}>{right}</p>
                    <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.47)", margin: 0, lineHeight: 1.65 }}>{desc}</p>
                  </div>
                ))}
              </div>
              <Body>
                To exercise any of these rights, contact us at <a href="mailto:privacy@artixpos.com" style={{ color: BLUE, textDecoration: "none" }}>privacy@artixpos.com</a>. We will respond within 30 days. We may need to verify your identity before processing your request.
              </Body>
              <Body>
                If you are not satisfied with our response, you have the right to lodge a complaint with the National Privacy Commission (NPC) of the Philippines or the relevant supervisory authority in your jurisdiction.
              </Body>
            </section>

            {/* 13 */}
            <section>
              <SectionAnchor id="children" />
              <SectionHeader num="13" title="Children's Privacy" />
              <Body>
                The Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at <a href="mailto:privacy@artixpos.com" style={{ color: BLUE, textDecoration: "none" }}>privacy@artixpos.com</a>.
              </Body>
              <Body>
                If we discover that we have inadvertently collected personal information from a child under 13, we will take immediate steps to delete that information from our servers. Users between 13 and 17 may use the Service with verifiable parental or guardian consent.
              </Body>
            </section>

            {/* 14 */}
            <section>
              <SectionAnchor id="business-transfers" />
              <SectionHeader num="14" title="Business Transfers" />
              <Body>
                If ArtixPOS is involved in a merger, acquisition, asset sale, financing, reorganization, bankruptcy, or any other business combination, your information may be transferred to the succeeding entity as part of that transaction. We will notify you via email and/or a prominent notice within the Service at least 30 days before your information becomes subject to a materially different privacy policy as a result of such a transfer.
              </Body>
              <Body>
                In any such event, we will seek to ensure that the acquiring party is bound by terms that provide at least the same level of protection for your personal information as set out in this Policy.
              </Body>
            </section>

            {/* 15 */}
            <section>
              <SectionAnchor id="ai-features" />
              <SectionHeader num="15" title="AI Features & Data" />
              <Body>
                ArtixPOS includes AI-powered features such as the business assistant, insights, and automated recommendations. Here is how we handle your data in relation to these features:
              </Body>
              <BulletList items={[
                "When you interact with the AI assistant, your query is sent to a third-party AI model provider (Groq, Cerebras, or Mistral AI, depending on availability)",
                "We send only the context necessary to answer your query — we do not transmit your entire business database",
                "AI responses are generated by the model provider and are not stored by us beyond the current session, unless you explicitly save them",
                "AI model providers process your queries subject to their own privacy policies and data retention terms",
                "You can disable AI features entirely from your account settings at any time",
                "AI-generated content is not used to train third-party models under our current agreements with providers",
              ]} />
              <Body>
                We recommend that you do not include sensitive personal information (such as customer payment details, full national ID numbers, or similar sensitive data) in AI assistant queries.
              </Body>
            </section>

            {/* 16 */}
            <section>
              <SectionAnchor id="changes" />
              <SectionHeader num="16" title="Changes to This Policy" />
              <Body>
                We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of material changes by:
              </Body>
              <BulletList items={[
                "Sending an email to the address associated with your account at least 14 days before the effective date",
                "Displaying a prominent notice within the Service",
                "Updating the 'Last updated' date at the top of this Policy",
              ]} />
              <Body>
                For non-material changes (such as clarifications or corrections that do not affect how we use your data), we may update the Policy without separate notice. We encourage you to review this Policy periodically.
              </Body>
              <Body>
                Your continued use of the Service after the effective date of any changes constitutes your acceptance of the updated Policy. If you do not agree with the changes, you must stop using the Service.
              </Body>
            </section>

            {/* 17 */}
            <section>
              <SectionAnchor id="contact" />
              <SectionHeader num="17" title="Contact & Data Requests" />
              <Body>
                If you have questions, concerns, or requests related to this Privacy Policy or your personal data, please contact us:
              </Body>
              <InfoBox entries={[
                { label: "Privacy requests & inquiries", value: "privacy@artixpos.com" },
                { label: "Data deletion requests", value: "privacy@artixpos.com" },
                { label: "Data export requests", value: "privacy@artixpos.com" },
                { label: "Security & breach reports", value: "security@artixpos.com" },
                { label: "General support", value: "support@artixpos.com" },
              ]} />
              <Body>
                We aim to respond to all privacy-related requests within <strong style={{ color: "rgba(255,255,255,0.70)" }}>30 days</strong> of receipt. For data deletion and portability requests, we may require identity verification before processing.
              </Body>
              <Body>
                If you are a resident of the Philippines and believe your data protection rights have been violated, you may file a complaint with the <strong style={{ color: "rgba(255,255,255,0.70)" }}>National Privacy Commission (NPC)</strong> at <a href="https://privacy.gov.ph" target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none" }}>privacy.gov.ph</a>.
              </Body>
            </section>

          </div>

          {/* Footer links */}
          <div style={{ marginTop: 72, paddingTop: 28, borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 24 }}>
              <a href="/terms" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = BLUE)}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
              >Terms of Service</a>
              <a href="/login" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
              >Back to ArtixPOS</a>
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.18)" }}>© {new Date().getFullYear()} ArtixPOS. All rights reserved.</span>
          </div>

        </main>
      </div>
    </div>
  );
}

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, fontVariantNumeric: "tabular-nums", minWidth: 20 }}>{num}</span>
      <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: "-0.02em" }}>{title}</h2>
    </div>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", margin: "28px 0 10px" }}>{children}</h3>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14.5, lineHeight: 1.8, color: "rgba(255,255,255,0.50)", margin: "0 0 14px" }}>{children}</p>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 16px", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.50)" }}>
          <span style={{ color: BLUE, flexShrink: 0, marginTop: 7, width: 4, height: 4, borderRadius: "50%", background: BLUE, display: "inline-block" }} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function InfoBox({ entries }: { entries: { label: string; value: string }[] }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(({ label, value }) => (
        <div key={label} style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)", minWidth: 200 }}>{label}</span>
          <a href={`mailto:${value}`} style={{ fontSize: 13.5, color: BLUE, textDecoration: "none", fontWeight: 500 }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
          >{value}</a>
        </div>
      ))}
    </div>
  );
}
