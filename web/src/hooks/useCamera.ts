import { useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD = 5;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_SPEED = 0.01;
const WHEEL_MAX = 50;

const START = { x: 0, y: 0, zoom: 1 };

export function useCamera() {
  const [camera, setCamera] = useState(START);
  const drag = useRef<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const dragged = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
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
    setCamera((current) => ({ ...current, x: start.cameraX + dx, y: start.cameraY + dy }));
  }

  function handlePointerUp() {
    drag.current = null;
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (dragged.current) {
      event.stopPropagation();
      dragged.current = false;
    }
  }

  function recenter() {
    setCamera(START);
  }

  // One step of zoom around the centre of the screen (zoom buttons).
  function zoomBy(factor: number) {
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
