import { useMemo } from "react";

function derivePhantomColors(): { shimmerColor: string; bgColor: string } {
  if (typeof window === "undefined") return { shimmerColor: "", bgColor: "" };

  const root = document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue("--primary").trim();
  if (!raw) return { shimmerColor: "", bgColor: "" };

  const parts = raw.split(/\s+/);
  if (parts.length < 3) return { shimmerColor: "", bgColor: "" };

  const h = Number(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if (isNaN(h) || isNaN(s) || isNaN(l)) return { shimmerColor: "", bgColor: "" };

  const isDark = root.classList.contains("dark");

  if (isDark) {
    return {
      bgColor: `hsl(${h} ${Math.round(s * 0.3)}% ${Math.round(l * 0.16)}%)`,
      shimmerColor: `hsl(${h} ${Math.round(s * 0.55)}% ${Math.round(l * 0.38)}%)`,
    };
  }
  return {
    bgColor: `hsl(${h} ${Math.round(s * 0.12)}% 93%)`,
    shimmerColor: `hsl(${h} ${Math.round(s * 0.3)}% 80%)`,
  };
}

interface PhantomLoaderProps {
  loading?: boolean;
  count?: number;
  countGap?: number;
  children?: React.ReactNode;
}

export function PhantomLoader({ loading = true, count, countGap, children }: PhantomLoaderProps) {
  const { shimmerColor, bgColor } = useMemo(derivePhantomColors, []);
  return (
    <phantom-ui
      loading={loading}
      count={count ?? 1}
      count-gap={countGap ?? 0}
      shimmer-color={shimmerColor || undefined}
      background-color={bgColor || undefined}
    >
      {children}
    </phantom-ui>
  );
}
