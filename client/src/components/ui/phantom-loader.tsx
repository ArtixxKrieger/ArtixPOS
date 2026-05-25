import { useState, useEffect } from "react";

/**
 * Reads the shimmer palette from CSS custom properties defined in index.css:
 *   --shimmer-base  (block background)
 *   --shimmer-hi    (sweep highlight)
 *
 * Root causes fixed:
 *  1. Old approach multiplied --primary lightness by 0.16 → ~10% L →
 *     invisible against dark cards.
 *  2. useMemo(fn, []) cached the result forever so theme switches produced
 *     stale (wrong-mode) colors.
 *
 * This hook uses a MutationObserver to re-derive colors whenever the
 * <html> class changes (e.g. dark ↔ light toggle), so it always reflects
 * the active theme without any stale state.
 */
function readShimmerColors(): { shimmerColor: string; bgColor: string } {
  if (typeof window === "undefined") return { shimmerColor: "", bgColor: "" };

  const styles = getComputedStyle(document.documentElement);
  const base = styles.getPropertyValue("--shimmer-base").trim();
  const hi   = styles.getPropertyValue("--shimmer-hi").trim();

  if (base && hi) return { bgColor: base, shimmerColor: hi };

  // Fallback: derive from the brand primary hue.
  // Use safe fixed-lightness values that are always visible:
  //   light → 85 / 96 % L (clearly gray on white)
  //   dark  → 22 / 34 % L (visible on 7 % L cards in this very-dark palette)
  const raw = styles.getPropertyValue("--primary").trim();
  const parts = raw.split(/\s+/);
  const h = Number(parts[0]);
  const s = parseFloat(parts[1]);
  if (isNaN(h) || isNaN(s)) return { shimmerColor: "", bgColor: "" };

  const isDark = document.documentElement.classList.contains("dark");
  if (isDark) {
    return {
      bgColor:      `hsl(${h} ${Math.round(s * 0.18)}% 22%)`,
      shimmerColor: `hsl(${h} ${Math.round(s * 0.18)}% 34%)`,
    };
  }
  return {
    bgColor:      `hsl(${h} ${Math.round(s * 0.07)}% 85%)`,
    shimmerColor: `hsl(${h} ${Math.round(s * 0.07)}% 96%)`,
  };
}

function useShimmerColors(): { shimmerColor: string; bgColor: string } {
  const [colors, setColors] = useState(readShimmerColors);

  useEffect(() => {
    const obs = new MutationObserver(() => setColors(readShimmerColors()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  return colors;
}

interface PhantomLoaderProps {
  loading?: boolean;
  count?: number;
  countGap?: number;
  children?: React.ReactNode;
}

export function PhantomLoader({ loading = true, count, countGap, children }: PhantomLoaderProps) {
  const { shimmerColor, bgColor } = useShimmerColors();
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
