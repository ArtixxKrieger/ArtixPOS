import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import {
  getFloatEnabled, getIconSize, getIconOpacity,
  getFloatDraggable, getFloatPosition, setFloatPosition,
} from "@/lib/ai-store";

export function AiFloatButton() {
  const [, setLocation] = useLocation();
  const [enabled, setEnabled] = useState(false);
  const [iconSize, setIconSizeState] = useState(56);
  const [iconOpacity, setIconOpacityState] = useState(100);
  const [draggable, setDraggableState] = useState(false);

  // Position state: null = use default CSS (bottom-right), otherwise absolute coords
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    isDragging: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sync = () => {
      setEnabled(getFloatEnabled());
      setIconSizeState(getIconSize());
      setIconOpacityState(getIconOpacity());
      const isDraggable = getFloatDraggable();
      setDraggableState(isDraggable);
      if (isDraggable) {
        const saved = getFloatPosition();
        if (saved) setPos(saved);
      } else {
        // When draggable is turned off, reset to default position
        setPos(null);
      }
    };

    sync();
    window.addEventListener("storage", sync);
    const interval = setInterval(sync, 500);
    return () => {
      window.removeEventListener("storage", sync);
      clearInterval(interval);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggable) return;
    e.preventDefault();
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      isDragging: false,
    };
    btn.setPointerCapture(e.pointerId);
  }, [draggable]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggable || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.isDragging && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    dragRef.current.isDragging = true;

    const newX = Math.max(0, Math.min(window.innerWidth - iconSize, dragRef.current.origX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - iconSize, dragRef.current.origY + dy));
    setPos({ x: newX, y: newY });
  }, [draggable, iconSize]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const wasDragging = dragRef.current.isDragging;
    dragRef.current = null;

    if (wasDragging && pos) {
      setFloatPosition(pos);
    } else if (!wasDragging) {
      setLocation("/ai");
    }
  }, [pos, setLocation]);

  if (!enabled) return null;

  const innerSize = Math.round(iconSize * 0.43);

  const positionStyle: React.CSSProperties = pos && draggable
    ? { left: pos.x, top: pos.y, bottom: "auto", right: "auto" }
    : {};

  return (
    <button
      ref={btnRef}
      data-testid="button-ai-float"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={draggable ? undefined : () => setLocation("/ai")}
      style={{
        width: iconSize,
        height: iconSize,
        opacity: iconOpacity / 100,
        touchAction: draggable ? "none" : undefined,
        cursor: draggable ? "grab" : "pointer",
        ...positionStyle,
      }}
      className={[
        "fixed z-50 rounded-full shadow-2xl shadow-primary/30 bg-primary hover:bg-primary/90 flex items-center justify-center transition-opacity duration-200",
        pos && draggable ? "" : "bottom-24 right-4 md:bottom-6 md:right-6",
        !draggable ? "active:scale-95 transition-all" : "",
      ].join(" ")}
      aria-label="Open AI assistant"
    >
      <Sparkles style={{ width: innerSize, height: innerSize }} className="text-white" />
    </button>
  );
}
