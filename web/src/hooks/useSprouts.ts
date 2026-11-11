import { useMemo, useRef, type CSSProperties } from "react";
import { ARRIVE_SECONDS } from "../components/Branches";

// Opening a debate: largest gap between two branches, and the latest a branch may wait (s).
// A big debate gets smaller gaps: everything is shown in under 2 s.
const CASCADE = 0.15;
const CASCADE_MAX = 0.6;
// A message starts to fade in when its branch is this far on its way to it.
const FADE_AT = 0.6;

// birth: when the branch starts to grow (s, same clock as the WebGL loop).
// delay: when its message starts to fade in (ms after it is first shown), null = shown right away.
export type Sprout = { birth: number; delay: number | null };

// Branches grow one after the other when a debate opens, a new reply grows right away.
// Each branch grows only once: coming back to a debate shows it fully grown.
function useSprouts(messages: { id: number }[]) {
  const sprouts = useRef(new Map<number, Sprout>());

  const current = useMemo(() => {
    const known = sprouts.current;
    const now = performance.now() / 1000;
    // No message known yet: this is a debate being opened.
    const opening = !messages.some((message) => known.has(message.id));
    const gap = Math.min(CASCADE, CASCADE_MAX / Math.max(1, messages.length - 1));
    let order = 0;
    for (const message of messages) {
      if (known.has(message.id)) continue;
      if (opening) {
        const wait = order * gap;
        known.set(message.id, { birth: now + wait, delay: Math.round((wait + ARRIVE_SECONDS * FADE_AT) * 1000) });
      } else {
        // A new reply: its message is there at once, its branch grows towards it.
        known.set(message.id, { birth: now, delay: null });
      }
      order++;
    }
    return known;
  }, [messages]);

  // Style of a message: fades in when its branch reaches it, unless its branch grew long ago.
  function appear(id: number): CSSProperties | undefined {
    const sprout = current.get(id);
    if (!sprout || sprout.delay === null) return { animation: "none" };
    const grownLongAgo = performance.now() / 1000 - sprout.birth > ARRIVE_SECONDS + 2;
    return grownLongAgo ? { animation: "none" } : { animationDelay: `${sprout.delay}ms` };
  }

  return { sprouts: current, appear };
}

export default useSprouts;
