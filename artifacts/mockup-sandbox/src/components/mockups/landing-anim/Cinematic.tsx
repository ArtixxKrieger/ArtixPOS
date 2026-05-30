import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

const BLUE = "#14b8e8";
const NEON = "#38d9f5";
const BLUE2 = "#0e8ab3";

/* ── Helpers ─────────────────────────────────────────── */
function Char({ ch, cls }: { ch: string; cls: string }) {
  return (
    <span className={cls} style={{ display: "inline-block", transformStyle: "preserve-3d", willChange: "transform,opacity" }}>
      {ch === " " ? "\u00a0" : ch}
    </span>
  );
}

function Line3D({ text, cls, color }: { text: string; cls: string; color?: string }) {
  return (
    <div style={{ overflow: "hidden", display: "block", lineHeight: 1.05 }}>
      {text.split("").map((c, i) => (
        <Char key={i} ch={c} cls={cls} />
      ))}
    </div>
  );
}

/* ── Magnetic Button ─────────────────────────────────── */
function MagneticBtn({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      gsap.to(el, { x: dx * 0.28, y: dy * 0.28, duration: 0.4, ease: "power2.out" });
    };
    const onLeave = () => gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1,0.4)" });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); };
  }, []);
  return (
    <button ref={ref} style={{
      padding: "15px 34px", borderRadius: 12, border: primary ? "none" : "1.5px solid rgba(255,255,255,0.14)",
      background: primary ? `linear-gradient(135deg,${BLUE},${BLUE2})` : "rgba(255,255,255,0.05)",
      color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", willChange: "transform",
      boxShadow: primary ? `0 8px 32px rgba(20,184,232,0.45)` : "none",
      fontFamily: "inherit", letterSpacing: "-0.01em",
    }}>
      {children}
    </button>
  );
}

/* ── 3D Dashboard Card ───────────────────────────────── */
function Dashboard3D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;

    const onMove = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5 → 0.5
      const ny = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(card, {
        rotateY: nx * 22,
        rotateX: -ny * 16,
        duration: 0.55,
        ease: "power2.out",
        transformPerspective: 900,
        transformOrigin: "center center",
      });
      // Parallax inner layers
      gsap.to(".dash-layer-1", { x: nx * -14, y: ny * -10, duration: 0.55, ease: "power2.out" });
      gsap.to(".dash-layer-2", { x: nx * -24, y: ny * -16, duration: 0.55, ease: "power2.out" });
      gsap.to(".dash-layer-3", { x: nx * -36, y: ny * -24, duration: 0.55, ease: "power2.out" });
      // Specular highlight
      gsap.to(".dash-sheen", {
        background: `radial-gradient(circle at ${50 + nx * 80}% ${50 + ny * 80}%, rgba(255,255,255,0.07) 0%, transparent 55%)`,
        duration: 0.3,
      });
    };
    const onLeave = () => {
      gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.9, ease: "elastic.out(1,0.4)" });
      gsap.to([".dash-layer-1", ".dash-layer-2", ".dash-layer-3"], { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1,0.4)" });
      gsap.to(".dash-sheen", { background: "none", duration: 0.3 });
    };

    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onLeave);
    return () => { wrap.removeEventListener("mousemove", onMove); wrap.removeEventListener("mouseleave", onLeave); };
  }, []);

  const bars = [40, 65, 50, 80, 55, 92, 68, 78, 50, 100, 72, 88];
  return (
    <div ref={wrapRef} style={{ perspective: 900, perspectiveOrigin: "50% 40%", cursor: "none" }}>
      <div ref={cardRef} style={{
        borderRadius: 20, overflow: "hidden",
        border: "1px solid rgba(20,184,232,0.22)",
        background: "rgba(8,14,26,0.97)",
        boxShadow: `0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(20,184,232,0.06), 0 0 80px rgba(20,184,232,0.08)`,
        transformStyle: "preserve-3d",
        willChange: "transform",
        position: "relative",
      }}>
        {/* Specular sheen */}
        <div className="dash-sheen" style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none", borderRadius: 20 }} />

        {/* Title bar */}
        <div className="dash-layer-1" style={{ padding: "11px 18px", background: "rgba(20,184,232,0.06)", borderBottom: "1px solid rgba(20,184,232,0.1)", display: "flex", alignItems: "center", gap: 7 }}>
          {["#ef4444", "#fbbf24", "#22c55e"].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.65 }} />)}
          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>Dashboard · ArtixPOS</span>
        </div>

        <div style={{ padding: "20px 22px" }}>
          {/* Stat cards */}
          <div className="dash-layer-2" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
            {[
              { l: "Today's Sales", v: "₱24,850", d: "+12%", c: NEON, bg: "rgba(56,217,245,0.07)" },
              { l: "Orders", v: "137", d: "+8%", c: "#34d399", bg: "rgba(52,211,153,0.07)" },
              { l: "Staff Active", v: "9/12", d: "3 free", c: "#a78bfa", bg: "rgba(167,139,250,0.07)" },
            ].map((s, i) => (
              <div key={i} style={{
                padding: "13px 14px", borderRadius: 12,
                background: s.bg, border: `1px solid ${s.c}22`,
                transformStyle: "preserve-3d",
              }}>
                <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 3, letterSpacing: "-0.02em" }}>{s.v}</div>
                <div style={{ fontSize: 10, color: s.c, fontWeight: 700 }}>{s.d}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="dash-layer-3" style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 44 }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: "3px 3px 0 0", height: `${h}%`,
                  background: i === 9
                    ? `linear-gradient(180deg,${NEON},${BLUE})`
                    : `rgba(20,184,232,${0.12 + (h / 100) * 0.5})`,
                  boxShadow: i === 9 ? `0 0 12px ${NEON}66` : "none",
                  transition: "height 0.3s",
                }} />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="dash-layer-1" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[{ l: "POS", v: "Live", c: NEON }, { l: "AI", v: "Active", c: "#a78bfa" }, { l: "2 Branches", v: "Synced", c: "#f59e0b" }].map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 13px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.c, boxShadow: `0 0 7px ${p.c}` }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{p.l}</span>
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{p.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Feature Card with 3D hover ──────────────────────── */
function FeatureCard({ icon, title, desc, delay }: { icon: string; title: string; desc: string; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(el, { rotateY: nx * 18, rotateX: -ny * 14, scale: 1.03, duration: 0.4, ease: "power2.out", transformPerspective: 700 });
    };
    const onLeave = () => gsap.to(el, { rotateX: 0, rotateY: 0, scale: 1, duration: 0.7, ease: "elastic.out(1,0.5)" });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); };
  }, []);
  return (
    <div ref={ref} className="feat-card" data-delay={delay} style={{
      padding: "30px", borderRadius: 18, cursor: "default",
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      transformStyle: "preserve-3d", willChange: "transform",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 30% 30%, rgba(20,184,232,0.05) 0%, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ fontSize: 30, marginBottom: 16, display: "inline-block", transform: "translateZ(20px)" }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.01em", transform: "translateZ(15px)" }}>{title}</div>
      <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.42)", lineHeight: 1.65, transform: "translateZ(10px)" }}>{desc}</div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */
export function Cinematic() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {

      // ── INIT STATE ──────────────────────────────────
      gsap.set(".char-l1", { rotateX: -90, opacity: 0, transformOrigin: "50% 100%", transformPerspective: 600 });
      gsap.set(".char-l2", { rotateX: -90, opacity: 0, transformOrigin: "50% 100%", transformPerspective: 600 });
      gsap.set(".char-l3", { rotateX: -90, opacity: 0, transformOrigin: "50% 100%", transformPerspective: 600 });
      gsap.set(".hero-badge", { opacity: 0, scale: 0.8, y: 20 });
      gsap.set(".hero-sub", { opacity: 0, y: 40 });
      gsap.set(".hero-ctas", { opacity: 0, y: 30 });
      gsap.set(".dash-3d", { opacity: 0, y: 80, rotateX: 25, rotateY: -8, scale: 0.9, transformPerspective: 1000 });
      gsap.set(".nav-link", { opacity: 0, y: -16 });

      // ── ENTRANCE TIMELINE ───────────────────────────
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      tl.to(".nav-link", { opacity: 1, y: 0, duration: 0.7, stagger: 0.07 })
        .to(".hero-badge", { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: "back.out(2)" }, 0.5)
        // Line 1 chars flip up
        .to(".char-l1", {
          rotateX: 0, opacity: 1, duration: 0.7, stagger: 0.028, ease: "back.out(1.5)",
        }, 0.75)
        // Line 2 chars flip up
        .to(".char-l2", {
          rotateX: 0, opacity: 1, duration: 0.7, stagger: 0.028, ease: "back.out(1.5)",
        }, 0.95)
        // Line 3 chars flip up
        .to(".char-l3", {
          rotateX: 0, opacity: 1, duration: 0.7, stagger: 0.028, ease: "back.out(1.5)",
        }, 1.15)
        .to(".hero-sub", { opacity: 1, y: 0, duration: 0.9 }, 1.3)
        .to(".hero-ctas", { opacity: 1, y: 0, duration: 0.8, ease: "back.out(1.5)" }, 1.45)
        // Dashboard rises with 3D flip
        .to(".dash-3d", {
          opacity: 1, y: 0, rotateX: 0, rotateY: 0, scale: 1,
          duration: 1.3, ease: "expo.out",
        }, 0.9);

      // ── SCROLL: floating orb ─────────────────────────
      gsap.to(".bg-orb-a", {
        y: -120, x: 40,
        scrollTrigger: { trigger: containerRef.current, start: "top top", end: "bottom bottom", scrub: 2 },
      });
      gsap.to(".bg-orb-b", {
        y: -80, x: -30,
        scrollTrigger: { trigger: containerRef.current, start: "top top", end: "bottom bottom", scrub: 3 },
      });

      // ── STATS: scroll-triggered counters ────────────
      gsap.utils.toArray<HTMLElement>(".stat-block").forEach((el, i) => {
        const numEl = el.querySelector<HTMLElement>(".stat-num");
        const target = parseFloat(el.dataset.target ?? "0");
        const suffix = el.dataset.suffix ?? "";
        const isDecimal = el.dataset.decimal === "1";

        gsap.set(el, { opacity: 0, y: 50, rotateX: 20, transformPerspective: 600 });
        ScrollTrigger.create({
          trigger: el, start: "top 88%",
          onEnter: () => {
            gsap.to(el, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, delay: i * 0.1, ease: "expo.out" });
            if (numEl) {
              gsap.to({ val: 0 }, {
                val: target, duration: 2, ease: "power3.out", delay: i * 0.1,
                onUpdate: function () {
                  const v = this.targets()[0].val;
                  numEl.textContent = (isDecimal ? v.toFixed(1) : Math.round(v).toLocaleString()) + suffix;
                },
              });
            }
          },
          once: true,
        });
      });

      // ── FEATURES: 3D scroll reveal ───────────────────
      gsap.utils.toArray<HTMLElement>(".feat-card").forEach((el, i) => {
        const col = i % 3;
        const fromX = col === 0 ? -60 : col === 2 ? 60 : 0;
        const fromRotY = col === 0 ? 20 : col === 2 ? -20 : 0;
        gsap.set(el, { opacity: 0, x: fromX, rotateY: fromRotY, scale: 0.9, transformPerspective: 800 });
        ScrollTrigger.create({
          trigger: el, start: "top 90%",
          onEnter: () => gsap.to(el, {
            opacity: 1, x: 0, rotateY: 0, scale: 1,
            duration: 0.9, delay: (i % 3) * 0.1,
            ease: "expo.out",
          }),
          once: true,
        });
      });

      // ── PINNED SECTION: "How it works" ───────────────
      const pinSection = document.querySelector<HTMLElement>(".pin-section");
      const steps = gsap.utils.toArray<HTMLElement>(".step-item");
      if (pinSection && steps.length) {
        gsap.set(steps, { opacity: 0, x: 80, rotateY: -30, transformPerspective: 700 });

        ScrollTrigger.create({
          trigger: pinSection,
          start: "top top",
          end: `+=${steps.length * 260}`,
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            const progress = self.progress;
            steps.forEach((step, i) => {
              const start = i / steps.length;
              const end = (i + 1) / steps.length;
              const p = Math.max(0, Math.min(1, (progress - start) / (end - start)));
              gsap.to(step, {
                opacity: p < 0.5 ? p * 2 : 2 - p * 2,
                x: (1 - p) * 80,
                rotateY: (1 - p) * -30,
                duration: 0.1,
              });
            });
          },
        });
      }

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} style={{
      background: "#06101c", color: "#fff",
      fontFamily: "-apple-system, 'Inter', system-ui, sans-serif",
      minHeight: "100vh", overflowX: "hidden",
    }}>

      {/* ── AMBIENT BACKGROUND ── */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div className="bg-orb-a" style={{
          position: "absolute", width: 900, height: 900, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(20,184,232,0.09) 0%, transparent 60%)",
          top: -350, left: -300,
        }} />
        <div className="bg-orb-b" style={{
          position: "absolute", width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,217,245,0.055) 0%, transparent 60%)",
          bottom: 0, right: -180,
        }} />
        {/* Grid lines */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(rgba(20,184,232,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(20,184,232,0.025) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }} />
        {/* Top edge glow */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${BLUE}88,transparent)` }} />
      </div>

      {/* ── NAV ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
        background: "rgba(6,16,28,0.88)",
        borderBottom: "1px solid rgba(20,184,232,0.08)",
        padding: "0 44px", height: 64,
        display: "flex", alignItems: "center",
      }}>
        <div className="nav-link" style={{ display: "flex", alignItems: "center", gap: 11, marginRight: "auto" }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
            boxShadow: `0 0 24px rgba(20,184,232,0.5)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>ArtixPOS</span>
        </div>
        {["Features", "Pricing", "Security", "Blog"].map(l => (
          <span key={l} className="nav-link" style={{ marginLeft: 36, fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.48)", cursor: "pointer" }}>{l}</span>
        ))}
        <button className="nav-link" style={{
          marginLeft: 28, padding: "9px 22px", borderRadius: 9,
          background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
          border: "none", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
          boxShadow: `0 4px 18px rgba(20,184,232,0.4)`, fontFamily: "inherit",
        }}>
          Sign In
        </button>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        maxWidth: 1200, margin: "0 auto", padding: "88px 44px 80px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center",
        position: "relative", zIndex: 1,
      }}>
        <div>
          <div className="hero-badge" style={{
            display: "inline-flex", alignItems: "center", gap: 9, padding: "7px 16px",
            borderRadius: 100, marginBottom: 28,
            background: "rgba(20,184,232,0.1)", border: `1px solid rgba(56,217,245,0.28)`,
            fontSize: 12.5, fontWeight: 600, color: NEON,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: NEON, display: "inline-block", animation: "hpulse 2s ease-in-out infinite", boxShadow: `0 0 8px ${NEON}` }} />
            Trusted by 10,000+ businesses · AI-Powered
          </div>

          <h1 style={{
            fontSize: 60, fontWeight: 900, lineHeight: 1.06,
            letterSpacing: "-0.035em", margin: "0 0 24px",
            transformStyle: "preserve-3d",
          }}>
            <Line3D text="Run your whole" cls="char-l1" />
            <Line3D text="business from" cls="char-l2" color={NEON} />
            <Line3D text="one screen." cls="char-l3" />
          </h1>

          <p className="hero-sub" style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, margin: "0 0 36px", maxWidth: 460 }}>
            Real-time POS, AI forecasting, staff scheduling, multi-branch analytics — one beautiful platform that grows with you.
          </p>

          <div className="hero-ctas" style={{ display: "flex", gap: 14 }}>
            <MagneticBtn primary>Start Free Trial</MagneticBtn>
            <MagneticBtn>Watch Demo →</MagneticBtn>
          </div>
        </div>

        <div className="dash-3d" style={{ transformStyle: "preserve-3d", willChange: "transform" }}>
          <Dashboard3D />
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 44px 88px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 22 }}>
          {[
            { label: "Active Businesses", target: 10000, suffix: "+", color: NEON },
            { label: "Uptime SLA", target: 99.9, suffix: "%", decimal: "1", color: "#34d399" },
            { label: "Daily Transactions", target: 50000, suffix: "+", color: "#a78bfa" },
            { label: "Countries", target: 12, suffix: "", color: "#f59e0b" },
          ].map((s, i) => (
            <div key={i} className="stat-block"
              data-target={s.target} data-suffix={s.suffix} data-decimal={s.decimal}
              style={{
                padding: "30px 24px", borderRadius: 18, textAlign: "center",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                transformStyle: "preserve-3d",
              }}>
              <div className="stat-num" style={{ fontSize: 48, fontWeight: 900, color: s.color, letterSpacing: "-0.035em", lineHeight: 1, marginBottom: 8 }}>0</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PINNED "HOW IT WORKS" ── */}
      <section className="pin-section" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, background: "#050d18" }}>
        <div style={{ textAlign: "center", width: "100%", maxWidth: 700, padding: "0 44px" }}>
          <div style={{ fontSize: 12, color: NEON, letterSpacing: "0.22em", fontWeight: 700, marginBottom: 12 }}>HOW IT WORKS</div>
          <h2 style={{ fontSize: 46, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 56 }}>Three steps to transformation</h2>
          <div style={{ position: "relative", minHeight: 200 }}>
            {[
              { n: "01", title: "Set up in minutes", desc: "Plug in your menu, staff, and payment method. No IT team needed." },
              { n: "02", title: "Go live instantly", desc: "Your POS, inventory, and analytics are all connected from day one." },
              { n: "03", title: "Grow with confidence", desc: "Expand to new locations — the platform scales automatically." },
            ].map((s, i) => (
              <div key={i} className="step-item" style={{
                position: i === 0 ? "relative" : "absolute", top: 0, left: 0, right: 0,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                transformStyle: "preserve-3d",
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: `linear-gradient(135deg,${BLUE},${BLUE2})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 900, boxShadow: `0 0 32px rgba(20,184,232,0.4)`,
                }}>
                  {s.n}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{s.title}</div>
                <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", maxWidth: 380 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 44px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ fontSize: 12, color: NEON, letterSpacing: "0.22em", fontWeight: 700, marginBottom: 12 }}>CAPABILITIES</div>
          <h2 style={{ fontSize: 46, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 14 }}>Everything your business needs</h2>
          <p style={{ color: "rgba(255,255,255,0.42)", fontSize: 16.5 }}>Built for businesses that refuse to stand still.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {[
            { icon: "⚡", title: "Real-Time POS", desc: "Sub-100ms transactions with offline fallback. Works when Wi-Fi doesn't." },
            { icon: "🤖", title: "AI Forecasting", desc: "Predict busy hours, optimal stock levels, and staffing needs automatically." },
            { icon: "📊", title: "Live Analytics", desc: "Beautiful dashboards that update in real-time across all your branches." },
            { icon: "👥", title: "Staff Management", desc: "PIN clock-in, shift scheduling, payroll tracking — all integrated." },
            { icon: "📦", title: "Smart Inventory", desc: "Auto-reorder alerts, supplier management, and waste tracking." },
            { icon: "🔒", title: "Enterprise Security", desc: "Role-based access, audit logs, and SOC 2 compliant infrastructure." },
          ].map((f, i) => (
            <FeatureCard key={i} {...f} delay={i} />
          ))}
        </div>
      </section>

      {/* ── CTA SECTION ── */}
      <section style={{ textAlign: "center", padding: "80px 44px 120px", position: "relative", zIndex: 1 }}>
        <div style={{
          maxWidth: 660, margin: "0 auto", padding: "64px 48px",
          borderRadius: 28, border: "1px solid rgba(20,184,232,0.18)",
          background: "rgba(20,184,232,0.05)",
          boxShadow: `0 0 80px rgba(20,184,232,0.07)`,
        }}>
          <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 16 }}>
            Ready to upgrade<br />your business?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, marginBottom: 36, lineHeight: 1.6 }}>
            Join thousands of businesses running smarter with ArtixPOS. Free for 30 days — no credit card required.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            <MagneticBtn primary>Start Free Trial</MagneticBtn>
            <MagneticBtn>Talk to Sales</MagneticBtn>
          </div>
          <p style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.28)" }}>No credit card · Cancel anytime · Free support</p>
        </div>
      </section>

      <style>{`
        @keyframes hpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(1.4)} }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
