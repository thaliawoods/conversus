import type { ReactionValue } from "./pages/Chat";

export const FONTS: { value: string | undefined; label: string; mood?: ReactionValue }[] = [
  { value: undefined, label: "Josafronde" },
  { value: "Tremplin", label: "Tremplin" },
  { value: "LigaSans", label: "Liga Sans", mood: "leaf" },
  { value: "LoveAndRage", label: "Love and Rage", mood: "thorn" },
  { value: "Nudles", label: "Nudles", mood: "wilt" },
  { value: "PicNic", label: "PicNic" },
];

const DEFAULT_FONT = "Josafronde";

const RETIRED_FONTS = ["FixelPont"];

export function shownFont(font?: string) {
  return font && RETIRED_FONTS.includes(font) ? undefined : font;
}

export function fontFamily(font?: string) {
  return `"${shownFont(font) ?? DEFAULT_FONT}", var(--font-text)`;
}
