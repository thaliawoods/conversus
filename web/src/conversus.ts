// Le ConVersus côté données : ce qu'on range dans les métadonnées du backend et comment on relit un débat.
import { metaDe, type MessageApi } from './api'

export type Position = 'daccord' | 'plutot_daccord' | 'neutre' | 'plutot_desaccord' | 'desaccord'

// Lecture d'un message : sa position par rapport à ce à quoi il répond, et son énergie (0 à 1).
export type Analyse = { position: Position; force: number }

export type Synthese = {
  issue: 'consensus' | 'majorite_pour' | 'majorite_contre' | 'partage' | 'sans_conclusion'
  resume: string
  // Chaque camp cite 1 ou 2 messages en exemple, avec ce qu'ils apportent.
  camps: { titre: string; idee: string; auteurs: string[]; exemples?: { id: number; pourquoi: string }[] }[]
}

// Likes et dislikes, rangés dans les métadonnées du message : un avis par personne.
export type Avis = Record<string, { v: 1 | -1; t: string }>

// Ce qu'on écrit dans metadata.conversus, selon le type de message.
export type Meta =
  | { type: 'chat'; police?: string; effet?: string }
  | { type: 'annonce'; canal: string; canalId: number; sujet: string }
  | { type: 'ouverture'; sujet: string; question: { qui: string; dit: string }; these?: string
      debut: string; source: { id: number; nom: string } }
  | { type: 'msg'; auteur?: string; repondA?: number; analyse?: Analyse; avis?: Avis }
  | { type: 'synthese'; ids: number[]; portee: string; synthese: Synthese; par: string }

export type MetaDe<T extends Meta['type']> = Extract<Meta, { type: T }>

export const PREFIXE_DEBAT = 'conversus-'

export type MsgConv = {
  id: number
  qui: string
  dit: string
  anonyme: boolean
  mien: boolean
  // Le message auquel celui-ci répond ; absent = une idée posée directement sur la fleur.
  repondA?: number
  analyse?: Analyse
  avis: Avis
  pour: number
  contre: number
  date: string
}

export type SyntheseFaite = { id: number; par: string; date: string; ids: number[]; portee: string; synthese: Synthese }

export type Debat = {
  canalId: number
  canalNom: string
  ouvertureId: number
  sujet: string
  question: { qui: string; dit: string }
  these?: string
  source: { id: number; nom: string }
  lanceur: string
  debut: number
  msgs: MsgConv[]
  syntheses: SyntheseFaite[]
  brut: Map<number, MessageApi>
}

const NOM_ANONYME = 'anonyme'

export const auteurDe = (m: MessageApi, meta?: { auteur?: string }) =>
  meta?.auteur ?? (m.anonymous ? NOM_ANONYME : m.user)

const POSITIONS: Position[] = ['daccord', 'plutot_daccord', 'neutre', 'plutot_desaccord', 'desaccord']

// Relit tout un canal de débat. Renvoie null tant que l'ouverture n'est pas arrivée.
export function lireDebat(canalId: number, canalNom: string, brut: MessageApi[], moiId: number): Debat | null {
  const ouv = brut.find(m => metaDe<Meta>(m).type === 'ouverture')
  if (!ouv) return null
  const o = metaDe<MetaDe<'ouverture'>>(ouv) as MetaDe<'ouverture'>

  const msgs: MsgConv[] = []
  const syntheses: SyntheseFaite[] = []
  const vus = new Set<number>()

  for (const m of brut) {
    const meta = metaDe<Meta>(m) as Meta
    if (meta.type === 'synthese' && meta.synthese) {
      syntheses.push({ id: m.id, par: meta.par ?? m.user, date: m.posted_at, ids: meta.ids ?? [], portee: meta.portee ?? '', synthese: meta.synthese })
    }
    if (meta.type !== 'msg') continue
    const avis = meta.avis ?? {}
    const valeurs = Object.values(avis)
    const a = meta.analyse
    msgs.push({
      id: m.id,
      qui: auteurDe(m, meta),
      dit: m.content,
      anonyme: m.anonymous,
      mien: m.user_id === moiId && !meta.auteur,
      // On ne garde un parent que s'il est plus ancien et présent : sinon l'idée part de la fleur.
      repondA: meta.repondA !== undefined && vus.has(meta.repondA) ? meta.repondA : undefined,
      analyse: a && POSITIONS.includes(a.position) ? { position: a.position, force: Number(a.force) || 0 } : undefined,
      avis,
      pour: valeurs.filter(x => x.v === 1).length,
      contre: valeurs.filter(x => x.v === -1).length,
      date: m.posted_at,
    })
    vus.add(m.id)
  }

  return {
    canalId, canalNom, ouvertureId: ouv.id,
    sujet: o.sujet, question: o.question, these: o.these, source: o.source,
    lanceur: ouv.user, debut: new Date(o.debut).getTime(),
    msgs, syntheses, brut: new Map(brut.map(m => [m.id, m])),
  }
}

export const NOMS_POSITION: Record<Position, string> = {
  daccord: 'd’accord', plutot_daccord: 'plutôt d’accord', neutre: 'neutre',
  plutot_desaccord: 'plutôt pas d’accord', desaccord: 'pas d’accord',
}

export const NOMS_ISSUE: Record<Synthese['issue'], string> = {
  consensus: 'Consensus', majorite_pour: 'Majorité pour', majorite_contre: 'Majorité contre',
  partage: 'Avis partagés', sans_conclusion: 'Sans conclusion',
}
