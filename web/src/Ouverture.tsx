import { useEffect, useState } from 'react'

type Temps = 'approche' | 'choc' | 'tresse' | 'reunion'

export default function Ouverture({ sujet, onFini }: { sujet: string; onFini: () => void }) {
  const [temps, setTemps] = useState<Temps>('approche')

  useEffect(() => {
    const a = setTimeout(() => setTemps('choc'),    900)
    const b = setTimeout(() => setTemps('tresse'),  1500)
    const c = setTimeout(() => setTemps('reunion'), 2500)
    const d = setTimeout(onFini,                    3600)
    return () => [a, b, c, d].forEach(clearTimeout)
  }, [onFini])

  return (
    <div className={'ouverture ' + temps} onClick={onFini}>
      <svg viewBox="0 0 400 240" className="scene" aria-hidden>
        <defs>
          <linearGradient id="oG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c07ae8" /><stop offset="100%" stopColor="#6f5fd6" />
          </linearGradient>
          <filter id="oLueur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" result="f" />
            <feMerge><feMergeNode in="f" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g className="ronce g">
          <path className="tige-anim"
                d="M-10 120 C 70 118 110 96 150 120 C 178 136 168 170 142 162
                   C 122 156 128 126 158 124" />
          {[[38,113],[74,106],[108,104],[146,132]].map(([x, y], i) => (
            <path key={i} className="epine"
                  d={`M${x} ${y} L${x - 7} ${y - 13} L${x + 5} ${y - 3} Z`} />
          ))}
        </g>

        <g className="ronce d">
          <path className="tige-anim"
                d="M410 120 C 330 122 290 144 250 120 C 222 104 232 70 258 78
                   C 278 84 272 114 242 116" />
          {[[362,127],[326,134],[292,136],[254,108]].map(([x, y], i) => (
            <path key={i} className="epine"
                  d={`M${x} ${y} L${x + 7} ${y + 13} L${x - 5} ${y + 3} Z`} />
          ))}
        </g>

        <circle className="impact" cx="200" cy="120" r="8" filter="url(#oLueur)" />

        <g className="astre a" transform="translate(142 148)">
          <path d="M0 -22 C3 -7 6 -3 22 0 C6 3 3 8 0 22 C-3 8 -6 3 -22 0 C-6 -3 -3 -7 0 -22 Z"
                fill="url(#oG)" />
        </g>
        <g className="astre b" transform="translate(258 92)">
          <path d="M0 -17 C2 -5 5 -2 17 0 C5 2 2 6 0 17 C-2 6 -5 2 -17 0 C-5 -2 -2 -5 0 -17 Z"
                fill="url(#oG)" />
        </g>
      </svg>

      <div className="ouverture-txt">
        <div className="ouverture-etiq">Le ConVersus s'ouvre</div>
        <div className="ouverture-sujet">{sujet}</div>
        <div className="ouverture-passer">clique pour passer</div>
      </div>
    </div>
  )
}
