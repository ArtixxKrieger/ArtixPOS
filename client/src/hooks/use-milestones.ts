import { useRef, useCallback } from "react";

const MILESTONE_THRESHOLDS = [
  { threshold: 0.01,   label: (c: string) => `First sale of the day!`,              emoji: "🎉" },
  { threshold: 1000,   label: (c: string) => `${c}1,000 reached!`,                  emoji: "🔥" },
  { threshold: 5000,   label: (c: string) => `${c}5,000 — amazing!`,                emoji: "⚡" },
  { threshold: 10000,  label: (c: string) => `${c}10,000 today!`,                   emoji: "🏆" },
  { threshold: 25000,  label: (c: string) => `${c}25,000 — incredible!`,            emoji: "💫" },
  { threshold: 50000,  label: (c: string) => `${c}50,000 — legendary!`,             emoji: "🌟" },
  { threshold: 100000, label: (c: string) => `${c}100K — you're the GOAT!`,         emoji: "👑" },
];

function todayKey() {
  return `artix_ms_${new Date().toISOString().slice(0, 10)}`;
}
function totalKey() {
  return `artix_dt_${new Date().toISOString().slice(0, 10)}`;
}

function seenSet(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(todayKey()) || "[]")); }
  catch { return new Set(); }
}

function markSeen(threshold: number) {
  const s = seenSet(); s.add(threshold);
  try { localStorage.setItem(todayKey(), JSON.stringify([...s])); } catch (_) {}
}

export function getTodayTotal(): number {
  try { return parseFloat(localStorage.getItem(totalKey()) || "0") || 0; } catch { return 0; }
}

export function addToTodayTotal(amount: number): number {
  const next = getTodayTotal() + amount;
  try { localStorage.setItem(totalKey(), String(next)); } catch (_) {}
  return next;
}

const sessionFired = new Set<number>();

export function useMilestones(
  onMilestone: (label: string, emoji: string) => void,
  currency = "",
) {
  const prev = useRef(getTodayTotal());

  const check = useCallback(
    (newTotal: number) => {
      const seen = seenSet();
      for (const m of MILESTONE_THRESHOLDS) {
        if (
          !seen.has(m.threshold) &&
          !sessionFired.has(m.threshold) &&
          prev.current < m.threshold &&
          newTotal >= m.threshold
        ) {
          markSeen(m.threshold);
          sessionFired.add(m.threshold);
          onMilestone(m.label(currency), m.emoji);
          break;
        }
      }
      prev.current = newTotal;
    },
    [onMilestone, currency],
  );

  return { check };
}
