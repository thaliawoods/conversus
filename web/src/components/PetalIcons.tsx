import { useId } from "react";

// Fleurs de la créa (Figma), un pétale répété par rotation.
const FIVE_PETAL = "M202.211 57.8433C202.211 97.5098 154.23 145.74 145.74 145.74C134.485 145.74 89.2696 97.5097 89.2696 57.8433C89.2696 18.1769 116.011 11.3861 145.74 11.3848C170.625 11.3848 202.211 18.1769 202.211 57.8433Z";

// Fleur à 5 pétales (canal ouvert, Lancer un ConVersus…), du bleu glacé au bleu nuit au centre (Repeat group 13.svg).
// viewBox recadré sur les pétales (le fichier Figma laisse ~9 % de vide), comme le logo de Synthesis.
// flat : bleu clair uni, sans le centre sombre (listes de la barre de gauche).
export function PetalFlower({ className = "petal-flower", flat = false }: { className?: string; flat?: boolean }) {
  const gradient = `petal-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={className} viewBox="8.4 4.1 274 274" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="145.74" y1="39.2706" x2="145.74" y2="145.738" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a9d4ff" />
          <stop offset="1" stopColor="#061d3d" />
        </linearGradient>
      </defs>
      {[0, 72, 144, 216, 288].map((angle) => (
        <path key={angle} d={FIVE_PETAL} fill={flat ? "#a9d4ff" : `url(#${gradient})`} className={flat ? "petal-split" : undefined} transform={`rotate(${angle} 145.74 145.74)`} />
      ))}
    </svg>
  );
}
