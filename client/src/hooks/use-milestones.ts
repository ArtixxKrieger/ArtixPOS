import { useRef, useCallback } from "react";

const MILESTONES = [
  { threshold: 0.01,   label: "First sale of the day!",  emoji: "🎉" },
  { threshold: 1000,   label: "₱1,000 reached!",          emoji: "🔥" },
  { threshold: 5000,   label: "₱5,000 — amazing!",        emoji: "⚡" },
  { threshold: 10000,  label: "₱10,000 today!",            emoji: "🏆" },
  { threshold: 25000,  label: "₱25,000 — incredible!",     emoji: "💫" },
  { threshold: 50000,  label: "₱50,000 — legendary!",      emoji: "🌟" },
  { threshold: 100000, label: "₱100K — you're the GOAT!",  emoji: "👑" },
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

export function useMilestones(
  onMilestone: (label: string, emoji: string) => void,
) {
  const prev = useRef(getTodayTotal());

  const check = useCallback(
    (newTotal: number) => {
      const seen = seenSet();
      for (const m of MILESTONES) {
        if (!seen.has(m.threshold) && prev.current < m.threshold && newTotal >= m.threshold) {
          markSeen(m.threshold);
          onMilestone(m.label, m.emoji);
          break;
        }
      }
      prev.current = newTotal;
    },
    [onMilestone],
  );

  return { check };
}
