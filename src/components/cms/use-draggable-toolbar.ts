"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Draggable floating editor toolbars (user request: "toolbars default at the
 * bottom, draggable anywhere"). Returns:
 *
 *  - ref      → attach to the fixed toolbar element
 *  - pos      → {x,y} when the user has moved it, null = default spot
 *  - dragging → true while a drag is in progress (disables transitions)
 *  - handlers → spread onto the grip handle button. The drag uses POINTER
 *               CAPTURE so every pointermove/pointerup is retargeted to the
 *               handle and handled as React synthetic events (which render).
 *  - reset    → double-click the handle to return to the default spot
 *
 * Position is clamped to the viewport while dragging AND on window resize,
 * and is persisted per storage key so the spot survives reloads.
 */
export function useDraggableToolbar(storageKey: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
    w: number;
    h: number;
  } | null>(null);

  const clamp = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      return {
        x: Math.min(Math.max(8, x), Math.max(8, vw - w - 8)),
        y: Math.min(Math.max(8, y), Math.max(8, vh - h - 8)),
      };
    },
    [],
  );

  /* Restore the saved spot (validated against the current viewport). */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof saved.x !== "number" || typeof saved.y !== "number") return;
      const el = ref.current;
      const w = el?.offsetWidth ?? 320;
      const h = el?.offsetHeight ?? 56;
      setPos(clamp(saved.x, saved.y, w, h));
    } catch {
      /* corrupted storage — default spot */
    }
  }, [storageKey, clamp]);

  /* Keep a moved toolbar on-screen when the viewport shrinks/rotates. */
  useEffect(() => {
    if (!pos) return;
    const onResize = () => {
      const el = ref.current;
      const w = el?.offsetWidth ?? 320;
      const h = el?.offsetHeight ?? 56;
      setPos((current) => (current ? clamp(current.x, current.y, w, h) : current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos, clamp]);

  const persist = useCallback(
    (next: { x: number; y: number } | null) => {
      try {
        if (next) window.localStorage.setItem(storageKey, JSON.stringify(next));
        else window.localStorage.removeItem(storageKey);
      } catch {
        /* storage unavailable — position is session-only */
      }
    },
    [storageKey],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      drag.current = {
        px: event.clientX,
        py: event.clientY,
        ox: rect.left,
        oy: rect.top,
        w: rect.width,
        h: rect.height,
      };
      setDragging(true);
      setPos({ x: rect.left, y: rect.top });
      /* Capture the pointer: every following move/up lands on the handle. */
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture unsupported — drag still works within the handle */
      }
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d) return;
      setPos(
        clamp(d.ox + (event.clientX - d.px), d.oy + (event.clientY - d.py), d.w, d.h),
      );
    },
    [clamp],
  );

  const onPointerUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setPos((current) => {
      if (current) persist(current);
      return current;
    });
  }, [persist]);

  const reset = useCallback(() => {
    setPos(null);
    persist(null);
  }, [persist]);

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onDoubleClick: reset,
  };

  return { ref, pos, dragging, handlers, reset };
}
