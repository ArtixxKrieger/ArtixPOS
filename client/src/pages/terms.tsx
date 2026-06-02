import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";

const BLUE = "#14b8e8";
const DARK = "#0C1420";
const SURFACE = "#111827";
const BORDER = "rgba(255,255,255,0.07)";

const SECTIONS = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "description", title: "2. Description of Service" },
  { id: "eligibility", title: "3. Eligibility" },
  { id: "account", title: "4. Account Registration & Security" },
  { id: "subscriptions", title: "5. Subscriptions & Billing" },
  { id: "free-plan", title: "6. Free Plan" },
  { id: "refunds", title: "7. Refunds & Cancellations" },
  { id: "acceptable-use", title: "8. Acceptable Use Policy" },
  { id: "intellectual-property", title: "9. Intellectual Property" },
  { id: "user-content", title: "10. User Content & Data" },
  { id: "third-party", title: "11. Third-Party Services" },
  { id: "privacy", title: "12. Privacy" },
  { id: "confidentiality", title: "13. Confidentiality" },
  { id: "warranties", title: "14. Disclaimers & Warranties" },
  { id: "liability", title: "15. Limitation of Liability" },
  { id: "indemnification", title: "16. Indemnification" },
  { id: "termination", title: "17. Termination" },
  { id: "modifications", title: "18. Modifications to Service" },
  { id: "governing-law", title: "19. Governing Law" },
  { id: "dispute", title: "20. Dispute Resolution" },
  { id: "miscellaneous", title: "21. Miscellaneous" },
  { id: "contact", title: "22. Contact Information" },
];

function SectionAnchor({ id }: { id: string }) {
  return <span id={id} style={{ display: "block", marginTop: -80, paddingTop: 80, visibility: "hidden" }} />;
}

export default function TermsOfService() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState("acceptance");
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
      <header style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, background: "rgba(12,20,32,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg,${BLUE},#0284c7)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>ArtixPOS</span>
          <span style={{ color: BORDER, margin: "0 4px" }}>·</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Terms of Service</span>
        </div>
        <button
          onClick={() => setLocation("/login")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", padding: "6px 14px", borderRadius: 8, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; e.currentTarget.style.borderColor = BORDER; }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Back to login
        </button>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 32px 120px", display: "flex", gap: 52, alignItems: "flex-start" }}>

        {/* Sidebar TOC */}
        <aside style={{ width: 220, flexShrink: 0, position: "sticky", top: 80, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
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
              <svg width="12" height="12" fill={BLUE} viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke={BLUE} fill="none" strokeWidth="2" /></svg>
              <span style={{ fontSize: 12, color: BLUE, fontWeight: 600 }}>Legal Agreement</span>
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.1 }}>Terms of Service</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", margin: "0 0 20px", lineHeight: 1.7 }}>
              Please read these Terms of Service carefully before using ArtixPOS. By accessing or using our service, you agree to be bound by these terms.
            </p>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)" }}>Effective: June 1, 2025</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)" }}>Last updated: June 2, 2025</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)" }}>Version 1.0</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>

            {/* 1 */}
            <section>
              <SectionAnchor id="acceptance" />
              <SectionHeader num="1" title="Acceptance of Terms" />
              <Body>
                These Terms of Service ("Terms," "Agreement") constitute a legally binding contract between you ("User," "you," "your") and ArtixPOS ("Company," "we," "us," "our"), governing your access to and use of the ArtixPOS platform, including all associated software, mobile applications, APIs, and related services (collectively, the "Service").
              </Body>
              <Body>
                By (a) clicking "I agree" or similar acceptance mechanisms, (b) registering for an account, (c) accessing or using the Service in any manner, or (d) continuing to use the Service after being notified of updated terms, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy, which is incorporated herein by reference.
              </Body>
              <Body>
                If you are using the Service on behalf of an organization, company, or other legal entity, you represent and warrant that you have the authority to bind that entity to these Terms. In such a case, "you" and "your" refers to both you individually and the entity.
              </Body>
              <Body>
                <strong style={{ color: "rgba(255,255,255,0.80)" }}>IF YOU DO NOT AGREE TO THESE TERMS, DO NOT ACCESS OR USE THE SERVICE.</strong> Your sole remedy if you do not accept these Terms is to discontinue use of the Service.
              </Body>
            </section>

            {/* 2 */}
            <section>
              <SectionAnchor id="description" />
              <SectionHeader num="2" title="Description of Service" />
              <Body>
                ArtixPOS is a cloud-based point-of-sale and business management platform designed for retail, food service, hospitality, and related industries. The Service includes but is not limited to:
              </Body>
              <BulletList items={[
                "Point-of-sale (POS) transaction processing and order management",
                "Inventory tracking, stock management, and supplier management",
                "Customer relationship management (CRM) and loyalty programs",
                "Staff scheduling, time tracking, and payroll management",
                "Financial reporting, sales analytics, and business intelligence dashboards",
                "Appointment and booking management",
                "Expense tracking and financial management tools",
                "Multi-branch and multi-location management",
                "AI-powered business insights and assistant features",
                "Offline functionality via Progressive Web App (PWA) technology",
                "Application Programming Interfaces (APIs) for integration with third-party services",
                "Mobile applications available on iOS and Android platforms",
              ]} />
              <Body>
                We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with or without notice, subject to the provisions in Section 18.
              </Body>
            </section>

            {/* 3 */}
            <section>
              <SectionAnchor id="eligibility" />
              <SectionHeader num="3" title="Eligibility" />
              <Body>
                You must be at least 18 years of age to use the Service. By using the Service, you represent and warrant that:
              </Body>
              <BulletList items={[
                "You are at least 18 years of age, or if you are between 13 and 17, you have obtained verifiable parental or legal guardian consent",
                "You have the legal capacity to enter into binding contracts under the laws of your jurisdiction",
                "You are not a person barred from receiving the Service under the laws of the Philippines or any other applicable jurisdiction",
                "You are not located in a country subject to applicable trade sanctions or embargoes",
                "You have not previously been suspended or removed from the Service for a violation of these Terms",
                "Your use of the Service will comply with all applicable local, national, and international laws and regulations",
              ]} />
              <Body>
                If you are registering on behalf of a business entity, you additionally represent that you are an authorized representative of such entity with authority to bind it to these Terms.
              </Body>
            </section>

            {/* 4 */}
            <section>
              <SectionAnchor id="account" />
              <SectionHeader num="4" title="Account Registration & Security" />
              <SubHeader>4.1 Account Creation</SubHeader>
              <Body>
                To access the full features of the Service, you must register for an account. You agree to provide accurate, current, and complete information during the registration process and to keep your account information updated at all times. Providing false or misleading information constitutes a material breach of these Terms.
              </Body>
              <SubHeader>4.2 Account Security</SubHeader>
              <Body>
                You are solely responsible for maintaining the confidentiality of your login credentials, including your username and password. You agree to:
              </Body>
              <BulletList items={[
                "Choose a strong, unique password that you do not use for other services",
                "Enable two-factor authentication (2FA) where available",
                "Never share your account credentials with third parties",
                "Log out of your account after each session on shared devices",
                "Notify us immediately at security@artixpos.com if you suspect unauthorized access",
              ]} />
              <Body>
                You are fully responsible for all activities that occur under your account, whether or not authorized by you. ArtixPOS shall not be liable for any loss or damage arising from your failure to comply with these security obligations.
              </Body>
              <SubHeader>4.3 Staff Accounts</SubHeader>
              <Body>
                As an account owner or administrator, you may create sub-accounts for your staff members. You are fully responsible for all actions taken by staff accounts under your workspace, including ensuring that all staff members comply with these Terms. You must immediately revoke access for any staff member who no longer requires it.
              </Body>
              <SubHeader>4.4 Account Verification</SubHeader>
              <Body>
                We reserve the right to verify your identity and the accuracy of your account information. You agree to provide any documentation or information we may reasonably request for this purpose. Failure to provide such information may result in suspension or termination of your account.
              </Body>
            </section>

            {/* 5 */}
            <section>
              <SectionAnchor id="subscriptions" />
              <SectionHeader num="5" title="Subscriptions & Billing" />
              <SubHeader>5.1 Subscription Plans</SubHeader>
              <Body>
                ArtixPOS offers various subscription plans, including a free tier and paid Pro plans. Plan features, pricing, and limitations are described on our pricing page and may be updated from time to time. We will provide advance notice of any pricing changes.
              </Body>
              <SubHeader>5.2 Billing Cycle</SubHeader>
              <Body>
                Paid subscriptions are billed in advance on a recurring basis — either monthly or annually, depending on the plan you select. Your subscription begins on the date you complete the purchase and renews automatically at the end of each billing period unless cancelled.
              </Body>
              <SubHeader>5.3 Payment Processing</SubHeader>
              <Body>
                Payments are processed through PayMongo, a licensed payment service provider. By subscribing to a paid plan, you authorize us to charge your designated payment method for the applicable subscription fees. You must provide valid, current payment information. If your payment method fails, we reserve the right to suspend or downgrade your account after providing reasonable notice.
              </Body>
              <SubHeader>5.4 Price Changes</SubHeader>
              <Body>
                We reserve the right to change our subscription prices. We will notify you of any price change at least 30 days before it takes effect. Price changes will apply to your next billing cycle after the notice period. Continued use of the Service after a price change constitutes your acceptance of the new pricing.
              </Body>
              <SubHeader>5.5 Taxes</SubHeader>
              <Body>
                All fees are exclusive of applicable taxes, levies, or duties imposed by taxing authorities. You are responsible for all applicable taxes associated with your use of the Service, except for taxes based on ArtixPOS's net income.
              </Body>
            </section>

            {/* 6 */}
            <section>
              <SectionAnchor id="free-plan" />
              <SectionHeader num="6" title="Free Plan" />
              <Body>
                ArtixPOS offers a free tier with no time limit. The free plan is subject to feature limitations as described on our pricing page. We reserve the right to modify the features included in the free plan at any time, with reasonable advance notice. Free plan users receive community-level support only.
              </Body>
              <Body>
                Excessive use of the free tier in a manner inconsistent with fair personal or small-business use may result in account review or, at our discretion, a request to upgrade to a paid plan. We define "excessive use" as automated bulk operations, API abuse, or usage that materially impacts system performance for other users.
              </Body>
            </section>

            {/* 7 */}
            <section>
              <SectionAnchor id="refunds" />
              <SectionHeader num="7" title="Refunds & Cancellations" />
              <SubHeader>7.1 Cancellation</SubHeader>
              <Body>
                You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of your current billing period. You will retain access to paid features until the end of the period for which you have already paid.
              </Body>
              <SubHeader>7.2 Refund Policy</SubHeader>
              <Body>
                We do not offer refunds for partial billing periods. Subscription fees are non-refundable once a billing period has commenced. However, we review refund requests on a case-by-case basis and may issue refunds at our sole discretion in the following circumstances:
              </Body>
              <BulletList items={[
                "Significant service outages exceeding 24 consecutive hours due to ArtixPOS infrastructure failures",
                "Double-billing or clear billing errors on our part",
                "Newly subscribed users who request a refund within 7 days of their first paid subscription and have not made significant use of paid features",
              ]} />
              <Body>
                To request a refund, contact us at billing@artixpos.com with your account details and the reason for your request. Refund decisions are made within 10 business days.
              </Body>
              <SubHeader>7.3 Downgrading</SubHeader>
              <Body>
                If you downgrade your plan, you will retain your current plan's features until the end of the billing period. No partial refunds are issued for the difference between plans during an active billing period.
              </Body>
            </section>

            {/* 8 */}
            <section>
              <SectionAnchor id="acceptable-use" />
              <SectionHeader num="8" title="Acceptable Use Policy" />
              <Body>
                You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to use the Service to:
              </Body>
              <BulletList items={[
                "Violate any applicable national, regional, or local laws or regulations",
                "Process fraudulent transactions, money laundering, or any other illegal financial activity",
                "Transmit or upload any harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable content",
                "Impersonate any person or entity, or falsely represent your affiliation with any person or entity",
                "Upload, transmit, or distribute any malware, viruses, or other malicious code",
                "Attempt to gain unauthorized access to the Service, its related systems, or the accounts of other users",
                "Reverse-engineer, decompile, disassemble, or attempt to derive the source code of the Service",
                "Scrape, crawl, or use automated means to access or extract data from the Service",
                "Use the Service to develop a competing product or service",
                "Resell, sublicense, or otherwise commercially exploit the Service without our express written consent",
                "Interfere with or disrupt the integrity or performance of the Service or data contained therein",
                "Circumvent any access controls, usage limits, or security measures",
                "Use the Service in any manner that could damage, disable, overburden, or impair our servers or networks",
              ]} />
              <Body>
                We reserve the right to investigate and take appropriate action against any user who, in our sole discretion, violates this Acceptable Use Policy, including suspending or terminating accounts and reporting to law enforcement authorities.
              </Body>
            </section>

            {/* 9 */}
            <section>
              <SectionAnchor id="intellectual-property" />
              <SectionHeader num="9" title="Intellectual Property" />
              <SubHeader>9.1 Ownership</SubHeader>
              <Body>
                The Service and its original content, features, functionality, underlying technology, design, and all associated intellectual property rights are and shall remain the exclusive property of ArtixPOS and its licensors. This includes, without limitation, all software code, algorithms, user interface designs, graphics, logos, trademarks, and trade names associated with ArtixPOS.
              </Body>
              <SubHeader>9.2 License to Use</SubHeader>
              <Body>
                Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your internal business purposes. This license does not include any right to:
              </Body>
              <BulletList items={[
                "Sublicense, sell, resell, transfer, assign, or otherwise commercially exploit the Service",
                "Modify, adapt, translate, or create derivative works based on the Service",
                "Reproduce or duplicate any part of the Service outside of the Service itself",
                "Use the Service for the benefit of any third party without prior written consent",
              ]} />
              <SubHeader>9.3 Feedback</SubHeader>
              <Body>
                If you provide us with feedback, suggestions, or ideas regarding the Service ("Feedback"), you grant us a worldwide, perpetual, irrevocable, royalty-free license to use, reproduce, modify, and incorporate such Feedback into the Service without any obligation to you.
              </Body>
              <SubHeader>9.4 Trademarks</SubHeader>
              <Body>
                "ArtixPOS," the ArtixPOS logo, and other ArtixPOS trademarks and service marks are the exclusive property of ArtixPOS. You may not use these marks without our prior written permission.
              </Body>
            </section>

            {/* 10 */}
            <section>
              <SectionAnchor id="user-content" />
              <SectionHeader num="10" title="User Content & Data" />
              <SubHeader>10.1 Your Data Ownership</SubHeader>
              <Body>
                All business data you input into the Service — including products, customer records, sales transactions, inventory data, staff information, and financial records ("User Data") — remains your property. We make no claim of ownership over your User Data.
              </Body>
              <SubHeader>10.2 License to Host Your Data</SubHeader>
              <Body>
                By using the Service, you grant us a limited, non-exclusive, worldwide license to host, store, process, display, and transmit your User Data solely for the purpose of providing the Service to you. This license terminates upon deletion of your account.
              </Body>
              <SubHeader>10.3 Data Accuracy</SubHeader>
              <Body>
                You are solely responsible for the accuracy, legality, and completeness of all User Data you upload, input, or transmit through the Service. We are not responsible for any errors, inaccuracies, or illegal content in your User Data.
              </Body>
              <SubHeader>10.4 Data Export</SubHeader>
              <Body>
                You may export your User Data at any time through the export tools provided in the Service. We strongly recommend maintaining regular backups of your data outside the Service.
              </Body>
              <SubHeader>10.5 Data Deletion</SubHeader>
              <Body>
                Upon account deletion, we will delete your User Data from our active systems within 30 days. Residual copies in backup systems will be purged within 90 days. Note that data you have shared with third-party integrations may be subject to those third parties' data retention policies.
              </Body>
              <SubHeader>10.6 Aggregated Data</SubHeader>
              <Body>
                We may use anonymized, aggregated, non-personally-identifiable data derived from your use of the Service for product improvement, benchmarking, and research purposes. This data will never identify you individually.
              </Body>
            </section>

            {/* 11 */}
            <section>
              <SectionAnchor id="third-party" />
              <SectionHeader num="11" title="Third-Party Services" />
              <Body>
                The Service integrates with or makes use of certain third-party services ("Third-Party Services"). These may include:
              </Body>
              <BulletList items={[
                "PayMongo — for payment processing and subscription management",
                "Google and Facebook — for optional OAuth authentication",
                "Groq, Cerebras, and Mistral — for AI assistant features",
                "Upstash — for caching and rate limiting infrastructure",
                "Sentry — for error monitoring and service reliability",
              ]} />
              <Body>
                Your use of Third-Party Services is subject to those services' own terms of service and privacy policies. We are not responsible for the availability, accuracy, or practices of any Third-Party Services. We do not endorse and are not responsible for any Third-Party Services. Your relationship with third-party providers is solely between you and them.
              </Body>
              <Body>
                We reserve the right to add, modify, or remove Third-Party Service integrations at any time. If a Third-Party Service becomes unavailable, we will use commercially reasonable efforts to provide a comparable alternative.
              </Body>
            </section>

            {/* 12 */}
            <section>
              <SectionAnchor id="privacy" />
              <SectionHeader num="12" title="Privacy" />
              <Body>
                Your privacy is important to us. Our Privacy Policy, available at <a href="/privacy" style={{ color: BLUE, textDecoration: "none", borderBottom: `1px solid rgba(20,184,232,0.3)` }}>/privacy</a>, describes how we collect, use, store, and share information about you and your use of the Service. By using the Service, you consent to the collection and use of your information as described in our Privacy Policy.
              </Body>
              <Body>
                The Privacy Policy is incorporated into and made a part of these Terms. To the extent there is a conflict between these Terms and the Privacy Policy with respect to privacy matters, the Privacy Policy shall govern.
              </Body>
            </section>

            {/* 13 */}
            <section>
              <SectionAnchor id="confidentiality" />
              <SectionHeader num="13" title="Confidentiality" />
              <Body>
                Each party agrees to keep confidential all non-public information of the other party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information ("Confidential Information"). Each party agrees to:
              </Body>
              <BulletList items={[
                "Use Confidential Information only as necessary to fulfill its obligations under these Terms",
                "Protect Confidential Information using at least the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care",
                "Not disclose Confidential Information to any third party without the other party's prior written consent",
                "Limit access to Confidential Information to those employees, agents, and contractors who need it to fulfill their obligations",
              ]} />
              <Body>
                These obligations do not apply to information that: (a) becomes publicly available other than through a breach of this Agreement; (b) was already known to the receiving party; (c) is independently developed by the receiving party; or (d) must be disclosed by law, regulation, or court order.
              </Body>
            </section>

            {/* 14 */}
            <section>
              <SectionAnchor id="warranties" />
              <SectionHeader num="14" title="Disclaimers & Warranties" />
              <Body>
                <strong style={{ color: "rgba(255,255,255,0.80)" }}>THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.</strong> To the maximum extent permitted by applicable law, ArtixPOS expressly disclaims all warranties, including but not limited to:
              </Body>
              <BulletList items={[
                "Implied warranties of merchantability, fitness for a particular purpose, and non-infringement",
                "Any warranty that the Service will meet your requirements or expectations",
                "Any warranty that the Service will be uninterrupted, timely, secure, or error-free",
                "Any warranty regarding the accuracy, reliability, or completeness of any information provided through the Service",
                "Any warranty that defects in the Service will be corrected",
              ]} />
              <Body>
                ArtixPOS does not warrant that the Service is free of viruses or other harmful components. You are responsible for implementing sufficient security measures for your particular use case.
              </Body>
              <Body>
                Some jurisdictions do not allow the exclusion of implied warranties. In such cases, the above exclusions may not fully apply to you, and you may have additional rights under applicable consumer protection laws.
              </Body>
            </section>

            {/* 15 */}
            <section>
              <SectionAnchor id="liability" />
              <SectionHeader num="15" title="Limitation of Liability" />
              <Body>
                <strong style={{ color: "rgba(255,255,255,0.80)" }}>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ARTIXPOS, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, PARTNERS, OR LICENSORS BE LIABLE FOR ANY:</strong>
              </Body>
              <BulletList items={[
                "Indirect, incidental, special, consequential, or punitive damages",
                "Loss of profits, revenue, business, data, or goodwill",
                "Cost of procurement of substitute goods or services",
                "Damages resulting from unauthorized access to or alteration of your data",
                "Damages arising from your reliance on information obtained from the Service",
                "Damages arising from any interruption or cessation of the Service",
              ]} />
              <Body>
                In all cases, ArtixPOS's aggregate liability to you for any claims arising out of or related to these Terms or the Service shall not exceed the greater of: (a) the total fees paid by you to ArtixPOS in the twelve (12) months preceding the claim; or (b) one hundred Philippine Pesos (PHP 100.00).
              </Body>
              <Body>
                The limitations above are fundamental elements of the basis of the bargain between ArtixPOS and you, and apply even if ArtixPOS has been advised of the possibility of such damages.
              </Body>
            </section>

            {/* 16 */}
            <section>
              <SectionAnchor id="indemnification" />
              <SectionHeader num="16" title="Indemnification" />
              <Body>
                You agree to defend, indemnify, and hold harmless ArtixPOS, its parent, subsidiaries, affiliates, officers, directors, employees, agents, and licensors from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including attorneys' fees) arising from or related to:
              </Body>
              <BulletList items={[
                "Your use of or inability to use the Service",
                "Your violation of these Terms",
                "Your violation of any third party's rights, including intellectual property or privacy rights",
                "Your User Data, including any claim that your User Data infringes, misappropriates, or violates any third-party rights",
                "Any transactions conducted through your account",
                "Your violation of any applicable law or regulation",
              ]} />
              <Body>
                We reserve the right, at your expense, to assume the exclusive defense and control of any matter subject to indemnification by you. You agree to cooperate with our defense of such claims.
              </Body>
            </section>

            {/* 17 */}
            <section>
              <SectionAnchor id="termination" />
              <SectionHeader num="17" title="Termination" />
              <SubHeader>17.1 Termination by You</SubHeader>
              <Body>
                You may terminate your account at any time by following the account deletion process in your account settings. Termination will take effect upon completion of the current billing period. You remain responsible for all outstanding fees up to the termination date.
              </Body>
              <SubHeader>17.2 Termination by ArtixPOS</SubHeader>
              <Body>
                We may suspend or terminate your account and access to the Service, with or without notice, for any of the following reasons:
              </Body>
              <BulletList items={[
                "Violation of these Terms, including the Acceptable Use Policy",
                "Non-payment of applicable fees after reasonable notice",
                "Fraudulent, abusive, or illegal activity associated with your account",
                "Extended periods of inactivity on free accounts (with at least 60 days' notice)",
                "Regulatory requirements or legal obligations requiring termination",
                "Discontinuation of the Service (with at least 90 days' notice for paid subscribers)",
              ]} />
              <SubHeader>17.3 Effect of Termination</SubHeader>
              <Body>
                Upon termination for any reason: (a) all licenses granted to you terminate immediately; (b) you must cease all use of the Service; (c) we will delete your User Data in accordance with Section 10.5. Termination does not relieve you of any payment obligations incurred prior to termination. Sections 9, 10.6, 13, 14, 15, 16, and 19–22 survive termination.
              </Body>
            </section>

            {/* 18 */}
            <section>
              <SectionAnchor id="modifications" />
              <SectionHeader num="18" title="Modifications to Service" />
              <Body>
                We reserve the right to modify, update, or discontinue the Service (or any part thereof) at any time. We will make commercially reasonable efforts to provide advance notice of material changes, particularly those that affect core functionality.
              </Body>
              <Body>
                For discontinuation of the Service entirely or removal of material features included in a paid plan, we will provide at least 90 days' advance notice to paid subscribers and offer a pro-rata refund of any prepaid subscription fees for the affected period.
              </Body>
              <Body>
                For minor modifications, updates, bug fixes, or security patches, we may proceed without prior notice. We will publish a changelog accessible within the application.
              </Body>
            </section>

            {/* 19 */}
            <section>
              <SectionAnchor id="governing-law" />
              <SectionHeader num="19" title="Governing Law" />
              <Body>
                These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines, without regard to its conflict of law provisions. The United Nations Convention on Contracts for the International Sale of Goods (CISG) does not apply to these Terms.
              </Body>
              <Body>
                If you are a consumer resident in a jurisdiction with mandatory consumer protection laws that provide greater protection than the Philippines laws referenced above, such mandatory protections shall apply to you.
              </Body>
            </section>

            {/* 20 */}
            <section>
              <SectionAnchor id="dispute" />
              <SectionHeader num="20" title="Dispute Resolution" />
              <SubHeader>20.1 Informal Resolution</SubHeader>
              <Body>
                Before initiating any formal dispute resolution proceeding, both parties agree to first attempt to resolve any dispute informally. You must notify us at legal@artixpos.com with a written description of the dispute. We will attempt to resolve it within 30 days of receipt.
              </Body>
              <SubHeader>20.2 Arbitration</SubHeader>
              <Body>
                If informal resolution fails, any dispute, controversy, or claim arising out of or relating to these Terms, or the breach, termination, or invalidity thereof, shall be finally settled by arbitration in accordance with the rules of the Philippine Dispute Resolution Center, Inc. (PDRCI), or any successor body. The arbitration shall take place in Metro Manila, Philippines, and shall be conducted in English. The arbitrator's award shall be final and binding.
              </Body>
              <SubHeader>20.3 Class Action Waiver</SubHeader>
              <Body>
                To the maximum extent permitted by applicable law, you waive any right to participate in a class action lawsuit or class-wide arbitration against ArtixPOS. All disputes must be brought in your individual capacity only.
              </Body>
              <SubHeader>20.4 Exceptions</SubHeader>
              <Body>
                Either party may seek emergency injunctive relief in a court of competent jurisdiction to prevent immediate and irreparable harm pending the outcome of arbitration. Nothing in this section prevents ArtixPOS from seeking collection of overdue fees in any appropriate court.
              </Body>
            </section>

            {/* 21 */}
            <section>
              <SectionAnchor id="miscellaneous" />
              <SectionHeader num="21" title="Miscellaneous" />
              <SubHeader>21.1 Entire Agreement</SubHeader>
              <Body>
                These Terms, together with our Privacy Policy and any order forms or service agreements, constitute the entire agreement between you and ArtixPOS regarding the Service and supersede all prior agreements, understandings, and negotiations.
              </Body>
              <SubHeader>21.2 Severability</SubHeader>
              <Body>
                If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions will continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it enforceable.
              </Body>
              <SubHeader>21.3 Waiver</SubHeader>
              <Body>
                Our failure to enforce any right or provision of these Terms will not constitute a waiver of such right or provision. A waiver of any obligation or default under these Terms will not operate as a waiver of any continuing or future default.
              </Body>
              <SubHeader>21.4 Assignment</SubHeader>
              <Body>
                You may not assign or transfer these Terms or your rights hereunder, in whole or in part, by operation of law or otherwise, without our prior written consent. We may assign these Terms without restriction. Any assignment in violation of this section shall be void.
              </Body>
              <SubHeader>21.5 Force Majeure</SubHeader>
              <Body>
                Neither party shall be liable for any failure or delay in performance to the extent caused by circumstances beyond that party's reasonable control, including acts of God, natural disasters, pandemic, war, terrorism, riots, embargoes, government actions, power outages, internet failures, or third-party service failures.
              </Body>
              <SubHeader>21.6 No Agency</SubHeader>
              <Body>
                Nothing in these Terms shall be construed to create a partnership, joint venture, agency, employment, or franchise relationship between you and ArtixPOS.
              </Body>
              <SubHeader>21.7 Updates to These Terms</SubHeader>
              <Body>
                We reserve the right to update these Terms at any time. We will notify you of material changes via email and/or a prominent notice in the Service at least 14 days before the changes take effect. Your continued use of the Service after the effective date of updated Terms constitutes your acceptance of those Terms. If you do not agree to the updated Terms, you must stop using the Service before the effective date.
              </Body>
            </section>

            {/* 22 */}
            <section>
              <SectionAnchor id="contact" />
              <SectionHeader num="22" title="Contact Information" />
              <Body>
                If you have any questions about these Terms of Service, please contact us:
              </Body>
              <InfoBox entries={[
                { label: "General inquiries", value: "support@artixpos.com" },
                { label: "Billing & subscriptions", value: "billing@artixpos.com" },
                { label: "Legal & compliance", value: "legal@artixpos.com" },
                { label: "Security issues", value: "security@artixpos.com" },
                { label: "Data / privacy requests", value: "privacy@artixpos.com" },
              ]} />
              <Body>
                We aim to respond to all inquiries within 2 business days.
              </Body>
            </section>

          </div>

          {/* Footer links */}
          <div style={{ marginTop: 72, paddingTop: 28, borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 24 }}>
              <a href="/privacy" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = BLUE)}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
              >Privacy Policy</a>
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
          <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)", minWidth: 160 }}>{label}</span>
          <a href={`mailto:${value}`} style={{ fontSize: 13.5, color: BLUE, textDecoration: "none", fontWeight: 500 }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
          >{value}</a>
        </div>
      ))}
    </div>
  );
}
