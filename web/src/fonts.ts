// Fonts offered when writing a debate message: two classics, then the ones with an effect.
// undefined = the default, Josafronde (the debate's text font).
export const FONTS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Josafronde" },
  { value: "Tremplin", label: "Tremplin" },
  { value: "LoveAndRage", label: "Love and Rage" },
  { value: "Nudles", label: "Nudles" },
  { value: "PicNic", label: "PicNic" },
  { value: "FixelPont", label: "FixelPont" },
];

const DEFAULT_FONT = "Josafronde";

export function fontFamily(font?: string) {
  return `"${font ?? DEFAULT_FONT}", var(--font-text)`;
}
