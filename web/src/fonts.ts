export const FONTS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "BBB Poppins TN" },
  { value: "Tremplin", label: "Tremplin" },
  { value: "OpenSans", label: "BBB Open Sans" },
  { value: "LigaSans", label: "Liga Sans" },
  { value: "Coxinelle", label: "Coxinelle" },
];

export function fontFamily(font?: string) {
  return font ? `"${font}", var(--font-text)` : undefined;
}
