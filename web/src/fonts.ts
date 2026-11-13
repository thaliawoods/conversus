import { useSyncExternalStore } from "react";
import type { ReactionValue } from "./pages/Chat";

// Fonts offered when writing: the default one, then one per reaction (same fonts as MOOD_FONTS in Debate.tsx).
export const FONTS: { value: string | undefined; label: string; mood?: ReactionValue }[] = [
  { value: undefined, label: "Neutre" },
  { value: "LigaSans", label: "Content", mood: "leaf" },
  { value: "LoveAndRage", label: "En colère", mood: "thorn" },
  { value: "Nudles", label: "Triste", mood: "wilt" },
  // Set aside for now, kept to bring them back later:
  // { value: "Tremplin", label: "Tremplin" },
  // { value: "PicNic", label: "PicNic" },
];

const DEFAULT_FONT = "Josafronde";

const RETIRED_FONTS = ["FixelPont"];

// Lets people who want to read easily turn the special fonts off. Remembered in this browser.
const PLAIN_FONTS_KEY = "conversus-plain-fonts";
const listeners = new Set<() => void>();

function readPlainFonts() {
  try {
    return localStorage.getItem(PLAIN_FONTS_KEY) === "1";
  } catch {
    return false;
  }
}

let plainFonts = readPlainFonts();

function setPlainFonts(plain: boolean) {
  plainFonts = plain;
  try {
    if (plain) localStorage.setItem(PLAIN_FONTS_KEY, "1");
    else localStorage.removeItem(PLAIN_FONTS_KEY);
  } catch {
    // Storage blocked: the choice still holds until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpecialFonts() {
  const plain = useSyncExternalStore(subscribe, () => plainFonts);
  return { special: !plain, toggleSpecial: () => setPlainFonts(!plain) };
}

export function shownFont(font?: string) {
  return font && RETIRED_FONTS.includes(font) ? undefined : font;
}

export function fontFamily(font?: string, special = true) {
  if (!special) return "var(--font-text)";
  return `"${shownFont(font) ?? DEFAULT_FONT}", var(--font-text)`;
}
