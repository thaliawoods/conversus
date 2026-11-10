// La carte mentale d'un ConVersus : où poser chaque bulle, comment dessiner ses racines, comment vit la fleur.
import { alea, chemin } from './contour'
import type { Debat, MsgConv, Position } from './conversus'
import fleurDaccord from './assets/daccord.svg'
import fleurPlutotDaccord from './assets/plutot da.svg'
import fleurNeutre from './assets/neutre.svg'
import fleurPlutotDesaccord from './assets/plutot desaccord.svg'
import fleurDesaccord from './assets/desaccord.svg'

export type Pt = [number, number]

export const FLEURS: Record<Position, string> = {
  daccord: fleurDaccord, plutot_daccord: fleurPlutotDaccord, neutre: fleurNeutre,
  plutot_desaccord: fleurPlutotDesaccord, desaccord: fleurDesaccord,
}

export const VERT = '#233d34'

// ---------------------------------------------------------------- les personnes

// Une couleur par personne et par débat, dans l'ordre d'arrivée : jamais deux fois la même (jusqu'à 12).
// Couleurs claires, lisibles sur les bulles sombres ; `fonce` les assombrit pour les fonds blancs.
const PALETTE = ['#c9a8ff', '#ff9aa8', '#7fe0cf', '#ffc27a', '#9ec2ff', '#ff9bd9',
                 '#b9e88a', '#ecc59c', '#86d8f2', '#f2dc7a', '#d6c1f5', '#ffa98a']
export const GRIS_ANONYME = '#b8bccf'

export function couleursDe(d: Pick<Debat, 'question' | 'msgs'>) {
  const c = new Map<string, string>()
  for (const nom of [d.question.qui, ...d.msgs.map(m => m.qui)]) {
    if (nom === 'anonyme' || c.has(nom)) continue
    c.set(nom, PALETTE[c.size % PALETTE.length])
  }
  return (nom: string) => (nom === 'anonyme' ? GRIS_ANONYME : c.get(nom) ?? PALETTE[0])
}

// ---------------------------------------------------------------- la vie de la fleur

// Chaque message et chaque avis réveille la fleur ; l'effet s'estompe de moitié toutes les 20 minutes.
const DEMI_VIE = 20 * 60_000
export function vitalite(d: Debat, maintenant: number) {
  const poids = (iso: string, w: number) => w * 0.5 ** (Math.max(0, maintenant - Date.parse(iso)) / DEMI_VIE)
  let score = 0
  for (const m of d.msgs) {
    score += poids(m.date, 1)
    for (const a of Object.values(m.avis)) score += poids(a.t, .5)
  }
  return 1 - Math.exp(-score / 4)
}

// Mélange de deux couleurs hexadécimales (k = 0 → a, k = 1 → b).
export function melange(a: string, b: string, k: number) {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')
}
export const fonce = (c: string) => melange(c, '#1f2340', .42)

// ---------------------------------------------------------------- les bulles

const hache = (i: number, graine: number) => {
  let h = Math.imul(i + 1, 2654435761) ^ graine
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export type Lettre = 'aime' | 'rejete' | null
// Plus un message reçoit d'avis (rapporté au nombre de participant·es), plus ses lettres changent :
// au prorata, elles prennent la police des likes ou celle des dislikes. La taille suit le solde.
export function typo(m: MsgConv, participants: number) {
  const n = m.pour + m.contre
  const part = n ? Math.min(1, n / Math.max(2, participants - 1)) : 0
  const lettres: Lettre[] = [...m.dit].map((l, i) => {
    if (!n || l.trim() === '' || hache(i, 1) >= part) return null
    return hache(i, 2) * n < m.pour ? 'aime' : 'rejete'
  })
  const solde = Math.max(-4, Math.min(6, m.pour - m.contre))
  return { lettres, taille: 14.5 * (1 + .04 * solde) }
}

// La bulle elle-même : vert profond quand le message est plus aimé que rejeté, gris sinon,
// rongée sur les bords quand il est plus rejeté qu'aimé.
export const teinteBulle = (m: MsgConv): 'vive' | 'grise' | 'rongee' =>
  m.pour > m.contre ? 'vive' : m.contre > m.pour ? 'rongee' : 'grise'

// Ce qui prime sur la teinte : les idées posées directement sur la fleur (`principale`),
// et mes propres messages (`mienne`, que je suis seul·e à voir de cette couleur).
export const genreBulle = (m: MsgConv) =>
  (m.repondA === undefined ? ' principale' : '') + (m.mien ? ' mienne' : '')

// ---------------------------------------------------------------- la disposition

export const FLEUR_TAILLE = 250
export const BULLE_L = 230
const MARGE = 18
const ANGLE_OR = Math.PI * (3 - Math.sqrt(5))

// Hauteur prévue d'une bulle (pilule de 230 px, texte à 14,5 px).
export const hauteurBulle = (m: MsgConv) => 44 + Math.ceil(Math.max(1, [...m.dit].length) / 25) * 20

export type Place = {
  m: MsgConv
  x: number
  y: number
  w: number
  h: number
  angle: number         // direction dans laquelle la bulle s'éloigne de son parent
  parent: Place | null
  enfants: Place[]
}

type Rect = { x: number; y: number; w: number; h: number; proprio?: number }
const chevauche = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + MARGE * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + MARGE * 2

// Distance du centre au bord d'une bulle dans une direction donnée.
const etendue = (w: number, h: number, a: number) => {
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
  return Math.min(c ? w / 2 / c : Infinity, s ? h / 2 / s : Infinity)
}
export function bord(p: { x: number; y: number; w: number; h: number }, a: number, rentre = 0): Pt {
  const t = etendue(p.w, p.h, a) - rentre
  return [p.x + Math.cos(a) * t, p.y + Math.sin(a) * t]
}

// Le brin qui sort d'une bulle sans réponse, et la fleur à son bout.
export const BRIN = 150
export function bouton(p: Place): { pied: Pt; tete: Pt } {
  const pied = bord(p, p.angle, 6)
  return { pied, tete: [pied[0] + Math.cos(p.angle) * BRIN, pied[1] + Math.sin(p.angle) * BRIN] }
}

// Les fils filent plutôt à l'horizontale, comme les pilules.
function horizontaliser(a: number) {
  const cible = Math.cos(a) >= 0 ? 0 : Math.PI
  let d = cible - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * .45
}

// Chaque bulle est posée une fois pour toutes, dans l'ordre des messages : partout pareil, rien ne saute.
// Elle part de son parent (ou de la fleur) dans le prolongement du fil, juste au bout d'une racine courte,
// et cherche la première place libre autour.
export function disposer(msgs: MsgConv[]): Map<number, Place> {
  const places = new Map<number, Place>()
  const pris: Rect[] = [{ x: 0, y: 0, w: FLEUR_TAILLE * .9, h: FLEUR_TAILLE * .9 }]
  let idees = 0
  for (const m of msgs) {
    const P = m.repondA !== undefined ? places.get(m.repondA) ?? null : null
    const w = BULLE_L, h = hauteurBulle(m)
    const [ox, oy] = P ? [P.x, P.y] : [0, 0]
    // Les idées partent tout autour de la fleur ; les réponses dans le prolongement de leur fil.
    const dir = P ? horizontaliser(P.angle) : -Math.PI / 2 + idees++ * ANGLE_OR
    const ecart0 = 70 + 90 * alea(m.id, 31)   // longueur visible de la racine
    let pose: { x: number; y: number; a: number } | null = null
    chercher: for (const plus of [0, 60, 130, 220, 330, 470, 650]) {
      for (const off of [0, .35, -.35, .7, -.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8]) {
        const a = dir + off
        const depart = P ? etendue(P.w, P.h, a) : FLEUR_TAILLE * .4
        const dist = depart + etendue(w, h, a) + ecart0 + plus
        const r = { x: ox + Math.cos(a) * dist, y: oy + Math.sin(a) * dist, w, h }
        // La fleur du parent tombera quand on lui répond : sa place est libre pour ses réponses.
        if (!pris.some(q => (q.proprio === undefined || q.proprio !== m.repondA) && chevauche(q, r))) { pose = { ...r, a }; break chercher }
      }
    }
    pose ??= { x: ox + Math.cos(dir) * 1200, y: oy + Math.sin(dir) * 1200, a: dir }
    const p: Place = { m, x: pose.x, y: pose.y, w, h, angle: pose.a, parent: P, enfants: [] }
    P?.enfants.push(p)
    places.set(m.id, p)
    pris.push({ x: p.x, y: p.y, w, h })
    const { tete } = bouton(p)
    const mi = bord(p, p.angle)
    pris.push({ x: (mi[0] + tete[0]) / 2, y: (mi[1] + tete[1]) / 2, w: 60, h: 60, proprio: m.id })
    pris.push({ x: tete[0], y: tete[1], w: 90, h: 90, proprio: m.id })
  }
  return places
}

// Le fil d'une racine : les messages au-dessus (pour le contexte) et toutes les réponses en dessous.
export function fil(p: Place): number[] {
  const ids: number[] = []
  for (let x = p.parent; x; x = x.parent) ids.push(x.m.id)
  const descendre = (q: Place) => { ids.push(q.m.id); q.enfants.forEach(descendre) }
  descendre(p)
  return ids
}

// ---------------------------------------------------------------- les racines

export type Trace = {
  centre: string                // la ligne de la racine, tracée en trait (pousse, sélection)
  epaisseur: number             // épaisseur du trait
  degrade: { de: Pt; a: Pt }    // le dégradé va du rouge (au départ) au vert (à l'arrivée)
  feuilles: { x: number; y: number; a: number; k: number }[]
}

const deg = (a: number) => a * 180 / Math.PI

// Les couleurs du trait, d'après les racines du projet (assets/new).
export const RACINE_DEPART = '#FF4F4F'
export const RACINE_ARRIVEE = VERT

// Une racine de S à T, tracée d'un trait régulier d'après les racines du projet (assets/new) :
// une grande courbe en S (neutre, plutôt pas d'accord), la même courbe hérissée de dents (pas d'accord),
// avec des feuilles (d'accord). Toujours la même pour un même message ; l'énergie donne l'épaisseur.
// `avant` et `apres` prolongent la racine en ligne droite jusque sous les bulles qu'elle relie :
// même si une bulle est plus petite que prévu (ou en train d'éclore), la racine reste collée à elle.
export function racine(S: Pt, T: Pt, id: number, position: Position | undefined, force: number,
                       o: { fine?: boolean; avant?: Pt; apres?: Pt } = {}): Trace {
  const dx = T[0] - S[0], dy = T[1] - S[1], L = Math.hypot(dx, dy) || 1
  const u = [dx / L, dy / L], n = [-u[1], u[0]]
  const point = (t: number, ecart: number): Pt =>
    [S[0] + u[0] * L * t + n[0] * ecart, S[1] + u[1] * L * t + n[1] * ecart]

  // La courbe en S : monte, redescend, et revient se poser dans l'axe à chaque bout.
  const sens = alea(id, 1) < .5 ? -1 : 1
  const A = o.fine ? 4 + 4 * alea(id, 4) : Math.min(42, L * (.1 + .06 * alea(id, 2)))
  const decale = .85 + .3 * alea(id, 3)      // un S un peu dissymétrique, comme à la main
  const courbe = (t: number) => {
    const s = Math.pow(t, decale)
    return sens * A * Math.sin(2 * Math.PI * s) * Math.sin(Math.PI * t) ** .35
  }

  const pts: Pt[] = []
  if (position === 'desaccord' && !o.fine) {
    // Hérissée : des petites dents irrégulières, alternées, posées sur la courbe.
    const nb = Math.max(8, Math.round(L / 8))
    const dent = 4 + 4 * force
    for (let j = 0; j <= nb; j++) {
      const t = j / nb
      const amorti = Math.min(1, t * 7, (1 - t) * 7)
      const d = j === 0 || j === nb ? 0 : (j % 2 ? 1 : -1) * dent * (.35 + .65 * alea(id, 100 + j)) * amorti
      pts.push(point(t, courbe(t) + d))
    }
  } else {
    for (let k = 0; k <= 48; k++) pts.push(point(k / 48, courbe(k / 48)))
  }

  const epaisseur = o.fine ? 3 : 4.5 + 3 * force
  const tangente = (i: number) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    return Math.atan2(b[1] - a[1], b[0] - a[0])
  }
  const surBord = (t: number, cote: 1 | -1) => {
    const i = Math.round(t * (pts.length - 1)), phi = tangente(i), w = epaisseur * .4
    return { x: pts[i][0] - Math.sin(phi) * w * cote, y: pts[i][1] + Math.cos(phi) * w * cote, phi }
  }

  const nbFeuilles = o.fine ? 0 : position === 'daccord' ? Math.min(7, Math.round(L / 60)) : position === 'plutot_daccord' ? Math.min(3, Math.round(L / 120)) : 0
  const feuilles = Array.from({ length: nbFeuilles }, (_, j) => {
    const cote = (j % 2 ? 1 : -1) as 1 | -1
    const { x, y, phi } = surBord(.18 + .74 * (j + .5) / nbFeuilles, cote)
    return { x, y, a: deg(phi) + cote * 48, k: .9 + .5 * alea(id, 40 + j) }
  })

  const tout = [...(o.avant ? [o.avant] : []), ...pts, ...(o.apres ? [o.apres] : [])]
  return { centre: chemin(tout), epaisseur, degrade: { de: S, a: T }, feuilles }
}

// La feuille posée sur les racines d'accord (dessinée autour de l'origine).
export const FEUILLE = 'M0 0 C 4 -5.5 11 -6 17 0 C 11 6 4 5.5 0 0 Z'
