import { useEffect, useRef, useState } from "react";

type Options = {
  storageKey: string;
  initial: number;
  min: number;
  max: number;
  // Largeur maximale autorisée selon la place disponible au moment du geste.
  room?: () => number;
};

function readStored(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // stockage indisponible : la largeur vaut pour cette page seulement
  }
}

// Largeur réglable à la souris (glisser), au clavier (flèches) et remise à zéro au double-clic.
export function useResizableWidth({ storageKey, initial, min, max, room }: Options) {
  const [width, setWidth] = useState(() => readStored(storageKey, initial));
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);
  // Quand la fenêtre change de taille, la place disponible change : on recalcule.
  const [, setViewport] = useState(0);
  useEffect(() => {
    const handleResize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const clamp = (value: number) => Math.round(Math.max(min, Math.min(max, room ? room() : max, value)));

  function apply(value: number) {
    const next = clamp(value);
    setWidth(next);
    store(storageKey, next);
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!start.current) return;
    apply(start.current.width + event.clientX - start.current.x);
  }

  function onPointerUp() {
    start.current = null;
    setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const step = event.shiftKey ? 60 : 20;
    if (event.key === "ArrowLeft") apply(width - step);
    else if (event.key === "ArrowRight") apply(width + step);
    else if (event.key === "Home") apply(min);
    else if (event.key === "End") apply(max);
    else return;
    event.preventDefault();
  }

  return {
    width: clamp(width),
    dragging,
    handleProps: {
      role: "separator",
      "aria-orientation": "vertical" as const,
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuenow": clamp(width),
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
      onDoubleClick: () => apply(initial),
    },
  };
}
