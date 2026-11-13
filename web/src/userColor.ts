import type { CSSProperties } from "react";

// FNV-1a: the same name gives the same number in every browser, so a user keeps
// their colour on any computer and whoever is logged in.
function hash(text: string) {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0)!;
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

// A fixed palette rather than any hue: in HSL a big slice of the wheel reads as green, so random
// hues gave lots of greens. OKLCH hues spaced around the wheel look evenly different, and the same
// lightness and chroma keep them all soft and equally readable on the night background.
const HUES = [0, 30, 60, 90, 125, 160, 195, 230, 260, 290, 315, 340];

export function userColor(username: string) {
  const hue = HUES[hash(username.trim().toLowerCase()) % HUES.length];
  return `oklch(80% 0.09 ${hue})`;
}

// Exposes the colour as --user-color, so stylesheet states (a lit thread, an offline
// member) can still change or dim it. Anonymous messages keep the default colour.
export function userStyle(username: string | undefined): CSSProperties | undefined {
  if (!username || username === "Anonyme") return undefined;
  return { "--user-color": userColor(username) } as CSSProperties;
}
