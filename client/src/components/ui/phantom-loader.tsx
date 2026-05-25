import { useMemo } from "react";

/**
 * Reads the shimmer palette from CSS custom properties already defined in
 * index.css (--shimmer-base / --shimmer-hi). Falls back to computing from
 * --primary only when those vars are absent.
 *
 * Previous approach multiplied lightness by 0.16 in dark mode, collapsing
 * both base and highlight to ≈10 % L — visually indistinguishable from the
 * page background (pure black blocks with no visible shimmer).
 */
function derivePhantomColors(): { shimmerColor: string; bgColor: string } {
  if (typeof window === "undefined") return { shimmerColor: "", bgColor: "" };

  const styles = getComputedStyle(document.documentElement);

  // Prefer the explicit CSS vars — they're always correctly contrasted for
  // both light and dark mode and need no extra math.
  const base = styles.getPropertyValue("--shimmer-base").trim();
  const hi   = styles.getPropertyValue("--shimmer-hi").trim();
  if (base && hi) return { bgColor: base, shimmerColor: hi };

  // Fallback: derive from the brand primary hue with safe fixed lightness.
  const raw = styles.getPropertyValue("--primary").trim();
  const parts = raw.split(/\s+/);
  if (parts.length < 3) return { shimmerColor: "", bgColor: "" };
  const h = Number(parts[0]);
  const s = parseFloat(parts[1]);
  if (isNaN(h) || isNaN(s)) return { shimmerColor: "", bgColor: "" };

  const isDark = document.documentElement.classList.contains("dark");
  if (isDark) {
    return {
      bgColor:      `hsl(${h} ${Math.round(s * 0.08)}% 13%)`,
      shimmerColor: `hsl(${h} ${Math.round(s * 0.12)}% 19%)`,
    };
  }
  return {
    bgColor:      `hsl(${h} ${Math.round(s * 0.08)}% 91%)`,
    shimmerColor: `hsl(${h} ${Math.round(s * 0.12)}% 96%)`,
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
