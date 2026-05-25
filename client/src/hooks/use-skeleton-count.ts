import { useState, useEffect } from "react";

/**
 * Returns the number of skeleton items that fill the visible viewport area.
 *
 * @param itemHeight  Estimated height of one item in px (including gap).
 * @param headerOffset Pixels to subtract for headers/nav above the list.
 * @param minCount    Minimum skeletons to show (default 2).
 */
export function useViewportSkeletonCount(
  itemHeight: number,
  headerOffset = 200,
  minCount = 2,
): number {
  const calc = () => {
    const availH = Math.max(0, window.innerHeight - headerOffset);
    return Math.max(minCount, Math.ceil(availH / itemHeight));
  };
  const [count, setCount] = useState(calc);
  useEffect(() => {
    const handler = () => setCount(calc());
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemHeight, headerOffset, minCount]);
  return count;
}

/**
 * Returns the number of skeleton grid cards that fill the visible viewport.
 * Mirrors the Tailwind responsive breakpoints of a given grid.
 *
 * @param breakpoints Map of minWidth → colCount, e.g. { 0: 2, 640: 3, 1024: 4 }
 * @param rowHeight   Estimated height of one grid row in px (including gap).
 * @param headerOffset Pixels to subtract for headers above the grid.
 */
export function useGridSkeletonCount(
  breakpoints: Record<number, number>,
  rowHeight: number,
  headerOffset = 200,
): number {
  const calc = () => {
    const w = window.innerWidth;
    const sortedBreaks = Object.keys(breakpoints)
      .map(Number)
      .sort((a, b) => b - a);
    const cols = breakpoints[sortedBreaks.find((bp) => w >= bp) ?? sortedBreaks[sortedBreaks.length - 1]];
    const availH = Math.max(0, window.innerHeight - headerOffset);
    const rows = Math.max(2, Math.ceil(availH / rowHeight));
    return (cols ?? 1) * rows;
  };
  const [count, setCount] = useState(calc);
  useEffect(() => {
    const handler = () => setCount(calc());
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return count;
}
