import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  w: number; h: number;
  rotation: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  shape: "rect" | "circle" | "ribbon";
}

const COLORS = [
  "#7C3AED", "#A78BFA", "#F59E0B", "#10B981",
  "#EF4444", "#3B82F6", "#EC4899", "#FCD34D",
];

function makeParticle(canvas: HTMLCanvasElement, burst: boolean): Particle {
  const cx = canvas.width / 2;
  const spread = burst ? canvas.width * 0.55 : canvas.width * 0.3;
  const angle = burst ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
  const speed = burst ? Math.random() * 7 + 4 : Math.random() * 10 + 6;
  return {
    x: cx + (Math.random() - 0.5) * spread,
    y: burst ? canvas.height / 2 : canvas.height * 0.55,
    vx: Math.cos(angle) * speed * (burst ? 1 : 0.6),
    vy: Math.sin(angle) * speed,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    w: Math.random() * 10 + 5,
    h: Math.random() * 5 + 3,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.25,
    life: 0,
    maxLife: Math.random() * 60 + 70,
    shape: Math.random() > 0.6 ? "circle" : Math.random() > 0.5 ? "ribbon" : "rect",
  };
}

interface ConfettiProps {
  onDone: () => void;
  count?: number;
}

export function ConfettiBurst({ onDone, count = 130 }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = Array.from({ length: count }, () =>
      makeParticle(canvas, true),
    );

    let frame: number;
    let done = false;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = 0;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22;
        p.vx *= 0.99;
        p.rotation += p.rotSpeed;
        p.life++;

        const progress = p.life / p.maxLife;
        const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
        if (alpha <= 0) continue;
        alive++;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === "ribbon") {
          ctx.beginPath();
          ctx.moveTo(-p.w / 2, 0);
          ctx.quadraticCurveTo(0, -p.h, p.w / 2, 0);
          ctx.quadraticCurveTo(0, p.h, -p.w / 2, 0);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (alive > 0) {
        frame = requestAnimationFrame(draw);
      } else if (!done) {
        done = true;
        onDone();
      }
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [count, onDone]);

  return createPortal(
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{ width: "100vw", height: "100vh" }}
    />,
    document.body,
  );
}
