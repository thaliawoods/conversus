import { useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD = 5;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_SPEED = 0.01;
const WHEEL_MAX = 50;
// Inertia: after a drag, the view keeps going and slows down.
const GLIDE_DECAY = 0.3; // seconds for the speed to drop to about a third
const GLIDE_MIN_SPEED = 15; // px/s, below this the glide stops
const GLIDE_MAX_SPEED = 4000; // px/s
const SAMPLE_WINDOW = 100; // ms of pointer history used to measure the throw
const HOLD_STILL = 60; // ms without moving before release: no throw

const START = { x: 0, y: 0, zoom: 1 };

export function useCamera() {
  const [camera, setCamera] = useState(START);
  const drag = useRef<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const dragged = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const samples = useRef<{ time: number; x: number; y: number }[]>([]);
  const glideFrame = useRef(0);

  function stopGlide() {
    cancelAnimationFrame(glideFrame.current);
    glideFrame.current = 0;
  }

  function startGlide(vx: number, vy: number) {
    stopGlide();
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const decay = Math.exp(-dt / GLIDE_DECAY);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) < GLIDE_MIN_SPEED) {
        glideFrame.current = 0;
        return;
      }
      setCamera((current) => ({ ...current, x: current.x + vx * dt, y: current.y + vy * dt }));
      glideFrame.current = requestAnimationFrame(step);
    };
    glideFrame.current = requestAnimationFrame(step);
  }

  useEffect(() => () => cancelAnimationFrame(glideFrame.current), []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(glideFrame.current);
      glideFrame.current = 0;
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
    drag.current = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
    dragged.current = false;
    samples.current = [{ time: event.timeStamp, x: event.clientX, y: event.clientY }];
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
    setCamera((current) => ({ ...current, x: start.cameraX + dx, y: start.cameraY + dy }));
    samples.current.push({ time: event.timeStamp, x: event.clientX, y: event.clientY });
    samples.current = samples.current.filter((sample) => event.timeStamp - sample.time <= SAMPLE_WINDOW);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const wasDragging = drag.current !== null && dragged.current;
    drag.current = null;
    const history = samples.current;
    samples.current = [];
    if (!wasDragging || history.length < 2) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const first = history[0];
    const last = history[history.length - 1];
    if (event.timeStamp - last.time > HOLD_STILL) return;
    const seconds = (last.time - first.time) / 1000;
    if (seconds <= 0) return;
    let vx = (last.x - first.x) / seconds;
    let vy = (last.y - first.y) / seconds;
    const speed = Math.hypot(vx, vy);
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
