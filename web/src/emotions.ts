
export type Emotion = 'joie' | 'colere' | 'tristesse' | 'surprise'

export type Reaction = {
  qui: string
  emotion: Emotion
  anonyme: boolean
}

export type Style = { police: string; couleur: string; opacite: number }

export const REPOS: Style = { police: 'Tremplin', couleur: '#353b58', opacite: 1 }

export const EMOTIONS: { id: Emotion; nom: string; style: Style }[] = [
  { id: 'joie',      nom: 'Joie',      style: { police: 'Coxinelle', couleur: '#8b5fd6', opacite: 1 } },
  { id: 'colere',    nom: 'Colère',    style: { police: 'PicNic',    couleur: '#c0283f', opacite: 1 } },
  { id: 'tristesse', nom: 'Tristesse', style: { police: 'Nudles',    couleur: '#8f97b8', opacite: .8 } },
  { id: 'surprise',  nom: 'Surprise',  style: { police: 'FixelPont', couleur: '#1d2136', opacite: 1 } },
]

export const styleDe = (e: Emotion | null, repos = REPOS.police): Style =>
  e === null ? { ...REPOS, police: repos } : EMOTIONS.find(x => x.id === e)!.style

export function compter(reactions: Reaction[]): Record<Emotion, number> {
  const n = { joie: 0, colere: 0, tristesse: 0, surprise: 0 }
  for (const r of reactions) n[r.emotion]++
  return n
}

// Même (i, graine) donne toujours le même nombre entre 0 et 1.
function hache(i: number, graine: number) {
  let h = Math.imul(i + 1, 2654435761) ^ graine
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Part de lettres transformées = réactions ÷ audience ; tirage stable par position.
export function teintes(lettres: string[], reactions: Reaction[], audience: number): (Emotion | null)[] {
  const n     = compter(reactions)
  const total = reactions.length
  const part  = audience ? Math.min(total / audience, 1) : 0
  return lettres.map((l, i) => {
    if (l.trim() === '' || hache(i, 1) >= part) return null
    let u = hache(i, 2) * total
    for (const e of EMOTIONS) {
      if (u < n[e.id]) return e.id
      u -= n[e.id]
    }
    return null
  })
}
