// L'ancienne branche dessinée à partir des réactions : ne sert plus qu'à la page #test-arbre.
// L'herbe (HERBE) sert aussi au sol du nouveau jardin de racines.
import { EMOTIONS, compter, type Emotion, type Reaction } from './emotions'
import { onduler } from './contour'

export const BASE    = 46
// 21 points mélangeant la courbe (repos), la branche qui pend (tristesse) et l'éclair (surprise).
function pointsBranche(L: number, raideur: number, tristesse: number) {
  const monte = [[0, BASE], [.33 * L, BASE], [.6 * L, BASE - 16], [L, BASE - 30]]
  const pend  = [[0, BASE], [.28 * L, BASE - 8], [.5 * L, BASE + 30], [.55 * L, BASE + 1.15 * L]]
  const c = monte.map((p, j) => [0, 1].map(d => p[d] + (pend[j][d] - p[d]) * tristesse))
  const courbe = (t: number) => {
    const m = 1 - t, w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t]
    return [0, 1].map(d => c.reduce((acc, q, j) => acc + q[d] * w[j], 0))
  }
  const A = 6 + .16 * L
  const coudes = [0, 1, 2, 3, 4, 5].map(k => {
    const p = courbe(k / 5)
    if (k === 0 || k === 5) return p
    const [a, b] = [courbe(k / 5 - .01), courbe(k / 5 + .01)]
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1
    const s = k % 2 ? -A : A
    return [p[0] - dy / n * s, p[1] + dx / n * s]
  })
  return Array.from({ length: 21 }, (_, k) => {
    const t = k / 20
    const s = Math.min(Math.floor(t * 5), 4), f = t * 5 - s
    const lisse = courbe(t)
    return [0, 1].map(d => {
      const brisee = coudes[s][d] + (coudes[s + 1][d] - coudes[s][d]) * f
      return lisse[d] + (brisee - lisse[d]) * raideur
    })
  })
}

export const TEINTE_BRANCHE: Record<Emotion | 'repos', string> = {
  repos: '#4e5675', joie: '#7a5fb0', colere: '#7a2a3c', tristesse: '#aab1d6', surprise: '#1d2136',
}

// Herbe sur la ligne de sol : tirage stable, toujours au même endroit.
const hasard = (k: number) => { const x = Math.sin(k * 91.17) * 43758.5453; return x - Math.floor(x) }
const VERTS = ['#8db564', '#a3c477', '#b9d48c', '#cfe2a6', '#dcebb8']
const brin = (k: number, x: number) => {
  const r = hasard(k + 300)
  const h = r > .88 ? 34 + hasard(k + 400) * 20 : r < .1 ? 5 + hasard(k + 500) * 7 : 12 + hasard(k + 600) * 18
  return {
    x, h,
    pli: (hasard(k + 700) - .5) * h * .9,
    large: 1.8 + hasard(k + 800) * 1.6,
    vert: VERTS[Math.min(4, Math.floor(hasard(k + 900) * 4 + (h > 34 ? 1 : 0)))],
    retard: hasard(k + 1000) * .8,
  }
}
const HERBE_BASE = [
  ...Array.from({ length: 320 }, (_, k) => brin(k, (k + hasard(k)) / 320 * 100)),
  ...Array.from({ length: 60 }, (_, k) => brin(k + 2000, 46 + hasard(k + 3000) * 8)),
]

// La prairie : plus haute, et irrégulière par zones (deux ondes lentes qui se croisent).
export const HERBE = HERBE_BASE.map(h => {
  const zone = .55 + .45 * Math.sin(h.x * .31 + 1) + .3 * Math.sin(h.x * .83 + 4)
  return { ...h, h: h.h * 1.4 * Math.max(.35, zone), pli: h.pli * 1.5 }
})

// Ancienne branche dessinée à partir des réactions : ne sert plus qu'à la page #test-arbre.
export function geometrie(m: { id: number; dit: string; reactions: Reaction[] }, audience: number) {
  const n    = compter(m.reactions)
  const part = (e: Emotion) => (audience ? Math.sqrt(n[e] / audience) : 0)
  const L0   = Math.min(170, 60 + [...m.dit].length * .9)
  const raideur = Math.min(1, part('surprise') * 1.6)
  const pts  = onduler(pointsBranche(L0, raideur, Math.min(1, part('tristesse') * 1.5)).map(([x, y]) => [x * 1.7, y]), m.id)
  const L    = L0 * 1.7
  const H    = Math.max(...pts.map(p => p[1])) + 12
  const d    = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const fleur = n.joie ? 0.6 + 0.9 * part('joie') : 0
  const couronne = Math.max(0, Math.min(1, (part('joie') - .45) / .35))
  const nbEpines = Math.ceil(10 * part('colere'))
  const epines = [4, 14, 9, 17, 6, 12, 3, 15, 8, 11].slice(0, nbEpines).map((k, j) => {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1]
    const deg = Math.atan2(by - ay, bx - ax) * 180 / Math.PI
    return { x: ax, y: ay, a: deg + (j % 2 ? 90 : -90) }
  })
  const dominante: Emotion | 'repos' = m.reactions.length
    ? EMOTIONS.reduce((best, e) => (n[e.id] > n[best] ? e.id : best), 'joie' as Emotion)
    : 'repos'
  return { n, part, L, pts, H, d, fleur, couronne, epines, dominante, raideur }
}
