// Le ConVersus en 3D : où vit chaque message dans l'espace, et le tracé des racines entre eux.
// On part de la disposition à plat (plan.ts : disposer), pensée pour qu'aucun message n'en chevauche un autre
// vu de face, et on donne à chaque branche une élévation : une idée part un peu vers l'avant ou vers l'arrière
// de la fleur, ses réponses continuent dans la même direction. Vu de face, on retrouve la carte ;
// en tournant autour de la fleur, l'arbre prend du volume.
// Coordonnées de la scène : x vers la droite, y vers le haut, z vers la caméra de départ.
import { alea } from '../contour'
import { FLEUR_TAILLE, type Place } from '../plan'

export type V3 = [number, number, number]

export type Noeud = {
  id: number
  parent: number | null
  base: V3          // position de repos
  dir: V3           // direction dans laquelle il s'éloigne de son parent (unitaire)
  libre: boolean    // posé directement sur la fleur : du texte qui flotte, sans bulle
}

const OR = 0.6180339887
export const ELEVATION_MAX = .75     // radians : jusqu'où une branche sort du plan de la fleur

const norme = (v: V3) => Math.hypot(v[0], v[1], v[2]) || 1
export const unitaire = (v: V3): V3 => { const n = norme(v); return [v[0] / n, v[1] / n, v[2] / n] }
export const plus = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
export const moins = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vectoriel = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

export function spatialiser(places: Map<number, Place>): Map<number, Noeud> {
  const noeuds = new Map<number, Noeud>()
  const elevation = new Map<number, number>()
  let idee = 0
  for (const p of places.values()) {          // dans l'ordre d'arrivée : le parent est toujours déjà placé
    const parent = p.parent ? noeuds.get(p.parent.m.id) ?? null : null
    const origine: V3 = parent ? parent.base : [0, 0, 0]
    const [ox, oy] = p.parent ? [p.parent.x, p.parent.y] : [0, 0]
    const plat = Math.hypot(p.x - ox, p.y - oy)
    // Une idée reçoit son élévation (suite du nombre d'or : bien répartie) ; ses réponses la gardent, à peu près.
    const e = parent
      ? Math.max(-1.1, Math.min(1.1, elevation.get(parent.id)! + (alea(p.m.id, 12) - .5) * .5))
      : ((idee++ * OR) % 1 - .5) * 2 * ELEVATION_MAX
    elevation.set(p.m.id, e)
    const base: V3 = [p.x, -p.y, origine[2] + plat * Math.tan(e)]
    noeuds.set(p.m.id, { id: p.m.id, parent: parent?.id ?? null, base, dir: unitaire(moins(base, origine)), libre: !p.parent })
  }
  return noeuds
}

// La racine entre deux points : une courbe douce qui sort un peu de la ligne droite, dans un plan propre à chaque lien.
export function courbe3(S: V3, T: V3, id: number): V3[] {
  const d = moins(T, S), L = norme(d), u: V3 = [d[0] / L, d[1] / L, d[2] / L]
  let n1 = vectoriel(u, [0, 1, 0])
  if (norme(n1) < .1) n1 = vectoriel(u, [1, 0, 0])
  n1 = unitaire(n1)
  const n2 = vectoriel(u, n1)
  const a = alea(id, 9) * Math.PI * 2, c = (alea(id, 5) - .5) * L * .45
  const off: V3 = plus(plus([0, 0, 0], n1, Math.cos(a) * c), n2, Math.sin(a) * c)
  const P1 = plus(plus(S, u, L * .33), off), P2 = plus(plus(S, u, L * .66), off, -.5)
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32, s = 1 - t
    const k = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t]
    return [0, 1, 2].map(c => k[0] * S[c] + k[1] * P1[c] + k[2] * P2[c] + k[3] * T[c]) as V3
  })
}

// Le départ d'une idée : un point du cœur de la fleur, dans sa direction.
export const departFleur = (n: Noeud): V3 => [n.dir[0] * FLEUR_TAILLE * .1, n.dir[1] * FLEUR_TAILLE * .1, n.dir[2] * FLEUR_TAILLE * .1]

// Le léger flottement d'un message (et du bout de sa racine) : trois sinus lents, propres à chacun.
export function derive(id: number, t: number, amplitude: number): V3 {
  const p = alea(id, 21) * 6.28, q = alea(id, 22) * 6.28, r = alea(id, 23) * 6.28
  return [
    (Math.sin(t * .23 + p) * .7 + Math.sin(t * .11 + q) * .3) * amplitude,
    (Math.sin(t * .19 + q) * .7 + Math.sin(t * .07 + r) * .3) * amplitude,
    (Math.sin(t * .17 + r) * .7 + Math.sin(t * .13 + p) * .3) * amplitude,
  ]
}
