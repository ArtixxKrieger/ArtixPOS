import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const VIOLET = "#7c3aed";
const PINK = "#ec4899";
const GOLD = "#f59e0b";
const CYAN = "#06b6d4";

function splitChars(text: string, baseDelay = 0, color?: string) {
  return text.split("").map((c, i) => (
    <span key={i} className="char" style={{ display: "inline-block", color: color, willChange: "transform, opacity" }}>
      {c === " " ? "\u00a0" : c}
    </span>
  ));
}

export function Flow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const parallax1Ref = useRef<HTMLDivElement>(null);
  const parallax2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".char", { opacity: 0, y: 60, rotateZ: 4 });
      gsap.set(".hero-elem", { opacity: 0, y: 50 });
      gsap.set(".dash-panel", { opacity: 0, scale: 0.93, y: 40 });
      gsap.set(".orb", { scale: 0.6, opacity: 0 });

      const tl = gsap.timeline({ delay: 0.2, defaults: { ease: "expo.out" } });
      tl.to(".orb", { scale: 1, opacity: 1, duration: 1.6, stagger: 0.3, ease: "power2.out" })
        .to(".char", { opacity: 1, y: 0, rotateZ: 0, duration: 0.9, stagger: 0.018, ease: "expo.out" }, 0.4)
        .to(".hero-elem", { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "expo.out" }, 0.9)
        .to(".dash-panel", { opacity: 1, scale: 1, y: 0, duration: 1.1, ease: "expo.out" }, 0.7);

      if (parallax1Ref.current) {
        gsap.to(parallax1Ref.current, {
          yPercent: -25,
          scrollTrigger: { trigger: containerRef.current, start: "top top", end: "bottom bottom", scrub: 1.5 }
        });
      }
      if (parallax2Ref.current) {
        gsap.to(parallax2Ref.current, {
          yPercent: -12,
          scrollTrigger: { trigger: containerRef.current, start: "top top", end: "bottom bottom", scrub: 2 }
        });
      }

      gsap.utils.toArray<HTMLElement>(".flow-card").forEach((el, i) => {
        gsap.set(el, { opacity: 0, y: 60, scale: 0.97 });
        ScrollTrigger.create({
          trigger: el,
          start: "top 88%",
          onEnter: () => gsap.to(el, { opacity: 1, y: 0, scale: 1, duration: 0.85, delay: i * 0.1, ease: "expo.out" }),
          once: true
        });
      });

      gsap.utils.toArray<HTMLElement>(".flow-stat").forEach((el, i) => {
        gsap.set(el, { opacity: 0, x: i % 2 === 0 ? -40 : 40 });
        ScrollTrigger.create({
          trigger: el,
          start: "top 87%",
          onEnter: () => gsap.to(el, { opacity: 1, x: 0, duration: 0.9, delay: i * 0.1, ease: "expo.out" }),
          once: true
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const bars = [40, 65, 50, 80, 55, 92, 68, 78, 50, 100, 72, 88];

  const gradient = `linear-gradient(135deg, #0a0612 0%, #0d0a1a 50%, #060810 100%)`;

  return (
    <div ref={containerRef} style={{ background: gradient, color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", overflowX: "hidden", position: "relative" }}>
      {/* PARALLAX ORBS */}
      <div ref={parallax1Ref} style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div className="orb" style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 65%)", top: -200, left: -180 }} />
        <div className="orb" style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 65%)", top: 200, right: -160 }} />
      </div>
      <div ref={parallax2Ref} style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div className="orb" style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 65%)", bottom: 0, left: "40%" }} />
      </div>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(28px)", background: "rgba(10,6,18,0.8)", borderBottom: "1px solid rgba(124,58,237,0.12)", padding: "0 44px", height: 64, display: "flex", alignItems: "center" }}>
        <div className="hero-elem" style={{ display: "flex", alignItems: "center", gap: 11, marginRight: "auto" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${VIOLET},${PINK})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 20px ${VIOLET}55` }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, background: `linear-gradient(90deg,#fff,rgba(255,255,255,0.7))`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ArtixPOS</span>
        </div>
        {["Features", "Pricing", "Blog"].map(l => (
          <span key={l} className="hero-elem" style={{ marginLeft: 36, fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>{l}</span>
        ))}
        <button className="hero-elem" style={{ marginLeft: 28, padding: "9px 22px", borderRadius: 10, background: `linear-gradient(135deg,${VIOLET},${PINK})`, border: "none", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", boxShadow: `0 6px 24px ${VIOLET}44` }}>
          Get Started
        </button>
      </nav>

      {/* HERO */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "82px 44px 64px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <div className="hero-elem" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 100, background: `linear-gradient(90deg,${VIOLET}22,${PINK}22)`, border: "1px solid rgba(236,72,153,0.25)", fontSize: 12.5, fontWeight: 600, color: PINK, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: PINK, display: "inline-block", animation: "flowpulse 2.2s ease-in-out infinite" }} />
            Trusted by 10,000+ businesses worldwide
          </div>
          <h1 style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.035em", margin: "0 0 0", display: "block" }}>
            <div>{splitChars("Sell more.")}</div>
            <div style={{ background: `linear-gradient(90deg,${VIOLET},${PINK})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {splitChars("Stress less.")}
            </div>
            <div>{splitChars("Grow fast.")}</div>
          </h1>
          <p className="hero-elem" style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, margin: "24px 0 36px", maxWidth: 440 }}>
            The only POS that grows with your ambition. From your first sale to your hundredth location — ArtixPOS scales beautifully.
          </p>
          <div className="hero-elem" style={{ display: "flex", gap: 14 }}>
            <button style={{ padding: "15px 32px", borderRadius: 12, background: `linear-gradient(135deg,${VIOLET},${PINK})`, border: "none", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: `0 8px 32px ${VIOLET}44`, letterSpacing: "-0.01em" }}>
              Start Free — No CC
            </button>
            <button style={{ padding: "15px 24px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Watch Demo
            </button>
          </div>
        </div>
        <div className="dash-panel" style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(124,58,237,0.25)", background: "rgba(12,8,24,0.9)", boxShadow: `0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.08)`, backdropFilter: "blur(20px)" }}>
          <div style={{ padding: "12px 18px", background: "rgba(124,58,237,0.08)", borderBottom: "1px solid rgba(124,58,237,0.15)", display: "flex", alignItems: "center", gap: 7 }}>
            {[VIOLET, PINK, GOLD].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.7 }} />)}
            <span style={{ marginLeft: "auto", fontSize: 9.5, color: "rgba(255,255,255,0.22)", fontWeight: 500 }}>Dashboard · ArtixPOS</span>
          </div>
          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
              {[
                { l: "Revenue", v: "₱24,850", d: "+12%", c: VIOLET, bg: `${VIOLET}18` },
                { l: "Orders", v: "137", d: "+8%", c: PINK, bg: `${PINK}14` },
                { l: "Staff", v: "9/12", d: "online", c: GOLD, bg: `${GOLD}14` }
              ].map((s, i) => (
                <div key={i} style={{ padding: "13px 14px", borderRadius: 12, background: s.bg, border: `1px solid ${s.c}25` }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 3, letterSpacing: "-0.02em" }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: s.c, fontWeight: 700 }}>{s.d}</div>
                </div>
              ))}
            </div>
            <div style={{ borderRadius: 12, padding: "14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
                {bars.map((h, i) => (
                  <div key={i} style={{ flex: 1, borderRadius: 3, height: `${h}%`, background: `linear-gradient(180deg,${VIOLET}${Math.round(50 + h * 0.7).toString(16)},${PINK}${Math.round(30 + h * 0.5).toString(16)})` }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ l: "POS Live", c: CYAN }, { l: "AI Active", c: VIOLET }, { l: "2 Branches", c: PINK }].map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.c, boxShadow: `0 0 6px ${p.c}` }} />
                  <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>{p.l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 44px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
          {[
            { v: "10K+", l: "Active Businesses", c: VIOLET },
            { v: "99.9%", l: "Uptime", c: PINK },
            { v: "50M+", l: "Transactions Processed", c: GOLD },
            { v: "12", l: "Countries", c: CYAN },
          ].map((s, i) => (
            <div key={i} className="flow-stat" style={{ padding: "28px 24px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", textAlign: "center" }}>
              <div style={{ fontSize: 44, fontWeight: 900, background: `linear-gradient(135deg,${s.c},white)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.03em", marginBottom: 8 }}>{s.v}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 44px 100px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 14, background: `linear-gradient(90deg,#fff,rgba(255,255,255,0.6))`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Everything in one flow
          </h2>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 16.5 }}>No juggling apps. One platform, infinite possibilities.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {[
            { icon: "⚡", title: "Real-Time POS", desc: "Lightning-fast transactions with beautiful receipts and offline mode.", accent: VIOLET },
            { icon: "🤖", title: "AI Insights", desc: "Predict demand, detect trends, and get automated recommendations.", accent: PINK },
            { icon: "📊", title: "Live Dashboard", desc: "Every metric that matters, beautifully visualized across all locations.", accent: GOLD },
            { icon: "👥", title: "Team Tools", desc: "From PIN clock-in to payroll, manage your people effortlessly.", accent: CYAN },
            { icon: "📦", title: "Smart Inventory", desc: "Auto-reorder, waste reduction, supplier management — handled.", accent: VIOLET },
            { icon: "🔒", title: "Bank-Grade Security", desc: "Role-based access, audit trails, and enterprise-level encryption.", accent: PINK },
          ].map((f, i) => (
            <div key={i} className="flow-card" style={{ padding: "30px", borderRadius: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", cursor: "default", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${f.accent}88,transparent)` }} />
              <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.01em" }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.42)", lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes flowpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      `}</style>
    </div>
  );
}
