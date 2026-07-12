import { useEffect } from "react";
import { useBranches } from "./use-admin";
import { useAuth } from "./use-auth";

function hexToHsl(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

const THEME_PROPS = [
  "--primary", "--ring",
  "--sidebar-primary", "--sidebar-ring",
  "--accent", "--accent-foreground",
  "--sidebar-accent", "--sidebar-accent-foreground",
  "--chart-1",
];

function applyBranchColor(hex: string | null) {
  const root = document.documentElement;
  if (!hex) {
    THEME_PROPS.forEach((p) => root.style.removeProperty(p));
    return;
  }
  const hsl = hexToHsl(hex);
  if (!hsl) return;

  const [h, s, l] = hsl;
  const isDark = root.classList.contains("dark");

  const primaryL = isDark ? Math.min(l + 14, 85) : l;
  const primaryS = isDark ? Math.min(s + 2, 95) : s;
  const primaryStr = `${h} ${primaryS}% ${primaryL}%`;

  const accentLightL = Math.min(l + 37, 96);
  const accentDarkL = Math.max(l - 35, 10);
  const accentLightS = Math.max(s - 30, 15);
  const accentStr = isDark
    ? `${h} ${accentLightS}% ${accentDarkL}%`
    : `${h} ${accentLightS}% ${accentLightL}%`;

  const accentFgStr = isDark
    ? `${h} ${Math.min(s + 10, 90)}% ${Math.min(primaryL + 6, 88)}%`
    : `${h} ${Math.min(s + 5, 80)}% ${Math.max(l - 23, 18)}%`;

  root.style.setProperty("--primary", primaryStr);
  root.style.setProperty("--ring", primaryStr);
  root.style.setProperty("--sidebar-primary", primaryStr);
  root.style.setProperty("--sidebar-ring", primaryStr);
  root.style.setProperty("--accent", accentStr);
  root.style.setProperty("--accent-foreground", accentFgStr);
  root.style.setProperty("--sidebar-accent", accentStr);
  root.style.setProperty("--sidebar-accent-foreground", accentFgStr);
  root.style.setProperty("--chart-1", primaryStr);
}

export function useBranchTheme() {
  const { user } = useAuth();
  const { data: branches } = useBranches();
  const branchList = branches ?? [];

const authColor = user?.activeBranch?.color ?? null;
  const branchListColor = branchList.find((b) => b.id === user?.activeBranchId)?.color ?? null;
  const color = authColor ?? branchListColor;

  useEffect(() => {
    applyBranchColor(color);

    const observer = new MutationObserver(() => {
      applyBranchColor(color);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      observer.disconnect();
    };
  }, [color]);
}
