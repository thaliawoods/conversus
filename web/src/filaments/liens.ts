// Les filaments du débat : à quoi ressemble le lien entre deux messages, et la fleur du centre.
// Coordonnées « carte » (celles des bulles : y vers le bas) ; la scène 3D les retourne.
import { alea } from '../contour'
import { FLEUR_TAILLE, melange, type Place, type Pt } from '../plan'
import type { MsgConv, Position } from '../conversus'

// L'allure d'un lien selon la position du message par rapport à ce à quoi il répond.
// D'accord : tressé serré, lumineux. Pas d'accord : effiloché, nerveux, rouge.
type Allure = { A: string; B: string; eclat: number; energie: number; frise: number; torsion: number }
const ALLURES: Record<Position | 'germe', Allure> = {
  daccord:          { A: '#7CFFB2', B: '#E8FF8A', eclat: 1.15, energie: .45, frise: 0,   torsion: 3.2 },
  plutot_daccord:   { A: '#6FE3D2', B: '#B8FFC8', eclat: 1,    energie: .55, frise: .08, torsion: 2.8 },
  neutre:           { A: '#AEB3FF', B: '#E9E4FF', eclat: .9,   energie: .65, frise: .18, torsion: 2.4 },
  plutot_desaccord: { A: '#FF9A6B', B: '#FFC9A0', eclat: .85,  energie: .85, frise: .5,  torsion: 2 },
  desaccord:        { A: '#FF4F4F', B: '#FF9A5C', eclat: .85,  energie: 1.1, frise: 1,   torsion: 1.6 },
  germe:            { A: '#7D82C8', B: '#B9BCFF', eclat: .45,  energie: .4,  frise: .1,  torsion: 2 },
}
export const allure = (m: MsgConv) => ALLURES[m.analyse?.position ?? 'germe']

// Le chemin d'un lien : du centre du parent (ou du cœur de la fleur) au centre de la bulle.
// Les bulles recouvrent les bouts : le filament plonge dessous, il reste toujours collé.
export function courbeLien(p: Place): Pt[] {
  const [px, py] = p.parent ? [p.parent.x, p.parent.y] : [0, 0]
  const a = Math.atan2(p.y - py, p.x - px)
  const S: Pt = p.parent ? [px, py] : [Math.cos(a) * FLEUR_TAILLE * .1, Math.sin(a) * FLEUR_TAILLE * .1]
  const T: Pt = [p.x, p.y]
  const L = Math.hypot(T[0] - S[0], T[1] - S[1]) || 1
  const u = [(T[0] - S[0]) / L, (T[1] - S[1]) / L], n = [-u[1], u[0]]
  const courbe = (alea(p.m.id, 5) - .5) * L * .45
  const P1: Pt = [S[0] + u[0] * L * .33 + n[0] * courbe, S[1] + u[1] * L * .33 + n[1] * courbe]
  const P2: Pt = [S[0] + u[0] * L * .66 - n[0] * courbe * .5, S[1] + u[1] * L * .66 - n[1] * courbe * .5]
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32, s = 1 - t
    return [
      s * s * s * S[0] + 3 * s * s * t * P1[0] + 3 * s * t * t * P2[0] + t * t * t * T[0],
      s * s * s * S[1] + 3 * s * s * t * P1[1] + 3 * s * t * t * P2[1] + t * t * t * T[1],
    ] as Pt
  })
}

// La fleur du centre en filaments : six pétales, chacun une boucle qui part du cœur et y revient.
// Plus le débat vit, plus elle est ouverte, colorée et vive ; fanée, elle devient lavande et lente.
export const PETALES = 6
export function petale(i: number, vie: number, temps: number, mouvement: number): Pt[] {
  const R = FLEUR_TAILLE / 2 * (.74 + .26 * vie)
  const tour = temps * mouvement * 2 * Math.PI / (90 - 60 * vie)
  // chaque pétale respire un peu à son rythme
  const souffle = 1 + (.03 + .05 * vie) * Math.sin(temps * mouvement * (.5 + .1 * i) + i * 1.7)
  const axe = -Math.PI / 2 + i * 2 * Math.PI / PETALES + tour
  const demi = Math.PI / PETALES
  return Array.from({ length: 49 }, (_, k) => {
    const phi = -demi + 2 * demi * k / 48
    const r = R * souffle * Math.pow(Math.max(0, Math.cos(phi * PETALES / 2)), .5)
    return [Math.cos(axe + phi) * r, Math.sin(axe + phi) * r] as Pt
  })
}
export const couleursFleur = (vie: number) => ({
  A: melange('#2B2F66', '#FF4F4F', vie),      // au cœur
  B: melange('#A6ABE0', '#FFEA4F', vie),      // aux pointes
  eclat: .55 + .7 * vie,
  energie: .3 + .7 * vie,
})
