import { useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD = 5;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_SPEED = 0.01;
const WHEEL_MAX = 50;
// Inertie : glissade légère après un lâcher rapide.
const GLIDE_DECAY = 110; // ms ; distance parcourue ≈ vitesse × GLIDE_DECAY
const GLIDE_SAMPLE = 80; // ms de mouvement pris en compte pour la vitesse au lâcher
const GLIDE_MIN_SPEED = 0.05; // px/ms
const GLIDE_MAX_SPEED = 3; // px/ms

const START = { x: 0, y: 0, zoom: 1 };

export function useCamera() {
  const [camera, setCamera] = useState(START);
  const drag = useRef<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const dragged = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trail = useRef<{ x: number; y: number; time: number }[]>([]);
  const glide = useRef<number | null>(null);

  function stopGlide() {
    if (glide.current !== null) cancelAnimationFrame(glide.current);
    glide.current = null;
  }

  function startGlide(vx: number, vy: number) {
    stopGlide();
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const keep = Math.exp(-dt / GLIDE_DECAY);
      // Distance exacte parcourue pendant dt avec une vitesse qui décroît exponentiellement.
      const travel = GLIDE_DECAY * (1 - keep);
      const moveX = vx * travel;
      const moveY = vy * travel;
      vx *= keep;
      vy *= keep;
      setCamera((current) => ({ ...current, x: current.x + moveX, y: current.y + moveY }));
      glide.current = Math.hypot(vx, vy) < GLIDE_MIN_SPEED / 4 ? null : requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
  }

  useEffect(() => stopGlide, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      stopGlide();
      if (event.ctrlKey || event.metaKey) {
        const rect = viewport.getBoundingClientRect();
        const pointerX = event.clientX - rect.left - rect.width / 2;
        const pointerY = event.clientY - rect.top - rect.height / 2;
        const delta = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, event.deltaY));
        setCamera((current) => {
          const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.zoom * Math.exp(-delta * ZOOM_SPEED)));
          const ratio = zoom / current.zoom;
          return {
            x: pointerX - (pointerX - current.x) * ratio,
            y: pointerY - (pointerY - current.y) * ratio,
            zoom,
          };
        });
      } else {
        setCamera((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    stopGlide();
    trail.current = [{ x: event.clientX, y: event.clientY, time: event.timeStamp }];
    drag.current = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
    dragged.current = false;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!dragged.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!dragged.current) {
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    trail.current.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
    if (trail.current.length > 20) trail.current.shift();
    setCamera((current) => ({ ...current, x: start.cameraX + dx, y: start.cameraY + dy }));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const wasDragging = drag.current !== null && dragged.current;
    drag.current = null;
    if (!wasDragging || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Vitesse sur les derniers instants du geste ; si on s'est arrêté avant de lâcher, pas de glissade.
    const recent = trail.current.filter((point) => event.timeStamp - point.time <= GLIDE_SAMPLE);
    if (recent.length < 2) return;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const elapsed = Math.max(1, last.time - first.time);
    let vx = (last.x - first.x) / elapsed;
    let vy = (last.y - first.y) / elapsed;
    const speed = Math.hypot(vx, vy);
    if (speed < GLIDE_MIN_SPEED) return;
    if (speed > GLIDE_MAX_SPEED) {
      vx *= GLIDE_MAX_SPEED / speed;
      vy *= GLIDE_MAX_SPEED / speed;
    }
    startGlide(vx, vy);
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (dragged.current) {
      event.stopPropagation();
      dragged.current = false;
    }
  }

  function recenter() {
    stopGlide();
    setCamera(START);
  }

  // One step of zoom around the centre of the screen (zoom buttons).
  function zoomBy(factor: number) {
    stopGlide();
    setCamera((current) => {
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.zoom * factor));
      const ratio = zoom / current.zoom;
      return { x: current.x * ratio, y: current.y * ratio, zoom };
    });
  }

  return {
    camera,
    viewportRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleClickCapture,
    recenter,
    zoomBy,
  };
}
