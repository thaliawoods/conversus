// Tout l'état partagé de l'app : session, canaux, fils de messages, débats, et la lecture des messages.
// Le backend n'a pas (encore) de websocket : on relit régulièrement.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import { ErreurApi, metaDe, type MessageApi } from './api'
import { PREFIXE_DEBAT, auteurDe, lireDebat, type Avis, type Debat, type Meta, type MetaDe, type SyntheseFaite } from './conversus'
import * as ia from './ia'

export type Session = { jeton: string; nom: string; id: number }
export type Canal = { id: number; nom: string }
export type MsgCanal = {
  id: number
  qui: string
  dit: string
  heure: string
  anonyme: boolean
  police?: string
  effet?: string
  annonce?: MetaDe<'annonce'>
  brut: MessageApi
}

const CLE_SESSION = 'conversus.session'
const RYTHME = 2500          // relecture du backend
const RELEVE = 15_000        // un message sans lecture depuis 15 s : n'importe qui la fait
const NOUVEL_ESSAI = 20_000  // après une erreur de lecture
const MDP_TEST = 'conversus'  // mot de passe des comptes de test (création à la volée si besoin)

function lireSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(CLE_SESSION) ?? 'null') } catch { return null }
}
function ecrireSession(s: Session | null) {
  try { s ? localStorage.setItem(CLE_SESSION, JSON.stringify(s)) : localStorage.removeItem(CLE_SESSION) } catch { /* stockage indisponible */ }
}

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export function versMsgCanal(m: MessageApi): MsgCanal {
  const meta = metaDe<Meta>(m) as Meta
  return {
    id: m.id, qui: auteurDe(m), dit: m.content, heure: heure(m.posted_at), anonyme: m.anonymous,
    police: meta.type === 'chat' ? meta.police : undefined,
    effet: meta.type === 'chat' ? meta.effet : undefined,
    annonce: meta.type === 'annonce' ? meta : undefined,
    brut: m,
  }
}

export function useConversus() {
  const [session, setSession] = useState<Session | null>(lireSession)
  const [canaux, setCanaux]   = useState<Canal[]>([])
  const [fils, setFils]       = useState<Record<number, MessageApi[]>>({})
  const [debats, setDebats]   = useState<Record<number, Debat>>({})
  const [erreur, setErreur]   = useState<string | null>(null)
  const [iaErreur, setIaErreur] = useState<string | null>(null)

  // Les canaux de débat connus : ceux où l'on est entré, et ceux annoncés dans nos canaux.
  const connus = useRef(new Map<number, string>())
  const canauxRef = useRef<Canal[]>([])
  const iaVol = useRef(new Set<number>())           // messages en cours de lecture
  const iaEchec = useRef(new Map<number, number>()) // message → date de l'échec
  const theseVol = useRef(new Set<number>())
  // Comptes de test pour simuler plusieurs personnes : jeton, id, et débats déjà rejoints.
  const identites = useRef(new Map<string, { jeton: string; id: number; canaux: Set<number> }>())
  const mesIds = useRef(new Set<number>())

  const deconnecter = useCallback(() => {
    ecrireSession(null)
    setSession(null)
    setCanaux([]); setFils({}); setDebats({})
    connus.current.clear()
    identites.current.clear()
    mesIds.current.clear()
  }, [])

  const gerer = useCallback((e: unknown) => {
    if (e instanceof ErreurApi && e.statut === 401) { deconnecter(); return }
    setErreur(e instanceof TypeError ? `Backend injoignable (${api.API})` : (e as Error).message)
  }, [deconnecter])

  const connecter = useCallback(async (nom: string, mdp: string, creer: boolean) => {
    if (creer) await api.inscription(nom, mdp)
    const jeton = await api.connexion(nom, mdp)
    const m = await api.moi(jeton)
    const s = { jeton, nom: m.username, id: m.id }
    ecrireSession(s)
    setSession(s)
    setErreur(null)
  }, [])

  // ------------------------------------------------------------ relecture
  const lireCanal = useCallback(async (s: Session, id: number) => {
    const brut = await api.messages(s.jeton, id)
    setFils(f => ({ ...f, [id]: brut }))
    for (const m of brut) {
      const meta = metaDe<Meta>(m) as Meta
      if (meta.type === 'annonce' && !connus.current.has(meta.canalId)) connus.current.set(meta.canalId, meta.canal)
    }
    return brut
  }, [])

  const lireUnDebat = useCallback(async (s: Session, id: number) => {
    const brut = await api.messages(s.jeton, id)
    const d = lireDebat(id, connus.current.get(id) ?? '', brut, s.id)
    if (d) setDebats(x => ({ ...x, [id]: d }))
    return d
  }, [])

  const tour = useRef(0)
  const relire = useCallback(async (s: Session) => {
    if (tour.current++ % 6 === 0 || !canauxRef.current.length) {
      const m = await api.moi(s.jeton)
      const tous = m.channels ?? []
      const vus = new Set<number>()
      const sources = tous.filter(c => !c.name.startsWith(PREFIXE_DEBAT) && !vus.has(c.id) && vus.add(c.id))
        .map(c => ({ id: c.id, nom: c.name }))
      for (const c of tous) if (c.name.startsWith(PREFIXE_DEBAT)) connus.current.set(c.id, c.name)
      canauxRef.current = sources
      setCanaux(sources)
    }
    await Promise.all(canauxRef.current.map(c => lireCanal(s, c.id)))
    await Promise.all([...connus.current.keys()].map(id => lireUnDebat(s, id)))
  }, [lireCanal, lireUnDebat])

  useEffect(() => {
    if (!session) return
    let fini = false, occupe = false
    const tic = async () => {
      if (occupe || fini) return
      occupe = true
      try { await relire(session); setErreur(null) } catch (e) { gerer(e) } finally { occupe = false }
    }
    tic()
    const t = setInterval(tic, RYTHME)
    return () => { fini = true; clearInterval(t) }
  }, [session, relire, gerer])

  // Modifier les métadonnées de messages : on relit le canal juste avant, pour ne pas écraser
  // un like ou une lecture arrivés entre-temps (le backend remplace tout notre espace).
  const modifier = useCallback(async (s: Session, canalId: number, changements: Map<number, (m: Meta) => Meta>) => {
    const frais = await api.messages(s.jeton, canalId)
    await Promise.all(frais.filter(m => changements.has(m.id))
      .map(m => api.editerMeta(s.jeton, m.id, changements.get(m.id)!(metaDe<Meta>(m) as Meta))))
  }, [])

  // ------------------------------------------------------------ la lecture des messages
  const analyserDebat = useCallback(async (s: Session, d: Debat, ids: number[]) => {
    ids.forEach(id => iaVol.current.add(id))
    try {
      const r = await ia.analyser(d, ids)
      setIaErreur(null)
      const changements = new Map<number, (m: Meta) => Meta>()
      for (const { id, position, force } of r.analyses) {
        changements.set(id, m => ({ ...m, analyse: { position, force } } as Meta))
      }
      if (!d.these && r.these && !theseVol.current.has(d.canalId)) {
        theseVol.current.add(d.canalId)
        changements.set(d.ouvertureId, m => ({ ...m, these: r.these } as Meta))
      }
      await modifier(s, d.canalId, changements)
    } catch (e) {
      ids.forEach(id => iaEchec.current.set(id, Date.now()))
      setIaErreur((e as Error).message)
    } finally {
      ids.forEach(id => iaVol.current.delete(id))
      await lireUnDebat(s, d.canalId).catch(() => null)
    }
  }, [lireUnDebat, modifier])

  // Chaque relecture : on lit ce qui ne l'est pas encore (l'auteur·ice d'abord, puis n'importe qui).
  useEffect(() => {
    if (!session) return
    const maintenant = Date.now()
    for (const d of Object.values(debats)) {
      const aFaire = d.msgs.filter(m => {
        if (m.analyse || iaVol.current.has(m.id)) return false
        if (maintenant - (iaEchec.current.get(m.id) ?? 0) < NOUVEL_ESSAI) return false
        const auteur = d.brut.get(m.id)?.user_id
        const parMoi = auteur === session.id || (auteur !== undefined && mesIds.current.has(auteur))
        return parMoi || maintenant - new Date(m.date).getTime() > RELEVE
      })
      if (aFaire.length) analyserDebat(session, d, aFaire.map(m => m.id))
    }
  }, [debats, session, analyserDebat])

  // ------------------------------------------------------------ actions
  const envoyerChat = useCallback(async (canalId: number, texte: string, police: string, effet: string, anonyme: boolean) => {
    if (!session) return
    try {
      await api.poster(session.jeton, canalId, texte, { type: 'chat', police, effet }, anonyme)
      await lireCanal(session, canalId)
    } catch (e) { gerer(e) }
  }, [session, lireCanal, gerer])

  const lancer = useCallback(async (source: Canal, extraits: MessageApi[], sujet: string) => {
    if (!session || !extraits.length) return null
    const s = session
    const nom = PREFIXE_DEBAT + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const c = await api.creerCanal(s.jeton, nom, { type: 'debat', sujet })
    connus.current.set(c.id, nom)
    const [tete, ...suite] = [...extraits].sort((a, b) => a.id - b.id)
    await api.poster(s.jeton, c.id, sujet, {
      type: 'ouverture', sujet,
      question: { qui: auteurDe(tete, metaDe<{ auteur?: string }>(tete)), dit: tete.content },
      debut: new Date().toISOString(), source,
    })
    // Les autres messages sélectionnés deviennent les premières idées, signées par leurs auteur·ices.
    for (const m of suite) {
      await api.poster(s.jeton, c.id, m.content, { type: 'msg', auteur: auteurDe(m) }, m.anonymous)
    }
    await api.poster(s.jeton, source.id, `⟡ ConVersus lancé : ${sujet}`, { type: 'annonce', canal: nom, canalId: c.id, sujet })
    await Promise.all([lireUnDebat(s, c.id), lireCanal(s, source.id)])
    return c.id
  }, [session, lireUnDebat, lireCanal])

  // Le jeton d'un compte de test : connexion, ou création du compte s'il n'existe pas encore.
  const identite = useCallback(async (nom: string, canalId: number) => {
    let i = identites.current.get(nom)
    if (!i) {
      let jeton: string
      try { jeton = await api.connexion(nom, MDP_TEST) } catch {
        await api.inscription(nom, MDP_TEST)
        jeton = await api.connexion(nom, MDP_TEST)
      }
      const m = await api.moi(jeton)
      i = { jeton, id: m.id, canaux: new Set((m.channels ?? []).map(c => c.id)) }
      identites.current.set(nom, i)
      mesIds.current.add(m.id)
    }
    const canalNom = connus.current.get(canalId)
    if (!i.canaux.has(canalId) && canalNom) {
      await api.entrer(i.jeton, canalNom).catch(() => null)
      i.canaux.add(canalId)
    }
    return i
  }, [])

  // `comme` : écrire sous un autre nom (comptes de test), sinon sous le sien.
  const ecrire = useCallback(async (canalId: number, texte: string, anonyme: boolean, repondA?: number, comme?: string) => {
    if (!session) return
    try {
      const jeton = comme && comme !== session.nom ? (await identite(comme, canalId)).jeton : session.jeton
      await api.poster(jeton, canalId, texte, { type: 'msg', repondA }, anonyme)
      await lireUnDebat(session, canalId)
    } catch (e) {
      if (comme && comme !== session.nom) setErreur(`Impossible d’écrire en tant que ${comme} : ${(e as Error).message}`)
      else gerer(e)
    }
  }, [session, lireUnDebat, gerer, identite])

  // Like (1) ou dislike (-1) ; recliquer sur le même avis le retire.
  const donnerAvis = useCallback(async (canalId: number, id: number, v: 1 | -1, nom?: string) => {
    if (!session) return
    const qui = nom ?? session.nom
    const basculer = (avis: Avis = {}): Avis => {
      const suite = { ...avis }
      if (suite[qui]?.v === v) delete suite[qui]
      else suite[qui] = { v, t: new Date().toISOString() }
      return suite
    }
    // Tout de suite à l'écran, puis dans le backend.
    setDebats(x => {
      const d = x[canalId]
      if (!d) return x
      const msgs = d.msgs.map(m => {
        if (m.id !== id) return m
        const avis = basculer(m.avis), valeurs = Object.values(avis)
        return { ...m, avis, pour: valeurs.filter(a => a.v === 1).length, contre: valeurs.filter(a => a.v === -1).length }
      })
      return { ...x, [canalId]: { ...d, msgs } }
    })
    try {
      await modifier(session, canalId, new Map([[id, (m: Meta) => ({ ...m, avis: basculer((m as MetaDe<'msg'>).avis) } as Meta)]]))
      await lireUnDebat(session, canalId)
    } catch (e) { gerer(e) }
  }, [session, modifier, lireUnDebat, gerer])

  // Synthèse d'une partie du débat ; elle est rangée dans le canal pour que tout le monde la retrouve.
  const synthetiser = useCallback(async (canalId: number, ids: number[], portee: string): Promise<SyntheseFaite | null> => {
    if (!session) return null
    const d = await lireUnDebat(session, canalId)
    if (!d) return null
    const synthese = await ia.synthetiser(d, ids, portee)
    setIaErreur(null)
    const m = await api.poster(session.jeton, canalId, `Synthèse : ${portee}`, { type: 'synthese', ids, portee, synthese, par: session.nom })
    await lireUnDebat(session, canalId).catch(() => null)
    return { id: m.id, par: session.nom, date: m.posted_at ?? new Date().toISOString(), ids, portee, synthese }
  }, [session, lireUnDebat])

  // Rejoindre un débat annoncé : on entre dans son canal pour le retrouver dans /me.
  const rejoindre = useCallback(async (canalId: number) => {
    if (!session) return
    const nom = connus.current.get(canalId)
    try {
      const m = await api.moi(session.jeton)
      if (nom && !(m.channels ?? []).some(c => c.id === canalId)) await api.entrer(session.jeton, nom)
    } catch (e) { gerer(e) }
  }, [session, gerer])

  return {
    session, canaux, fils, debats, erreur, iaErreur,
    connecter, deconnecter, envoyerChat, lancer, ecrire, donnerAvis, synthetiser, rejoindre,
  }
}
