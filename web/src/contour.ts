// Le dessin en contour de l'arbre : chaque membre est une forme fermée, dessinée deux fois
// (en foncé un peu plus grande, puis en clair par-dessus) pour ne garder que la silhouette.

export type Pt = number[]

export const alea = (k: number, s: number) => { const x = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x) }

export const chemin = (pts: Pt[], ferme = false) =>
  pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + (ferme ? ' Z' : '')

export const angle = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0])

// La ligne centrale élargie de chaque côté, de `base` à `bout`.
export function membre(pts: Pt[], base: number, bout: number) {
  const n = pts.length - 1
  const cote = (s: number) => pts.map(([x, y], k) => {
    const [ax, ay] = pts[Math.max(k - 1, 0)], [bx, by] = pts[Math.min(k + 1, n)]
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1
    const w = base + (bout - base) * (k / n)
    return [x - dy / l * w * s, y + dx / l * w * s]
  })
  return chemin([...cote(1), ...cote(-1).reverse()], true)
}

export const brindille = (p: Pt, a: number, long: number): Pt[] =>
  Array.from({ length: 6 }, (_, k) => [p[0] + Math.cos(a) * long * k / 5, p[1] + Math.sin(a) * long * k / 5])

// Rend la ligne centrale irrégulière, de façon propre à chaque message : le pied reste collé au tronc.
export const onduler = (pts: Pt[], id: number) => {
  const f1 = alea(id, 1) * 6, f2 = alea(id, 2) * 6
  return pts.map(([x, y], k) => {
    const ecart = k ? (2.2 * Math.sin(k * .55 + f1) + 1.2 * Math.sin(k * 1.6 + f2)) * Math.min(1, k / 4) : 0
    return [x, y + ecart]
  })
}

// Les formes d'une branche (le bois, ses brindilles) et ses épines.
export function contourBranche(pts: Pt[], L: number, id: number, o: { fleur: number; raideur: number; nbEpines: number }) {
  const formes = [membre(pts, 6.5, 2)]
  const eclair = o.raideur > .3
  if (eclair) {
    // sur l'éclair, les brindilles partent des coudes, vers l'extérieur de l'angle
    for (const k of [4, 8, 12, 16]) {
      const [x, y] = pts[k], [ax, ay] = pts[k - 1], [bx, by] = pts[k + 1]
      const l1 = Math.hypot(ax - x, ay - y) || 1, l2 = Math.hypot(bx - x, by - y) || 1
      const a = Math.atan2(-((ay - y) / l1 + (by - y) / l2), -((ax - x) / l1 + (bx - x) / l2))
      formes.push(membre(brindille(pts[k], a, L * (.07 + alea(id, 40 + k) * .05)), 2.4, 1))
    }
  }
  const nb = eclair ? 0 : 2 + Math.floor(alea(id, 3) * 3)
  for (let j = 0; j < nb; j++) {
    const k = 6 + Math.floor((j + alea(id, 10 + j)) / nb * 11)
    const sens = (j + Math.floor(alea(id, 4) * 2)) % 2 ? 1 : -1
    const a = angle(pts[k], pts[k + 1]) + sens * (.45 + alea(id, 20 + j) * .4)
    const long = L * (.14 + alea(id, 30 + j) * .2)
    const brin = brindille(pts[k], a, long)
    formes.push(membre(brin, 3.2 - j * .3, 1.1))
    if (long > 34) formes.push(membre(brindille(brin[3], a - sens * .6, long * .35), 1.5, .8))
  }
  if (!o.fleur) {
    const a2 = angle(pts[18], pts[20])
    formes.push(membre(brindille(pts[20], a2 - .45, L * .1), 1.9, .9))
    formes.push(membre(brindille(pts[20], a2 + .35, L * .08), 1.7, .9))
  }
  const epines = [4, 14, 9, 17, 6, 12, 3, 15, 8, 11].slice(0, o.nbEpines).map((k, j) => {
    const th = angle(pts[k], pts[k + 1]), n = th + (j % 2 ? 1 : -1) * Math.PI / 2
    const w = 6.5 + (2 - 6.5) * k / 20 - 1
    const bx = pts[k][0] + Math.cos(n) * w, by = pts[k][1] + Math.sin(n) * w
    const p = (u: number, v: number) => `${(bx + u * Math.cos(th) + v * Math.cos(n)).toFixed(1)} ${(by + u * Math.sin(th) + v * Math.sin(n)).toFixed(1)}`
    return `M${p(-3.5, 0)} Q ${p(-1.5, 4)} ${p(-4.5, 9.5)} Q ${p(1, 4)} ${p(3.5, 0)} Z`
  })
  return { formes, epines }
}

// Un brin d'herbe en forme pleine, pied sur le sol (0, 0), pointe en (pli, -h).
export const brinD = (h: { h: number; pli: number; large: number }) =>
  `M${-h.large} 0 Q ${h.pli * .35 - h.large * .4} ${-h.h * .55} ${h.pli} ${-h.h} Q ${h.pli * .35 + h.large * .4} ${-h.h * .55} ${h.large} 0 Z`
