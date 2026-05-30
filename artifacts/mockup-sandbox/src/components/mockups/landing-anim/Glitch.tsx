import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
const NEON = "#00ffe0";
const NEON2 = "#ff00ff";
const RED = "#ff003c";

function useGlitchText(finalText: string, delay = 0) {
  const [text, setText] = useState(() => finalText.split("").map(() => " ").join(""));
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      let iter = 0;
      const total = finalText.length * 3;
      const interval = setInterval(() => {
        setText(finalText.split("").map((c, i) => {
          if (c === " ") return " ";
          if (i < iter / 3) return c;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        }).join(""));
        iter++;
        if (iter >= total) {
          clearInterval(interval);
          setText(finalText);
          setDone(true);
        }
      }, 40);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timer);
  }, [finalText, delay]);

  return { text, done };
}

function ScanLines() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 999,
      backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
    }} />
  );
}

function GlitchBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const glitch = () => {
      if (Math.random() > 0.92) {
        const dx = (Math.random() - 0.5) * 6;
        const dy = (Math.random() - 0.5) * 3;
        el.style.transform = `translate(${dx}px,${dy}px)`;
        el.style.filter = `hue-rotate(${Math.random() * 30}deg)`;
        setTimeout(() => { el.style.transform = ""; el.style.filter = ""; }, 80);
      }
    };
    const id = setInterval(glitch, 600);
    return () => clearInterval(id);
  }, []);
  return <div ref={ref} style={{ transition: "transform 0.05s, filter 0.05s", ...style }}>{children}</div>;
}

export function Glitch() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const title1 = useGlitchText("THE SYSTEM", 200);
  const title2 = useGlitchText("THAT NEVER", 800);
  const title3 = useGlitchText("SLEEPS", 1400);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".nav-el", { opacity: 0, x: -20 });
      gsap.set(".badge-el", { opacity: 0, scale: 0.7, skewX: -8 });
      gsap.set(".sub-el", { opacity: 0 });
      gsap.set(".cta-el", { opacity: 0, y: 20 });
      gsap.set(".dash-el", { opacity: 0, x: 60, skewX: -4 });

      const tl = gsap.timeline();
      tl.to(".nav-el", { opacity: 1, x: 0, stagger: 0.06, duration: 0.5, ease: "power2.out" })
        .to(".badge-el", { opacity: 1, scale: 1, skewX: 0, duration: 0.5, ease: "back.out(2)" }, 0.8)
        .to(".sub-el", { opacity: 1, duration: 0.6 }, 1.8)
        .to(".cta-el", { opacity: 1, y: 0, stagger: 0.1, duration: 0.5, ease: "power2.out" }, 2.0)
        .to(".dash-el", { opacity: 1, x: 0, skewX: 0, duration: 0.7, ease: "power3.out" }, 1.5);

      if (scanRef.current) {
        gsap.to(scanRef.current, {
          yPercent: 120, duration: 1.2, ease: "power1.inOut",
          scrollTrigger: { trigger: containerRef.current, start: "top top", end: "bottom bottom", scrub: 0.5 }
        });
      }

      gsap.utils.toArray<HTMLElement>(".grid-card").forEach((el, i) => {
        gsap.set(el, { opacity: 0, y: 30, rotateX: 15, transformPerspective: 800 });
        ScrollTrigger.create({
          trigger: el,
          start: "top 90%",
          onEnter: () => gsap.to(el, { opacity: 1, y: 0, rotateX: 0, duration: 0.6, delay: i * 0.08, ease: "back.out(1.3)" }),
          once: true
        });
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const bars = [40, 65, 50, 80, 55, 92, 68, 78, 50, 100, 72, 88];

  return (
    <div ref={containerRef} style={{ background: "#020408", color: "#e0ffe0", fontFamily: "'Courier New', monospace", minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <ScanLines />

      {/* SCAN LINE SWEEP */}
      <div ref={scanRef} style={{ position: "fixed", top: "-10%", left: 0, right: 0, height: "10%", background: "linear-gradient(180deg,transparent,rgba(0,255,224,0.04),transparent)", pointerEvents: "none", zIndex: 50 }} />

      {/* BG GRID */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: `linear-gradient(rgba(0,255,224,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,224,0.04) 1px,transparent 1px)`, backgroundSize: "40px 40px", pointerEvents: "none" }} />

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(2,4,8,0.95)", borderBottom: `1px solid rgba(0,255,224,0.15)`, padding: "0 40px", height: 60, display: "flex", alignItems: "center", gap: 0 }}>
        <GlitchBox style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
          <div className="nav-el" style={{ width: 30, height: 30, borderRadius: 6, border: `1.5px solid ${NEON}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 14px ${NEON}44` }}>
            <span style={{ color: NEON, fontSize: 12, fontWeight: 900 }}>A</span>
          </div>
          <span className="nav-el" style={{ color: NEON, fontWeight: 900, fontSize: 14, letterSpacing: "0.2em", textShadow: `0 0 12px ${NEON}` }}>ARTIXPOS</span>
        </GlitchBox>
        {["SYSTEM", "PRICING", "DOCS"].map(l => (
          <span key={l} className="nav-el" style={{ marginLeft: 32, fontSize: 11, fontWeight: 700, color: "rgba(0,255,224,0.5)", letterSpacing: "0.15em", cursor: "pointer" }}>{l}</span>
        ))}
        <button className="nav-el" style={{ marginLeft: 28, padding: "7px 18px", borderRadius: 4, background: "transparent", border: `1px solid ${NEON}`, color: NEON, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", cursor: "pointer", boxShadow: `0 0 12px ${NEON}44` }}>
          ACCESS_
        </button>
      </nav>

      {/* HERO */}
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "70px 40px 60px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
        <div>
          <div className="badge-el" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", border: `1px solid ${RED}66`, background: `${RED}11`, borderRadius: 3, fontSize: 10, fontWeight: 700, color: RED, letterSpacing: "0.15em", marginBottom: 24, textShadow: `0 0 8px ${RED}` }}>
            ▶ SYSTEM_ONLINE :: BUILD_2026.05
          </div>
          <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 900 }}>
            <div style={{ fontSize: 58, lineHeight: 1.05, letterSpacing: "-0.01em", color: NEON, textShadow: `0 0 30px ${NEON}44, 0 0 60px ${NEON}22` }}>
              {title1.text}
            </div>
            <div style={{ fontSize: 58, lineHeight: 1.05, letterSpacing: "-0.01em", color: "#fff" }}>
              {title2.text}
            </div>
            <div style={{ fontSize: 58, lineHeight: 1.05, letterSpacing: "-0.01em", color: NEON2, textShadow: `0 0 30px ${NEON2}44` }}>
              {title3.text}<span style={{ animation: "blink 1s step-end infinite", color: NEON }}>_</span>
            </div>
          </div>
          <p className="sub-el" style={{ fontSize: 14, color: "rgba(0,255,224,0.55)", lineHeight: 1.7, marginTop: 20, marginBottom: 32, maxWidth: 440, letterSpacing: "0.03em" }}>
            {"> "}INITIALIZING advanced point-of-sale interface.<br />
            {"> "}Real-time sync. AI forecasting. Zero downtime.<br />
            {"> "}READY TO DEPLOY.
          </p>
          <div className="cta-el" style={{ display: "flex", gap: 12 }}>
            <button style={{ padding: "12px 28px", borderRadius: 4, background: NEON, border: "none", color: "#020408", fontWeight: 900, fontSize: 12, letterSpacing: "0.12em", cursor: "pointer", boxShadow: `0 0 24px ${NEON}66`, fontFamily: "inherit" }}>
              INITIALIZE →
            </button>
            <button style={{ padding: "12px 22px", borderRadius: 4, background: "transparent", border: `1px solid rgba(0,255,224,0.3)`, color: "rgba(0,255,224,0.7)", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", cursor: "pointer", fontFamily: "inherit" }}>
              [VIEW_DEMO]
            </button>
          </div>
        </div>
        <div className="dash-el" style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${NEON}33`, background: "#010305", boxShadow: `0 0 40px ${NEON}11, inset 0 0 40px rgba(0,0,0,0.5)` }}>
          <div style={{ padding: "10px 16px", background: `${NEON}08`, borderBottom: `1px solid ${NEON}22`, display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
            <span style={{ color: NEON, fontSize: 9, letterSpacing: "0.1em" }}>ARTIXPOS :: DASHBOARD</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
              {[NEON, NEON2, RED].map(c => <div key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c, opacity: 0.7, boxShadow: `0 0 5px ${c}` }} />)}
            </div>
          </div>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
              {[{ l: "SALES_TODAY", v: "₱24,850", d: "+12.4%", c: NEON }, { l: "ORDERS_CNT", v: "137", d: "+8.1%", c: NEON2 }, { l: "STAFF_ACT", v: "9/12", d: "ACTIVE", c: "#f59e0b" }].map((s, i) => (
                <div key={i} style={{ padding: "10px 11px", borderRadius: 6, background: `${NEON}06`, border: `1px solid ${NEON}18` }}>
                  <div style={{ fontSize: 7.5, color: NEON, fontWeight: 700, marginBottom: 5, letterSpacing: "0.08em" }}>{s.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#e0ffe0", marginBottom: 2 }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: s.c, fontWeight: 600 }}>{s.d}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32, marginBottom: 12, padding: "0 2px" }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, borderRadius: 2, height: `${h}%`, background: i === 9 ? NEON : `${NEON}${Math.round(30 + (h / 100) * 80).toString(16)}`, boxShadow: i === 9 ? `0 0 8px ${NEON}88` : "none" }} />
              ))}
            </div>
            <div style={{ fontSize: 8.5, color: `${NEON}55`, letterSpacing: "0.08em" }}>REVENUE_STREAM :: LAST_12H</div>
          </div>
        </div>
      </div>

      {/* FEATURES GRID */}
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "20px 40px 100px" }}>
        <div style={{ fontSize: 11, color: NEON, letterSpacing: "0.2em", fontWeight: 700, marginBottom: 8 }}>// SYSTEM_MODULES</div>
        <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "0.05em", marginBottom: 40, color: "#fff" }}>CORE FEATURES</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {[
            { icon: "⚡", id: "MOD_01", title: "REALTIME_POS", desc: "Sub-100ms response. Offline-first architecture. Zero single points of failure." },
            { icon: "🤖", id: "MOD_02", title: "AI_ENGINE", desc: "Predictive demand forecasting and auto-reorder triggers powered by ML." },
            { icon: "📊", id: "MOD_03", title: "ANALYTICS_LIVE", desc: "Multi-branch data streams with live aggregation and anomaly detection." },
            { icon: "👥", id: "MOD_04", title: "STAFF_SYS", desc: "PIN-based clock-in, shift optimizer, integrated payroll pipeline." },
            { icon: "📦", id: "MOD_05", title: "INVENTORY_MGR", desc: "Smart stock tracking, expiry alerts, waste metrics, and supplier sync." },
            { icon: "🔒", id: "MOD_06", title: "SECURITY_LVL5", desc: "Role-based access matrix, immutable audit logs, SOC 2 compliant." },
          ].map((f, i) => (
            <div key={i} className="grid-card" style={{ padding: "22px", borderRadius: 6, background: `${NEON}04`, border: `1px solid ${NEON}18`, cursor: "default", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 12, right: 14, fontSize: 8, color: `${NEON}44`, fontWeight: 700 }}>{f.id}</div>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: NEON, letterSpacing: "0.1em", marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "rgba(0,255,224,0.5)", lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
