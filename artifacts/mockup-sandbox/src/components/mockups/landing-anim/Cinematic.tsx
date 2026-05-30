import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const BLUE = "#14b8e8";
const NEON = "#38d9f5";

function splitWords(text: string) {
  return text.split(" ").map((w, i) => (
    <span key={i} className="word-wrap" style={{ display: "inline-block", overflow: "hidden", marginRight: "0.25em" }}>
      <span className="word" style={{ display: "inline-block" }}>{w}</span>
    </span>
  ));
}

export function Cinematic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

      tl.set(".word", { yPercent: 110, opacity: 0 })
        .set(".hero-badge", { opacity: 0, y: 20, scale: 0.9 })
        .set(".hero-sub", { opacity: 0, y: 30 })
        .set(".hero-cta", { opacity: 0, y: 30, scale: 0.95 })
        .set(".dash-reveal", { opacity: 0, y: 80, rotateX: 18, transformPerspective: 1200, transformOrigin: "top center" })
        .set(".nav-item", { opacity: 0, y: -12 })
        .set(".stat-item", { opacity: 0, y: 40 });

      tl.to(".nav-item", { opacity: 1, y: 0, duration: 0.6, stagger: 0.07 })
        .to(".hero-badge", { opacity: 1, y: 0, scale: 1, duration: 0.7 }, "-=0.3")
        .to(".word", { yPercent: 0, opacity: 1, duration: 0.75, stagger: 0.05 }, "-=0.3")
        .to(".hero-sub", { opacity: 1, y: 0, duration: 0.8 }, "-=0.4")
        .to(".hero-cta", { opacity: 1, y: 0, scale: 1, duration: 0.7 }, "-=0.55")
        .to(".dash-reveal", { opacity: 1, y: 0, rotateX: 0, duration: 1.1, ease: "power3.out" }, "-=0.5");

      gsap.utils.toArray<HTMLElement>(".stat-item").forEach((el, i) => {
        const num = el.querySelector<HTMLElement>(".stat-num");
        const target = parseInt(el.dataset.target ?? "0", 10);
        ScrollTrigger.create({
          trigger: el,
          start: "top 85%",
          onEnter: () => {
            gsap.to(el, { opacity: 1, y: 0, duration: 0.6, delay: i * 0.1, ease: "power3.out" });
            if (num) {
              gsap.to({ val: 0 }, {
                val: target, duration: 1.6, ease: "power2.out", delay: i * 0.1,
                onUpdate: function () { num.textContent = Math.round(this.targets()[0].val).toLocaleString() + (el.dataset.suffix ?? ""); }
              });
            }
          },
          once: true
        });
      });

      gsap.utils.toArray<HTMLElement>(".feat-card").forEach((el, i) => {
        gsap.set(el, { opacity: 0, y: 50 });
        ScrollTrigger.create({
          trigger: el,
          start: "top 88%",
          onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.7, delay: i * 0.12, ease: "power3.out" }),
          once: true
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const bars = [40, 65, 50, 80, 55, 92, 68, 78, 50, 100, 72, 88];

  return (
    <div ref={containerRef} style={{ background: "#080e1a", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh", overflowX: "hidden" }}>
      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(24px)", background: "rgba(8,14,26,0.85)", borderBottom: "1px solid rgba(20,184,232,0.08)", padding: "0 40px", height: 64, display: "flex", alignItems: "center" }}>
        <div className="nav-item" style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${BLUE},#0e8ab3)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 22px rgba(20,184,232,0.45)` }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>ArtixPOS</span>
        </div>
        {["Features", "Pricing", "About"].map(l => (
          <span key={l} className="nav-item" style={{ marginLeft: 32, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>{l}</span>
        ))}
        <button className="nav-item" style={{ marginLeft: 28, padding: "8px 20px", borderRadius: 8, background: BLUE, border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: `0 4px 18px rgba(20,184,232,0.4)` }}>Sign In</button>
      </nav>

      {/* HERO */}
      <div ref={heroRef} style={{ maxWidth: 1160, margin: "0 auto", padding: "80px 40px 60px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
        <div>
          <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 100, background: "rgba(20,184,232,0.1)", border: `1px solid rgba(56,217,245,0.25)`, fontSize: 12, fontWeight: 600, color: NEON, marginBottom: 24 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: NEON, boxShadow: `0 0 8px ${NEON}`, animation: "pulse 2s infinite" }} />
            Now with AI-powered insights
          </div>
          <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.03em", margin: "0 0 20px" }}>
            <div>{splitWords("The POS that")}</div>
            <div style={{ color: NEON }}>{splitWords("runs your whole")}</div>
            <div>{splitWords("business")}</div>
          </h1>
          <p className="hero-sub" style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 32, maxWidth: 440 }}>
            Real-time sales, smart inventory, staff scheduling, and AI forecasting — all in one beautiful interface.
          </p>
          <div className="hero-cta" style={{ display: "flex", gap: 12 }}>
            <button style={{ padding: "14px 30px", borderRadius: 10, background: BLUE, border: "none", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: `0 6px 28px rgba(20,184,232,0.45)` }}>
              Start Free Trial
            </button>
            <button style={{ padding: "14px 24px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Watch Demo →
            </button>
          </div>
        </div>
        <div ref={dashRef} className="dash-reveal" style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(20,184,232,0.2)", background: "rgba(10,18,32,0.97)", boxShadow: "0 32px 90px rgba(0,0,0,0.6), 0 0 0 1px rgba(20,184,232,0.05)" }}>
          <div style={{ padding: "10px 16px", background: "rgba(20,184,232,0.06)", borderBottom: "1px solid rgba(20,184,232,0.1)", display: "flex", alignItems: "center", gap: 6 }}>
            {["#ef4444","#fbbf24","#22c55e"].map(c => <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.6 }} />)}
            <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>Dashboard · ArtixPOS</span>
          </div>
          <div style={{ padding: "18px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              {[{ l: "Today's Sales", v: "₱24,850", d: "+12%", c: NEON }, { l: "Orders", v: "137", d: "+8%", c: "#34d399" }, { l: "Active Staff", v: "9/12", d: "3 available", c: "#a78bfa" }].map((s, i) => (
                <div key={i} style={{ padding: "11px 13px", borderRadius: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.l}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 3 }}>{s.v}</div>
                  <div style={{ fontSize: 9.5, color: s.c, fontWeight: 700 }}>{s.d}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 38, marginBottom: 14 }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, borderRadius: 3, height: `${h}%`, background: `rgba(20,184,232,${0.15 + (h / 100) * 0.55})` }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {[{ l: "POS", v: "Live", c: NEON }, { l: "Offline", v: "Ready", c: "#34d399" }, { l: "AI", v: "Active", c: "#a78bfa" }].map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: p.c, boxShadow: `0 0 6px ${p.c}` }} />
                  <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{p.l}</span>
                  <span style={{ fontSize: 9.5, color: "#fff", fontWeight: 700 }}>{p.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 40px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24 }}>
          {[
            { label: "Businesses Trust Us", target: 10000, suffix: "+", color: NEON },
            { label: "Uptime SLA", target: 99, suffix: ".9%", color: "#34d399" },
            { label: "Transactions Daily", target: 50000, suffix: "+", color: "#a78bfa" },
            { label: "Countries Live", target: 12, suffix: "", color: "#f59e0b" },
          ].map((s, i) => (
            <div key={i} className="stat-item" data-target={s.target} data-suffix={s.suffix}
              style={{ padding: "28px 24px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", textAlign: "center" }}>
              <div className="stat-num" style={{ fontSize: 44, fontWeight: 900, color: s.color, lineHeight: 1, marginBottom: 8, letterSpacing: "-0.03em" }}>0</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 40px 100px" }}>
        <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 12, textAlign: "center" }}>Everything you need</h2>
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 16, marginBottom: 48 }}>Built for modern businesses that move fast.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            { icon: "⚡", title: "Real-Time POS", desc: "Sub-100ms transactions with offline fallback. Works when Wi-Fi doesn't." },
            { icon: "🤖", title: "AI Forecasting", desc: "Predict busy hours, optimal stock levels, and staffing needs automatically." },
            { icon: "📊", title: "Live Analytics", desc: "Beautiful dashboards that update in real-time across all your branches." },
            { icon: "👥", title: "Staff Management", desc: "PIN clock-in, shift scheduling, payroll tracking — all integrated." },
            { icon: "📦", title: "Smart Inventory", desc: "Auto-reorder alerts, supplier management, and waste tracking." },
            { icon: "🔒", title: "Enterprise Security", desc: "Role-based access, audit logs, and SOC 2 compliant infrastructure." },
          ].map((f, i) => (
            <div key={i} className="feat-card" style={{ padding: "28px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", cursor: "default" }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
