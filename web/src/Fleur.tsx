// La fleur au cœur du débat (dessin de neutre.svg, pétale par pétale).
// Plus le débat vit, plus elle est colorée, ouverte et animée ; sans interaction, elle fane vers #434871.
import { useId, type CSSProperties } from 'react'
import { melange } from './plan'

const PETALE = 'M314.834 84.8557C314.834 137.508 233.832 201.527 219.499 201.527C200.499 201.527 124.164 137.508 124.164 84.8557C124.164 32.2038 170.831 16.6596 219.499 23.1881C256.166 17.8574 314.834 32.2038 314.834 84.8557Z'
const FANE = '#434871'
// Fanée, la fleur garde du relief : pointes des pétales claires, cœur sombre, et un liseré clair
// qui détoure chaque pétale (sinon les six pétales se fondent en une seule boule violette).
const FANE_POINTE = '#9EA3D8'
const FANE_COEUR = '#23264A'
const FANE_LISERE = '#C4C7EE'

type Props = {
  vie: number            // 0 = fanée, 1 = en pleine forme
  taille: number
  className?: string
  titre?: string
  onClick?: () => void
}

export default function Fleur({ vie, taille, className = '', titre, onClick }: Props) {
  const id = useId().replace(/:/g, '')
  const f = 1 - vie
  const haut = melange('#FFEA4F', FANE_POINTE, f * .92)
  const bas  = melange('#FF4F4F', FANE_COEUR, f * .92)
  const lisere = (f * .75).toFixed(2)
  const pollen = vie > .35 ? Math.round(vie * 9) : 0
  const style = {
    width: taille, height: taille,
    '--vie': vie,
    '--tour': `${Math.round(90 - 60 * vie)}s`,
    '--souffle': `${(4.2 - 2 * vie).toFixed(2)}s`,
    filter: `drop-shadow(0 0 ${Math.round(6 + 34 * vie)}px rgba(255, ${Math.round(150 + 60 * vie)}, 90, ${(.15 + .5 * vie).toFixed(2)}))`,
  } as CSSProperties

  const dessin = (
    <svg viewBox="0 0 439 439" aria-hidden>
      <defs>
        <linearGradient id={id} x1="219.499" y1="21.7852" x2="219.499" y2="201.527" gradientUnits="userSpaceOnUse">
          <stop stopColor={haut} />
          <stop offset="1" stopColor={bas} />
        </linearGradient>
      </defs>
      <g className="fl-tourne">
        <g className="fl-ouvre">
          {[0, 60, 120, 180, 240, 300].map((r, i) => (
            <g key={r} transform={`rotate(${r} 219.5 219.5)`}>
              <path className="fl-petale" d={PETALE} fill={`url(#${id})`} style={{ animationDelay: `${-i * .45}s` }}
                    stroke={FANE_LISERE} strokeOpacity={lisere} strokeWidth={4} strokeLinejoin="round" />
            </g>
          ))}
        </g>
      </g>
      {Array.from({ length: pollen }, (_, i) => (
        <g key={i} className="fl-pollen" style={{ animationDuration: `${7 + (i % 4) * 2.5}s`, animationDelay: `${-i * 1.7}s` }}>
          <circle cx={219.5 + 150 + (i % 3) * 22} cy={219.5} r={4 + (i % 3) * 1.5} fill={melange('#FFE27A', FANE, f)} />
        </g>
      ))}
    </svg>
  )

  return onClick
    ? <button className={'fleur ' + className} style={style} title={titre} onClick={onClick}>{dessin}</button>
    : <span className={'fleur ' + className} style={style} title={titre}>{dessin}</span>
}
