import { useMemo, useRef, type CSSProperties } from "react";
import { ARRIVE_SECONDS } from "../components/Branches";

const CASCADE = 0.15;
const CASCADE_MAX = 0.6;
const FADE_AT = 0.6;

export type Sprout = { birth: number; delay: number | null };

function useSprouts(messages: { id: number }[]) {
  const sprouts = useRef(new Map<number, Sprout>());

  const current = useMemo(() => {
    const known = sprouts.current;
    const now = performance.now() / 1000;
    const opening = !messages.some((message) => known.has(message.id));
    const gap = Math.min(CASCADE, CASCADE_MAX / Math.max(1, messages.length - 1));
    let order = 0;
    for (const message of messages) {
      if (known.has(message.id)) continue;
      if (opening) {
        const wait = order * gap;
        known.set(message.id, { birth: now + wait, delay: Math.round((wait + ARRIVE_SECONDS * FADE_AT) * 1000) });
      } else {
        known.set(message.id, { birth: now, delay: null });
      }
      order++;
    }
    return known;
  }, [messages]);

  function appear(id: number): CSSProperties | undefined {
    const sprout = current.get(id);
    if (!sprout || sprout.delay === null) return { animation: "none" };
    const grownLongAgo = performance.now() / 1000 - sprout.birth > ARRIVE_SECONDS + 2;
    return grownLongAgo ? { animation: "none" } : { animationDelay: `${sprout.delay}ms` };
  }

  return { sprouts: current, appear };
}

export default useSprouts;
