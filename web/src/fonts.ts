const DEFAULT_FONT = "Josafronde";

const RETIRED_FONTS = ["FixelPont"];

export function shownFont(font?: string) {
  return font && RETIRED_FONTS.includes(font) ? undefined : font;
}

export function fontFamily(font?: string) {
  return `"${shownFont(font) ?? DEFAULT_FONT}", var(--font-text)`;
}
