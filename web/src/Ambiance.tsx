import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { MsgConv } from './App'
import type { Emotion } from './emotions'

export type Coup = { emotion: Emotion; force: number; n: number }

const DUREE = 2800

// Détecte la dernière réaction arrivée et en fait un coup d'ambiance de moins de 3 s.
export function useCoup(msgs: MsgConv[], audience: number) {
  const vues = useRef<Set<string> | null>(null)
  const [coup, setCoup] = useState<Coup | null>(null)

  useEffect(() => {
    const cle = (id: number, qui: string, e: Emotion) => `${id}|${qui}|${e}`
    const avant = vues.current
    vues.current = new Set(msgs.flatMap(m => m.reactions.map(r => cle(m.id, r.qui, r.emotion))))
    if (!avant) return
    const nouvelles = msgs.flatMap(m => m.reactions
      .filter(r => !avant.has(cle(m.id, r.qui, r.emotion)))
      .map(r => ({ m, r })))
    if (!nouvelles.length) return
    const { m, r } = nouvelles[nouvelles.length - 1]
    const meme  = m.reactions.filter(x => x.emotion === r.emotion).length
    const force = audience ? Math.min(1, Math.sqrt(meme / audience)) : 0
    setCoup(c => ({ emotion: r.emotion, force, n: (c?.n ?? 0) + 1 }))
  }, [msgs, audience])

  useEffect(() => {
    if (!coup) return
    const t = setTimeout(() => setCoup(c => (c === coup ? null : c)), DUREE)
    return () => clearTimeout(t)
  }, [coup])

  return coup
}

const ROSES = ['#f4a9cf', '#f7c4de', '#e9a0d8']

const calme = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const alea = (k: number, s: number) => {
  const x = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function bougerLaScene(scene: HTMLElement, coup: Coup) {
  if (calme()) return
  if (coup.emotion === 'colere') {
    const a = 3 + 6 * coup.force
    const pas = Array.from({ length: 14 }, (_, k) => {
      const amorti = 1 - k / 14
      const x = (k % 2 ? 1 : -1) * a * amorti * (0.6 + alea(k, 1) * 0.4)
      const y = (alea(k, 2) - 0.5) * a * amorti
      return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }
    })
    scene.animate([...pas, { transform: 'translate(0, 0)' }], { duration: 1100, easing: 'ease-out' })
  }
  if (coup.emotion === 'surprise') {
    const ombre = (d: number) =>
      `drop-shadow(${d}px 0 rgba(230,30,50,.8)) drop-shadow(${-d}px 0 rgba(110,0,30,.7))`
    scene.animate([
      { transform: 'translate(0, 0)',     filter: 'none' },
      { transform: 'translate(-7px, 2px)', filter: ombre(5) },
      { transform: 'translate(6px, -1px)', filter: ombre(3) },
      { transform: 'translate(-3px, 0)',   filter: ombre(6) },
      { transform: 'translate(0, 0)',     filter: 'none' },
    ], { duration: 340, delay: 120, easing: 'steps(1, end)' })
  }
}

export default function Ambiance({ coup, scene }: { coup: Coup | null; scene: RefObject<HTMLElement | null> }) {
  useEffect(() => {
    if (coup && scene.current) bougerLaScene(scene.current, coup)
  }, [coup, scene])

  if (!coup) return null
  const f = coup.force
  return (
    <div key={coup.n} className={'amb amb-' + coup.emotion} style={{ '--f': 0.45 + 0.55 * f } as CSSProperties}>
      <div className="amb-teinte" />

      {coup.emotion === 'tristesse' && Array.from({ length: Math.round(40 + 70 * f) }, (_, k) => (
        <i key={k} className="amb-goutte" style={{
          left: `${alea(k, 3) * 100}%`,
          animationDelay: `${alea(k, 4) * 1.2}s`,
          animationDuration: `${0.55 + alea(k, 5) * 0.4}s`,
          height: `${12 + alea(k, 6) * 16}px`,
        }} />
      ))}

      {coup.emotion === 'surprise' && Array.from({ length: Math.round(5 + 6 * f) }, (_, k) => (
        <i key={k} className="amb-bande" style={{
          top: `${alea(k, 10) * 95}%`,
          height: `${4 + alea(k, 11) * 26}px`,
          animationDelay: `${0.08 + alea(k, 12) * 0.15}s`,
        }} />
      ))}

      {coup.emotion === 'joie' && <>
        {Array.from({ length: Math.round(20 + 25 * f) }, (_, k) => (
          <i key={k} className="amb-petale" style={{
            left: `${alea(k, 7) * 100}%`,
            animationDelay: `${alea(k, 8) * 1.2}s`,
            rotate: `${alea(k, 9) * 180}deg`,
            scale: `${0.6 + alea(k, 13) * 0.9}`,
            background: ROSES[k % ROSES.length],
          }} />
        ))}
      </>}
    </div>
  )
}
