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

// Light enough to read on the night background; two lightness levels double the
// number of colours that can be told apart.
export function userColor(username: string) {
  const value = hash(username.trim().toLowerCase());
  const hue = value % 360;
  const lightness = (value >>> 9) % 2 === 0 ? 70 : 80;
  return `hsl(${hue} 80% ${lightness}%)`;
}

// Exposes the colour as --user-color, so stylesheet states (a lit thread, an offline
// member) can still change or dim it. Anonymous messages keep the default colour.
export function userStyle(username: string | undefined): CSSProperties | undefined {
  if (!username || username === "Anonyme") return undefined;
  return { "--user-color": userColor(username) } as CSSProperties;
}
