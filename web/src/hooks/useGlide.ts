import { useEffect, useRef, useState } from "react";
import type { Placement } from "../layout";

export type Spot = Placement & { sag: number };

const DURATION = 0.8;
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

function same(a: Map<number, Spot>, b: Map<number, Spot>) {
  if (a.size !== b.size) return false;
  for (const [id, spot] of b) {
    const other = a.get(id);
    if (!other || Math.abs(other.x - spot.x) > 0.1 || Math.abs(other.y - spot.y) > 0.1 || Math.abs(other.sag - spot.sag) > 0.001) {
      return false;
    }
  }
  return true;
}

// Messages and stems slide from where they are shown to their new place, instead of jumping.
export function useGlide(targets: Map<number, Spot>) {
  const [shown, setShown] = useState(targets);
  const shownRef = useRef(targets);

  useEffect(() => {
    const from = shownRef.current;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || same(from, targets)) {
      shownRef.current = targets;
      setShown(targets);
      return;
    }
    const start = performance.now();
    let frame = 0;
    function step(now: number) {
      const k = ease(Math.min(1, (now - start) / 1000 / DURATION));
      const next = new Map<number, Spot>();
      for (const [id, to] of targets) {
        const was = from.get(id) ?? to;
        next.set(id, {
          ...to,
          x: was.x + (to.x - was.x) * k,
          y: was.y + (to.y - was.y) * k,
          sag: was.sag + (to.sag - was.sag) * k,
        });
      }
      shownRef.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [targets]);

  return shown;
}
