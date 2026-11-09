
const BRANCHE =
  'M50 3 C55 30 60 40 95 48 C62 54 56 64 50 97 C45 64 39 54 5 48 C40 40 45 30 50 3 Z'

export function Etoile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id="gA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9b7bf0" /><stop offset="100%" stopColor="#6f5fd6" />
        </linearGradient>
        <linearGradient id="gB" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c07ae8" /><stop offset="100%" stopColor="#8b5fd6" />
        </linearGradient>
      </defs>
      <path d={BRANCHE} fill="url(#gA)" opacity=".92"
            transform="rotate(38 50 50) scale(.86) translate(8 8)" />
      <path d={BRANCHE} fill="url(#gB)" transform="rotate(-6 50 50)" />
    </svg>
  )
}

export function EtoileMini({ className, couleur = '#8b5fd6' }:
  { className?: string; couleur?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <path fill={couleur} d={BRANCHE} />
    </svg>
  )
}
