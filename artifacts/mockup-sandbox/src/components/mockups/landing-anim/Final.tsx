import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ShoppingCart, BarChart3, Bot, Building2, Package, Users,
  Calendar, Gift, FileText, DollarSign, Wifi, Printer,
  Smartphone, Tablet, Laptop, Monitor,
  UserPlus, CreditCard, TrendingUp,
  ShieldCheck, Lock, Check, ArrowRight,
  Zap, WifiOff, Download, Bell,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const B = "#14b8e8";
const N = "#38d9f5";
const B2 = "#0284c7";
const DARK = "#060e1a";
const CARD = "rgba(12,22,38,0.94)";

/* ─── helpers ─────────────────────────────────────────────── */
function splitToWords(text: string, cls: string) {
  return text.split(" ").map((w, i) => (
    <span key={i} className="word-outer" style={{ display: "inline-block", overflow: "hidden", marginRight: "0.28em" }}>
      <span className={cls} style={{ display: "inline-block", willChange: "transform,opacity" }}>{w}</span>
    </span>
  ));
}

function MagBtn({ children, primary, onClick }: { children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  const r = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = r.current; if (!el) return;
    const move = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - rect.left - rect.width / 2) * 0.3;
      const dy = (e.clientY - rect.top - rect.height / 2) * 0.3;
      gsap.to(el, { x: dx, y: dy, duration: 0.35, ease: "power2.out" });
    };
    const leave = () => gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1,0.45)" });
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
  }, []);
  return (
    <button ref={r} onClick={onClick} style={{
      padding: "13px 30px", borderRadius: 11, border: primary ? "none" : "1.5px solid rgba(255,255,255,0.13)",
      background: primary ? `linear-gradient(135deg,${B},${B2})` : "rgba(255,255,255,0.05)",
      color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: "pointer",
      boxShadow: primary ? `0 6px 28px rgba(20,184,232,0.42)` : "none",
      fontFamily: "inherit", letterSpacing: "-0.01em", display: "inline-flex", alignItems: "center", gap: 8,
      willChange: "transform",
    }}>{children}</button>
  );
}

function Dash3D() {
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const w = wrap.current, c = card.current; if (!w || !c) return;
    const move = (e: MouseEvent) => {
      const r = w.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(c, { rotateY: nx * 20, rotateX: -ny * 14, duration: 0.5, ease: "power2.out", transformPerspective: 900 });
      gsap.to(".d3-l1", { x: nx * -12, y: ny * -8, duration: 0.5, ease: "power2.out" });
      gsap.to(".d3-l2", { x: nx * -22, y: ny * -14, duration: 0.5, ease: "power2.out" });
      gsap.to(".d3-l3", { x: nx * -32, y: ny * -20, duration: 0.5, ease: "power2.out" });
      gsap.to(".d3-sheen", { background: `radial-gradient(circle at ${50+nx*90}% ${50+ny*90}%, rgba(255,255,255,0.075) 0%, transparent 50%)`, duration: 0.25 });
    };
    const leave = () => {
      gsap.to(c, { rotateX: 0, rotateY: 0, duration: 1, ease: "elastic.out(1,0.45)" });
      gsap.to([".d3-l1",".d3-l2",".d3-l3"], { x: 0, y: 0, duration: 1, ease: "elastic.out(1,0.45)" });
      gsap.to(".d3-sheen", { background: "none", duration: 0.25 });
    };
    w.addEventListener("mousemove", move);
    w.addEventListener("mouseleave", leave);
    return () => { w.removeEventListener("mousemove", move); w.removeEventListener("mouseleave", leave); };
  }, []);
  const bars = [40,65,50,80,55,92,68,78,50,100,72,88];
  return (
    <div ref={wrap} style={{ perspective: 900, cursor: "crosshair" }}>
      <div ref={card} style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(20,184,232,0.2)", background: "rgba(8,14,26,0.97)", boxShadow: `0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(20,184,232,0.05)`, transformStyle: "preserve-3d", willChange: "transform", position: "relative" }}>
        <div className="d3-sheen" style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none", borderRadius: 20 }} />
        <div className="d3-l1" style={{ padding: "11px 18px", background: "rgba(20,184,232,0.06)", borderBottom: "1px solid rgba(20,184,232,0.1)", display: "flex", alignItems: "center", gap: 7 }}>
          {["#ef4444","#fbbf24","#22c55e"].map(c=><div key={c} style={{width:9,height:9,borderRadius:"50%",background:c,opacity:0.65}}/>)}
          <span style={{marginLeft:"auto",fontSize:9.5,color:"rgba(255,255,255,0.2)",fontWeight:600}}>Dashboard · ArtixPOS</span>
        </div>
        <div style={{padding:"18px 20px"}}>
          <div className="d3-l2" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
            {[{l:"Today's Sales",v:"₱ 24,850",d:"+12%",c:N},{l:"Orders",v:"137",d:"+8%",c:"#34d399"},{l:"Active Staff",v:"9 / 12",d:"3 available",c:"#a78bfa"}].map((s,i)=>(
              <div key={i} style={{padding:"12px 13px",borderRadius:12,background:`${s.c}09`,border:`1px solid ${s.c}20`}}>
                <div style={{fontSize:8.5,color:"rgba(255,255,255,0.35)",fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.l}</div>
                <div style={{fontSize:17,fontWeight:900,marginBottom:3,letterSpacing:"-0.02em"}}>{s.v}</div>
                <div style={{fontSize:10,color:s.c,fontWeight:700}}>{s.d}</div>
              </div>
            ))}
          </div>
          <div className="d3-l3" style={{padding:"12px",borderRadius:12,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.055)",marginBottom:13}}>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:40}}>
              {bars.map((h,i)=>(
                <div key={i} style={{flex:1,borderRadius:"3px 3px 0 0",height:`${h}%`,background:i===9?`linear-gradient(180deg,${N},${B})`:`rgba(20,184,232,${0.13+(h/100)*0.5})`,boxShadow:i===9?`0 0 10px ${N}55`:"none"}}/>
              ))}
            </div>
          </div>
          <div className="d3-l1" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[{l:"POS",v:"Live",c:N},{l:"Offline",v:"Ready",c:"#34d399"},{l:"AI",v:"Active",c:"#a78bfa"},{l:"2 Branches",v:"Synced",c:"#f59e0b"}].map((p,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:p.c,boxShadow:`0 0 6px ${p.c}`}}/>
                <span style={{fontSize:9.5,color:"rgba(255,255,255,0.38)",fontWeight:500}}>{p.l}</span>
                <span style={{fontSize:9.5,color:"#fff",fontWeight:700}}>{p.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TiltCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const r = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = r.current; if (!el) return;
    const move = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX-rect.left)/rect.width-0.5;
      const ny = (e.clientY-rect.top)/rect.height-0.5;
      gsap.to(el, { rotateY: nx*16, rotateX: -ny*12, scale: 1.03, duration: 0.35, ease: "power2.out", transformPerspective: 700 });
    };
    const leave = () => gsap.to(el, { rotateX: 0, rotateY: 0, scale: 1, duration: 0.75, ease: "elastic.out(1,0.5)" });
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
  }, []);
  return <div ref={r} style={{ transformStyle: "preserve-3d", willChange: "transform", ...style }}>{children}</div>;
}

/* ─── main ────────────────────────────────────────────────── */
export function Final() {
  const root = useRef<HTMLDivElement>(null);

  /* marquee state */
  const trackRef   = useRef<HTMLDivElement>(null);
  const hovRef     = useRef(false);
  const dragRef    = useRef(false);
  const posRef     = useRef(0);
  const velRef     = useRef(0.55);
  const lastXRef   = useRef(0);

  useEffect(() => {
    const el = trackRef.current; if (!el) return;
    const BASE=0.55, FRIC=0.88, EASE=0.055;
    let raf: number;
    const tick = () => {
      if (!dragRef.current) {
        const tgt = hovRef.current ? 0 : BASE;
        const diff = tgt - velRef.current;
        if (Math.abs(velRef.current) > Math.abs(tgt)+0.1) {
          velRef.current *= FRIC;
          if (tgt>0 && velRef.current<0) velRef.current=0;
        } else { velRef.current += diff*EASE; }
        const hw = el.scrollWidth/2;
        if (hw>0) {
          posRef.current = ((posRef.current+velRef.current)%hw+hw)%hw;
          el.style.transform = `translateX(${-posRef.current}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      /* ── initial states ── */
      gsap.set(".w-l1 .word-outer span", { y: "110%", rotateX: -55, transformOrigin: "50% 100%", transformPerspective: 500, opacity: 0 });
      gsap.set(".w-l2 .word-outer span", { y: "110%", rotateX: -55, transformOrigin: "50% 100%", transformPerspective: 500, opacity: 0 });
      gsap.set(".w-l3 .word-outer span", { y: "110%", rotateX: -55, transformOrigin: "50% 100%", transformPerspective: 500, opacity: 0 });
      gsap.set(".h-badge", { opacity: 0, y: 18, scale: 0.88 });
      gsap.set(".h-sub", { opacity: 0, y: 36, filter: "blur(8px)" });
      gsap.set(".h-trust", { opacity: 0, y: 20 });
      gsap.set(".h-ctas", { opacity: 0, y: 24, scale: 0.96 });
      gsap.set(".dash-enter", { opacity: 0, x: 60, rotateY: -18, rotateX: 6, scale: 0.93, transformPerspective: 1000 });
      gsap.set(".nav-el", { opacity: 0, y: -14 });
      gsap.set(".orb-a", { scale: 0.7, opacity: 0 });
      gsap.set(".orb-b", { scale: 0.7, opacity: 0 });

      /* ── entrance ── */
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.to(".orb-a", { scale: 1, opacity: 1, duration: 1.8, ease: "power2.out" }, 0)
        .to(".orb-b", { scale: 1, opacity: 1, duration: 1.8, ease: "power2.out" }, 0.2)
        .to(".nav-el", { opacity: 1, y: 0, stagger: 0.06, duration: 0.65 }, 0.1)
        .to(".h-badge", { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "back.out(2.2)" }, 0.45)
        .to(".w-l1 .word-outer span", { y: "0%", rotateX: 0, opacity: 1, stagger: 0.06, duration: 0.75, ease: "back.out(1.6)" }, 0.65)
        .to(".w-l2 .word-outer span", { y: "0%", rotateX: 0, opacity: 1, stagger: 0.06, duration: 0.75, ease: "back.out(1.6)" }, 0.82)
        .to(".w-l3 .word-outer span", { y: "0%", rotateX: 0, opacity: 1, stagger: 0.05, duration: 0.75, ease: "back.out(1.6)" }, 1.0)
        .to(".h-sub", { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.95 }, 1.05)
        .to(".h-trust", { opacity: 1, y: 0, stagger: 0.08, duration: 0.7, ease: "back.out(1.8)" }, 1.2)
        .to(".h-ctas", { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "back.out(1.6)" }, 1.15)
        .to(".dash-enter", { opacity: 1, x: 0, rotateY: 0, rotateX: 0, scale: 1, duration: 1.3, ease: "expo.out" }, 0.75);

      /* ── parallax background ── */
      gsap.to(".orb-a", { y: -100, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 2 } });
      gsap.to(".orb-b", { y: -60,  scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 3 } });

      /* ── stats ── */
      document.querySelectorAll<HTMLElement>(".stat-item").forEach((el, i) => {
        gsap.set(el, { opacity: 0, y: 44, rotateX: 20, transformPerspective: 600 });
        ScrollTrigger.create({
          trigger: el, start: "top 88%",
          onEnter: () => gsap.to(el, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, delay: i*0.07, ease: "expo.out" }),
          once: true,
        });
      });

      /* ── features section header ── */
      gsap.set(".feat-hdr", { opacity: 0, y: 30 });
      ScrollTrigger.create({
        trigger: ".feat-hdr", start: "top 88%",
        onEnter: () => gsap.to(".feat-hdr", { opacity: 1, y: 0, duration: 0.9, ease: "expo.out" }),
        once: true,
      });

      /* ── devices ── */
      gsap.set(".dev-left", { opacity: 0, x: -70, rotateY: 20, transformPerspective: 800 });
      gsap.set(".dev-item", { opacity: 0, x: -40 });
      gsap.set(".dev-card", { opacity: 0, y: 50, scale: 0.94 });
      ScrollTrigger.create({
        trigger: ".dev-left", start: "top 85%",
        onEnter: () => {
          gsap.to(".dev-left",  { opacity: 1, x: 0, rotateY: 0, duration: 1.0, ease: "expo.out" });
          gsap.to(".dev-item",  { opacity: 1, x: 0, stagger: 0.1, duration: 0.75, ease: "expo.out", delay: 0.2 });
          gsap.to(".dev-card",  { opacity: 1, y: 0, scale: 1, stagger: 0.1, duration: 0.8, ease: "back.out(1.4)", delay: 0.25 });
        },
        once: true,
      });

      /* ── how it works: line draw + step reveals ── */
      gsap.set(".hiw-line", { scaleX: 0, transformOrigin: "left center" });
      gsap.set(".hiw-step", { opacity: 0, y: 60, scale: 0.92 });
      gsap.set(".hiw-circle", { scale: 0, rotation: -30 });
      gsap.set(".hiw-hdr", { opacity: 0, y: 30 });
      ScrollTrigger.create({
        trigger: ".hiw-section", start: "top 80%",
        onEnter: () => {
          gsap.to(".hiw-hdr", { opacity: 1, y: 0, duration: 0.9, ease: "expo.out" });
          gsap.to(".hiw-line", { scaleX: 1, duration: 1.2, ease: "power3.inOut", delay: 0.3 });
          gsap.to(".hiw-step", { opacity: 1, y: 0, scale: 1, stagger: 0.12, duration: 0.85, ease: "back.out(1.4)", delay: 0.2 });
          gsap.to(".hiw-circle", { scale: 1, rotation: 0, stagger: 0.12, duration: 0.7, ease: "back.out(2)", delay: 0.3 });
        },
        once: true,
      });
      gsap.set(".hiw-cta", { opacity: 0, scale: 0.9 });
      ScrollTrigger.create({
        trigger: ".hiw-cta", start: "top 90%",
        onEnter: () => gsap.to(".hiw-cta", { opacity: 1, scale: 1, duration: 0.75, ease: "back.out(1.8)" }),
        once: true,
      });

      /* ── security ── */
      gsap.set(".sec-left",  { opacity: 0, x: -80, rotateY: 18, transformPerspective: 900 });
      gsap.set(".sec-right", { opacity: 0, x:  80, rotateY: -18, transformPerspective: 900 });
      ScrollTrigger.create({
        trigger: ".sec-section", start: "top 82%",
        onEnter: () => {
          gsap.to(".sec-hdr",   { opacity: 1, y: 0, duration: 0.9, ease: "expo.out" });
          gsap.to(".sec-left",  { opacity: 1, x: 0, rotateY: 0, duration: 1.0, ease: "expo.out", delay: 0.15 });
          gsap.to(".sec-right", { opacity: 1, x: 0, rotateY: 0, duration: 1.0, ease: "expo.out", delay: 0.28 });
        },
        once: true,
      });
      gsap.set(".sec-hdr", { opacity: 0, y: 28 });

      /* ── pricing ── */
      gsap.set(".price-free", { opacity: 0, x: -60, rotateY: 14, transformPerspective: 800 });
      gsap.set(".price-pro",  { opacity: 0, x:  60, rotateY: -14, transformPerspective: 800 });
      gsap.set(".price-hdr",  { opacity: 0, y: 30 });
      ScrollTrigger.create({
        trigger: ".price-section", start: "top 82%",
        onEnter: () => {
          gsap.to(".price-hdr",  { opacity: 1, y: 0, duration: 0.9, ease: "expo.out" });
          gsap.to(".price-free", { opacity: 1, x: 0, rotateY: 0, duration: 1.0, ease: "expo.out", delay: 0.15 });
          gsap.to(".price-pro",  { opacity: 1, x: 0, rotateY: 0, duration: 1.0, ease: "expo.out", delay: 0.28 });
        },
        once: true,
      });

      /* ── footer CTA words ── */
      gsap.set(".cta-word span", { y: "115%", rotateX: -50, opacity: 0, transformOrigin: "50% 100%", transformPerspective: 400 });
      gsap.set(".cta-sub", { opacity: 0, y: 20 });
      gsap.set(".cta-btn", { opacity: 0, scale: 0.88 });
      ScrollTrigger.create({
        trigger: ".cta-section", start: "top 80%",
        onEnter: () => {
          gsap.to(".cta-word span", { y: "0%", rotateX: 0, opacity: 1, stagger: 0.06, duration: 0.8, ease: "expo.out" });
          gsap.to(".cta-sub", { opacity: 1, y: 0, duration: 0.8, delay: 0.5, ease: "expo.out" });
          gsap.to(".cta-btn", { opacity: 1, scale: 1, duration: 0.7, delay: 0.7, ease: "back.out(1.8)" });
        },
        once: true,
      });

    }, root);
    return () => ctx.revert();
  }, []);

  const features = [
    { icon: <ShoppingCart size={20}/>, title: "Point of Sale", desc: "Barcode scanning, cash/card/split payments, receipt printing. Works offline and syncs when back online.", color: B },
    { icon: <BarChart3 size={20}/>, title: "Real-time Analytics", desc: "Live revenue, top products, hourly trends, and staff performance. Export to Excel or PDF anytime.", color: "#34d399" },
    { icon: <Bot size={20}/>, title: "AI Business Assistant", desc: "Ask questions about your own data. \"What sold most this week?\" Multiple AI providers with automatic fallback.", color: "#a78bfa" },
    { icon: <Building2 size={20}/>, title: "Multi-branch", desc: "One account, multiple locations. Assign staff to branches, transfer stock, and view per-branch reports.", color: B },
    { icon: <Package size={20}/>, title: "Inventory & Expiry", desc: "Automatic low-stock alerts, expiry tracking, and full purchase order flow from supplier to shelf.", color: "#34d399" },
    { icon: <Users size={20}/>, title: "Staff & Payroll", desc: "Time clock, shift scheduling, payroll entries. Staff clock in from any device. Track labor cost vs. revenue.", color: "#f59e0b" },
    { icon: <Calendar size={20}/>, title: "Appointments & Rooms", desc: "Book and check out service appointments directly. Works for salons, clinics, spas, and hospitality.", color: "#a78bfa" },
    { icon: <Gift size={20}/>, title: "Loyalty & Memberships", desc: "Points-based loyalty with tiered rewards. Membership plans with recurring check-ins and redemptions.", color: "#f472b6" },
    { icon: <FileText size={20}/>, title: "Tax & Audit Log", desc: "OR number tracking, VAT computation, and a full void/refund audit trail. Every transaction is logged.", color: "#34d399" },
    { icon: <DollarSign size={20}/>, title: "Expenses & Suppliers", desc: "Track expenses by category, manage suppliers and purchase orders, and compare costs against revenue.", color: "#f59e0b" },
    { icon: <Wifi size={20}/>, title: "WiFi Voucher Management", desc: "Generate and sell timed WiFi access vouchers directly from the POS. Built for cafes, hotels, and restaurants.", color: B },
    { icon: <Printer size={20}/>, title: "Receipt & Kitchen Print", desc: "Bluetooth, network, and USB printer support. Kitchen Display System routes orders in real time.", color: "#a78bfa" },
  ];

  return (
    <div ref={root} style={{ background: DARK, color: "#fff", fontFamily: "-apple-system,'Inter',system-ui,sans-serif", minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── BG ── */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div className="orb-a" style={{ position: "absolute", width: 900, height: 900, borderRadius: "50%", background: "radial-gradient(circle, rgba(20,184,232,0.09) 0%, transparent 58%)", top: -320, left: -240 }} />
        <div className="orb-b" style={{ position: "absolute", width: 660, height: 660, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,217,245,0.05) 0%, transparent 60%)", bottom: -80, right: -160 }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(20,184,232,0.028) 1px,transparent 1px),linear-gradient(90deg,rgba(20,184,232,0.028) 1px,transparent 1px)`, backgroundSize: "56px 56px" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${B},transparent)` }} />
      </div>

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", background: "rgba(6,14,26,0.86)", borderBottom: "1px solid rgba(20,184,232,0.09)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", height: 64, display: "flex", alignItems: "center" }}>
          <div className="nav-el" style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 48 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${B},${B2})`, boxShadow: `0 0 22px rgba(20,184,232,0.48)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>A</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>ArtixPOS</span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 32, flex: 1 }}>
            {["Features","Devices","Security","Pricing"].map(l=>(
              <a key={l} className="nav-el" href={`#${l.toLowerCase()}`} style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.5)", textDecoration: "none", cursor: "pointer" }}>{l}</a>
            ))}
          </nav>
          <button className="nav-el" style={{ marginLeft: "auto", padding: "9px 22px", borderRadius: 9, background: `linear-gradient(135deg,${B},${B2})`, border: "none", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 18px rgba(20,184,232,0.38)` }}>
            Log in
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "100px 32px 88px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
        <div>
          <div className="h-badge" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 14px", borderRadius: 20, background: "rgba(20,184,232,0.10)", border: "1px solid rgba(20,184,232,0.22)", marginBottom: 26 }}>
            <Zap size={11} color={N} style={{ animation: "blink 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: N, letterSpacing: "0.04em" }}>Full-stack POS · Works offline too</span>
          </div>
          <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.045em", margin: "0 0 22px", transformStyle: "preserve-3d" }}>
            <div className="w-l1">{splitToWords("Run your entire", "w-l1-c")}</div>
            <div className="w-l2" style={{ background: `linear-gradient(90deg,${N} 0%,${B} 35%,#38bdf8 70%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              {splitToWords("business from", "w-l2-c")}
            </div>
            <div className="w-l3">{splitToWords("one screen.", "w-l3-c")}</div>
          </h1>
          <p className="h-sub" style={{ fontSize: 16.5, lineHeight: 1.75, color: "rgba(255,255,255,0.48)", marginBottom: 36, maxWidth: 440 }}>
            ArtixPOS is a complete business platform — point of sale, inventory, staff, payroll, analytics, and a built-in AI assistant. Works on any device. Even without internet.
          </p>
          <div className="h-ctas" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
            <MagBtn primary>Start for free <ArrowRight size={15}/></MagBtn>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            {["No credit card required","Free to start","Works offline"].map((t,i)=>(
              <div key={i} className="h-trust" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Check size={13} color="#34d399" strokeWidth={2.2}/>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dash-enter" style={{ position: "relative", transformStyle: "preserve-3d" }}>
          <div style={{ position: "absolute", inset: -55, background: "radial-gradient(ellipse at center, rgba(20,184,232,0.11) 0%, transparent 65%)", pointerEvents: "none" }} />
          <Dash3D />
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ position: "relative", zIndex: 1, borderTop: "1px solid rgba(20,184,232,0.07)", borderBottom: "1px solid rgba(20,184,232,0.07)", background: "rgba(255,255,255,0.014)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 24 }}>
          {[
            { n: "10+", label: "Built-in modules" },
            { n: "Any device", label: "Phone · Tablet · Laptop" },
            { n: "100%", label: "Works without internet" },
            { n: "Live", label: "Real-time analytics" },
            { n: "Multi", label: "Branch & team support" },
          ].map((s,i)=>(
            <div key={i} className="stat-item" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", background: `linear-gradient(135deg,${N},${B})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.n}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", fontWeight: 500, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ position: "relative", zIndex: 1, padding: "88px 0" }}>
        <div className="feat-hdr" style={{ textAlign: "center", marginBottom: 52, padding: "0 32px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: B, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>What's included</div>
          <h2 style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 10px", lineHeight: 1.1 }}>Everything your business needs.</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.38)", maxWidth: 420, margin: "0 auto", lineHeight: 1.65 }}>Actual features, not a roadmap.</p>
        </div>
        <div
          style={{ overflow: "hidden", position: "relative", cursor: "grab", userSelect: "none" }}
          onMouseEnter={()=>{ hovRef.current=true; }}
          onMouseLeave={()=>{ hovRef.current=false; dragRef.current=false; }}
          onMouseDown={e=>{ dragRef.current=true; lastXRef.current=e.clientX; velRef.current=0; (e.currentTarget as HTMLElement).style.cursor="grabbing"; }}
          onMouseMove={e=>{ if(!dragRef.current) return; const d=lastXRef.current-e.clientX; lastXRef.current=e.clientX; velRef.current=d; const el=trackRef.current; if(!el)return; const hw=el.scrollWidth/2; posRef.current=((posRef.current+d)%hw+hw)%hw; el.style.transform=`translateX(${-posRef.current}px)`; }}
          onMouseUp={e=>{ dragRef.current=false; (e.currentTarget as HTMLElement).style.cursor="grab"; }}
        >
          <div style={{ position:"absolute",left:0,top:0,bottom:0,width:80,background:`linear-gradient(to right,${DARK},transparent)`,zIndex:2,pointerEvents:"none" }}/>
          <div style={{ position:"absolute",right:0,top:0,bottom:0,width:80,background:`linear-gradient(to left,${DARK},transparent)`,zIndex:2,pointerEvents:"none" }}/>
          <div ref={trackRef} style={{ display:"flex",gap:18,padding:"4px 0 12px",willChange:"transform" }}>
            {[0,1].map(pass=>(
              <div key={pass} style={{ display:"flex",gap:18,flexShrink:0 }}>
                {features.map(({ icon, title, desc, color },i)=>(
                  <TiltCard key={i} style={{ width: 300, flexShrink: 0 }}>
                    <div style={{ padding:"24px 22px",borderRadius:16,background:CARD,border:"1px solid rgba(20,184,232,0.10)",display:"flex",flexDirection:"column",gap:14,height:"100%" }}>
                      <div style={{ width:42,height:42,borderRadius:12,background:`${color}14`,border:`1px solid ${color}26`,display:"flex",alignItems:"center",justifyContent:"center",color,flexShrink:0 }}>
                        {icon}
                      </div>
                      <div>
                        <div style={{ fontSize:14,fontWeight:700,color:"#fff",marginBottom:6 }}>{title}</div>
                        <div style={{ fontSize:12.5,color:"rgba(255,255,255,0.42)",lineHeight:1.68 }}>{desc}</div>
                      </div>
                    </div>
                  </TiltCard>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ textAlign:"center",marginTop:20,fontSize:12,color:"rgba(255,255,255,0.22)",letterSpacing:"0.04em" }}>Drag to explore</div>
      </section>

      {/* ── DEVICES ── */}
      <section id="devices" style={{ position:"relative",zIndex:1,background:"rgba(255,255,255,0.016)",borderTop:"1px solid rgba(20,184,232,0.07)",borderBottom:"1px solid rgba(20,184,232,0.07)" }}>
        <div style={{ maxWidth:1200,margin:"0 auto",padding:"88px 32px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:72,alignItems:"center" }}>
          <div className="dev-left">
            <div style={{ fontSize:12,fontWeight:700,color:B,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14 }}>Works everywhere</div>
            <h2 style={{ fontSize:38,fontWeight:900,letterSpacing:"-0.03em",margin:"0 0 16px",lineHeight:1.1 }}>Your team uses it on<br/>whatever they have.</h2>
            <p style={{ fontSize:15,color:"rgba(255,255,255,0.44)",lineHeight:1.75,marginBottom:32,maxWidth:400 }}>
              Cashiers use a tablet at the counter. Managers check analytics on a laptop. Owners monitor sales on their phone. All synced, all real-time.
            </p>
            <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
              {[
                { icon:<Smartphone size={18}/>, d:"Phone", sub:"Full POS, approvals, and push notifications" },
                { icon:<Tablet size={18}/>, d:"Tablet", sub:"Best cashier screen — fast, touch-optimized" },
                { icon:<Laptop size={18}/>, d:"Laptop", sub:"Analytics, management, and back-office" },
                { icon:<Monitor size={18}/>, d:"Desktop", sub:"Kitchen display, kiosk mode, multi-window" },
              ].map((dev,i)=>(
                <div key={i} className="dev-item" style={{ display:"flex",alignItems:"center",gap:14 }}>
                  <div style={{ width:42,height:42,borderRadius:13,background:"rgba(20,184,232,0.09)",border:"1px solid rgba(20,184,232,0.18)",display:"flex",alignItems:"center",justifyContent:"center",color:N,flexShrink:0 }}>{dev.icon}</div>
                  <div>
                    <div style={{ fontSize:14,fontWeight:700,color:"#fff" }}>{dev.d}</div>
                    <div style={{ fontSize:12.5,color:"rgba(255,255,255,0.38)",marginTop:2 }}>{dev.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
            {[
              { icon:<WifiOff size={16}/>, label:"Offline POS", desc:"Sells even with no connection. Auto-syncs when you're back online.", color:N },
              { icon:<Download size={16}/>, label:"Install as App", desc:"Add to home screen — behaves like a native app, no app store needed.", color:"#34d399" },
              { icon:<Printer size={16}/>, label:"Wireless Printing", desc:"Print to Bluetooth or network thermal printers from any device.", color:"#a78bfa" },
              { icon:<Bell size={16}/>, label:"Push Notifications", desc:"Get alerts when stock runs low, staff clock in, or daily targets are hit.", color:"#f59e0b" },
            ].map((c,i)=>(
              <TiltCard key={i}>
                <div className="dev-card" style={{ padding:"20px",borderRadius:14,background:CARD,border:"1px solid rgba(20,184,232,0.11)",height:"100%" }}>
                  <div style={{ width:34,height:34,borderRadius:10,background:`${c.color}14`,border:`1px solid ${c.color}25`,display:"flex",alignItems:"center",justifyContent:"center",color:c.color,marginBottom:12 }}>{c.icon}</div>
                  <div style={{ fontSize:13.5,fontWeight:700,color:"#fff",marginBottom:7 }}>{c.label}</div>
                  <div style={{ fontSize:12,color:"rgba(255,255,255,0.38)",lineHeight:1.65 }}>{c.desc}</div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="hiw-section" style={{ position:"relative",zIndex:1,borderTop:"1px solid rgba(20,184,232,0.07)" }}>
        <div style={{ maxWidth:960,margin:"0 auto",padding:"80px 32px" }}>
          <div className="hiw-hdr" style={{ textAlign:"center",marginBottom:56 }}>
            <div style={{ fontSize:11,fontWeight:700,color:N,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:12 }}>How it works</div>
            <h2 style={{ fontSize:34,fontWeight:900,letterSpacing:"-0.03em",margin:"0 0 10px",lineHeight:1.1 }}>Up and running in under 10 minutes.</h2>
            <p style={{ fontSize:14.5,color:"rgba(255,255,255,0.38)",maxWidth:400,margin:"0 auto",lineHeight:1.65 }}>No installation. No hardware required. Just a browser and your products.</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0,position:"relative" }}>
            <div className="hiw-line" style={{ position:"absolute",top:35,left:"12.5%",right:"12.5%",height:1,background:`linear-gradient(90deg,transparent,rgba(20,184,232,0.3),rgba(20,184,232,0.3),transparent)`,zIndex:0 }}/>
            {[
              { step:"01",icon:<UserPlus size={26}/>, title:"Create your account", body:"Sign up free in 2 minutes. No credit card, no setup fee, no expiry on the free plan.", color:B },
              { step:"02",icon:<Package size={26}/>, title:"Add your products", body:"Enter products manually or import a list. Set prices, categories, and stock levels.", color:"#34d399" },
              { step:"03",icon:<CreditCard size={26}/>, title:"Make your first sale", body:"Open the POS on any device — phone, tablet, or desktop. Works even without internet.", color:"#a78bfa" },
              { step:"04",icon:<TrendingUp size={26}/>, title:"Watch your business", body:"Sales, inventory, staff activity, and expenses — all updating in real time, one screen.", color:"#f59e0b" },
            ].map((item,i)=>(
              <div key={i} className="hiw-step" style={{ position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",padding:"0 20px" }}>
                <div className="hiw-circle" style={{ width:72,height:72,borderRadius:"50%",background:"rgba(15,30,48,0.95)",border:`1.5px solid ${item.color}40`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:24,flexShrink:0,position:"relative",color:item.color }}>
                  {item.icon}
                  <div style={{ position:"absolute",top:-8,right:-8,width:24,height:24,borderRadius:"50%",background:item.color,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 12px ${item.color}66` }}>
                    <span style={{ fontSize:10,fontWeight:900,color:DARK }}>{item.step}</span>
                  </div>
                </div>
                <div style={{ fontSize:15,fontWeight:800,marginBottom:10,lineHeight:1.3 }}>{item.title}</div>
                <div style={{ fontSize:13,color:"rgba(255,255,255,0.42)",lineHeight:1.7 }}>{item.body}</div>
              </div>
            ))}
          </div>
          <div className="hiw-cta" style={{ textAlign:"center",marginTop:52 }}>
            <MagBtn primary>Start for free, no card needed</MagBtn>
          </div>
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section id="security" className="sec-section" style={{ position:"relative",zIndex:1,borderTop:"1px solid rgba(20,184,232,0.07)",borderBottom:"1px solid rgba(20,184,232,0.07)" }}>
        <div style={{ maxWidth:860,margin:"0 auto",padding:"80px 32px" }}>
          <div className="sec-hdr" style={{ textAlign:"center",marginBottom:48 }}>
            <div style={{ fontSize:11,fontWeight:700,color:"#34d399",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:12 }}>Security</div>
            <h2 style={{ fontSize:34,fontWeight:900,letterSpacing:"-0.03em",margin:"0 0 12px",lineHeight:1.1 }}>Built for businesses that handle real money.</h2>
            <p style={{ fontSize:14.5,color:"rgba(255,255,255,0.40)",maxWidth:440,margin:"0 auto",lineHeight:1.65 }}>When cash and staff are involved, accountability is not optional.</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
            <TiltCard>
              <div className="sec-left" style={{ borderRadius:16,overflow:"hidden",background:CARD,border:"1px solid rgba(244,114,182,0.14)" }}>
                <div style={{ height:3,background:"linear-gradient(90deg,#f472b6,#e879f9)" }}/>
                <div style={{ padding:"36px 36px 40px" }}>
                  <div style={{ width:52,height:52,borderRadius:14,background:"rgba(244,114,182,0.10)",border:"1px solid rgba(244,114,182,0.22)",display:"flex",alignItems:"center",justifyContent:"center",color:"#f472b6",marginBottom:20 }}>
                    <ShieldCheck size={24}/>
                  </div>
                  <div style={{ fontSize:20,fontWeight:800,color:"#fff",marginBottom:14,letterSpacing:"-0.02em",lineHeight:1.2 }}>
                    Every action leaves a permanent record. Nobody can delete it.
                  </div>
                  <p style={{ fontSize:14,color:"rgba(255,255,255,0.50)",lineHeight:1.78,margin:"0 0 20px" }}>
                    A cashier voids a sale. A manager gives an unauthorized discount. A staff account quietly gets promoted. In most POS systems, these things happen and then they disappear.
                  </p>
                  <p style={{ fontSize:14,color:"rgba(255,255,255,0.68)",lineHeight:1.78,margin:"0 0 28px" }}>
                    In ArtixPOS, every void, refund, discount, permission change, and login is permanently logged with a timestamp and who did it. Staff can't delete it. Managers can't delete it. We can't delete it either.
                  </p>
                  <div style={{ padding:"14px 18px",borderRadius:12,background:"rgba(244,114,182,0.07)",border:"1px solid rgba(244,114,182,0.20)" }}>
                    <div style={{ fontSize:12,color:"rgba(255,255,255,0.45)",lineHeight:1.65 }}>When staff handle your cash every day, you need a history that can't be cleaned up before you look at it.</div>
                  </div>
                </div>
              </div>
            </TiltCard>
            <TiltCard>
              <div className="sec-right" style={{ borderRadius:16,overflow:"hidden",background:CARD,border:"1px solid rgba(14,165,233,0.18)" }}>
                <div style={{ height:3,background:"linear-gradient(90deg,#0ea5e9,#38bdf8)" }}/>
                <div style={{ padding:"36px 36px 40px" }}>
                  <div style={{ width:52,height:52,borderRadius:14,background:"rgba(14,165,233,0.10)",border:"1px solid rgba(14,165,233,0.22)",display:"flex",alignItems:"center",justifyContent:"center",color:"#38bdf8",marginBottom:20 }}>
                    <Lock size={24}/>
                  </div>
                  <div style={{ fontSize:20,fontWeight:800,color:"#fff",marginBottom:14,letterSpacing:"-0.02em",lineHeight:1.2 }}>
                    Remove a staff account and they're locked out instantly — on every device.
                  </div>
                  <p style={{ fontSize:14,color:"rgba(255,255,255,0.50)",lineHeight:1.78,margin:"0 0 20px" }}>
                    Staff turnover is common in most businesses. When someone leaves, you need their access gone immediately — not in an hour, not after their session expires.
                  </p>
                  <p style={{ fontSize:14,color:"rgba(255,255,255,0.68)",lineHeight:1.78,margin:"0 0 28px" }}>
                    The moment you deactivate an account in ArtixPOS, every active session for that person is terminated. Phone, shop tablet, home computer — they're out.
                  </p>
                  <div style={{ padding:"14px 18px",borderRadius:12,background:"rgba(14,165,233,0.07)",border:"1px solid rgba(14,165,233,0.18)" }}>
                    <div style={{ fontSize:12,color:"rgba(255,255,255,0.45)",lineHeight:1.65 }}>Most systems let old sessions linger for hours. We kill them the second you pull access.</div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="price-section" style={{ position:"relative",zIndex:1,background:"rgba(255,255,255,0.014)",borderTop:"1px solid rgba(20,184,232,0.07)" }}>
        <div style={{ maxWidth:820,margin:"0 auto",padding:"80px 32px",textAlign:"center" }}>
          <div className="price-hdr">
            <div style={{ fontSize:11,fontWeight:700,color:B,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:12 }}>Simple pricing</div>
            <h2 style={{ fontSize:34,fontWeight:900,letterSpacing:"-0.03em",margin:"0 0 10px" }}>Start free. Grow when ready.</h2>
            <p style={{ fontSize:14.5,color:"rgba(255,255,255,0.38)",maxWidth:380,margin:"0 auto 44px",lineHeight:1.65 }}>Core POS is free. Advanced features unlock on Pro.</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,maxWidth:680,margin:"0 auto" }}>
            <div className="price-free" style={{ padding:"28px 26px",borderRadius:18,background:CARD,border:"1px solid rgba(20,184,232,0.14)",textAlign:"left" }}>
              <div style={{ fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.45)",marginBottom:6 }}>FREE</div>
              <div style={{ fontSize:34,fontWeight:900,color:"#fff",marginBottom:4 }}>₱0 <span style={{ fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.35)" }}>/mo</span></div>
              <div style={{ fontSize:12,color:"rgba(255,255,255,0.32)",marginBottom:22 }}>No credit card. No expiry.</div>
              <div style={{ display:"flex",flexDirection:"column",gap:9 }}>
                {["Full POS","Products & inventory","Basic analytics","Single branch","Transaction history"].map((f,i)=>(
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <Check size={12} color="#34d399" strokeWidth={2.2}/>
                    <span style={{ fontSize:12.5,color:"rgba(255,255,255,0.55)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button style={{ marginTop:22,width:"100%",padding:"11px 0",borderRadius:11,fontSize:13,fontWeight:700,background:"rgba(20,184,232,0.10)",border:`1px solid rgba(20,184,232,0.26)`,color:N,cursor:"pointer",fontFamily:"inherit" }}>Get started free</button>
            </div>
            <div className="price-pro" style={{ padding:"28px 26px",borderRadius:18,background:"rgba(20,184,232,0.05)",border:`1.5px solid rgba(20,184,232,0.35)`,textAlign:"left",position:"relative" }}>
              <div style={{ position:"absolute",top:14,right:14,padding:"3px 10px",borderRadius:20,background:`linear-gradient(135deg,${B},${B2})`,fontSize:10,fontWeight:700,color:"#fff" }}>POPULAR</div>
              <div style={{ fontSize:12,fontWeight:700,color:N,marginBottom:6 }}>PRO</div>
              <div style={{ fontSize:34,fontWeight:900,color:"#fff",marginBottom:4 }}>Contact <span style={{ fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.35)" }}>for pricing</span></div>
              <div style={{ fontSize:12,color:"rgba(255,255,255,0.32)",marginBottom:22 }}>Per branch · billed monthly.</div>
              <div style={{ display:"flex",flexDirection:"column",gap:9 }}>
                {["Everything in Free","Multi-branch","Staff & payroll","AI assistant","Appointments & rooms","Loyalty & memberships","WiFi vouchers","Advanced analytics","Priority support"].map((f,i)=>(
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <Check size={12} color={N} strokeWidth={2.2}/>
                    <span style={{ fontSize:12.5,color:"rgba(255,255,255,0.60)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button style={{ marginTop:22,width:"100%",padding:"11px 0",borderRadius:11,fontSize:13,fontWeight:700,background:`linear-gradient(135deg,${B},${B2})`,border:"none",color:"#fff",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(20,184,232,0.28)" }}>Start free, upgrade anytime</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FOOTER ── */}
      <section className="cta-section" style={{ position:"relative",zIndex:1,textAlign:"center",padding:"88px 32px",borderTop:"1px solid rgba(20,184,232,0.07)" }}>
        <h2 style={{ fontSize:44,fontWeight:900,letterSpacing:"-0.04em",margin:"0 0 14px",display:"flex",gap:"0.25em",flexWrap:"wrap",justifyContent:"center" }}>
          {["Ready","to","start?"].map((w,i)=>(
            <span key={i} className="cta-word" style={{ display:"inline-block",overflow:"hidden" }}>
              <span style={{ display:"inline-block" }}>{w}</span>
            </span>
          ))}
        </h2>
        <p className="cta-sub" style={{ fontSize:16,color:"rgba(255,255,255,0.40)",marginBottom:36 }}>Takes less than 2 minutes. Your first sale is free.</p>
        <div className="cta-btn">
          <MagBtn primary>Create your free account <ArrowRight size={15}/></MagBtn>
        </div>
        <div style={{ marginTop:56,paddingTop:32,borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}>
          <div style={{ width:24,height:24,borderRadius:8,background:`linear-gradient(135deg,${B},${B2})`,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <span style={{ color:"#fff",fontSize:11,fontWeight:800 }}>A</span>
          </div>
          <span style={{ fontSize:12.5,color:"rgba(255,255,255,0.22)",fontWeight:500 }}>© 2025 ArtixPOS · Business Platform</span>
        </div>
      </section>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.35} }
        * { box-sizing: border-box; margin: 0; }
        a { color: inherit; }
      `}</style>
    </div>
  );
}
