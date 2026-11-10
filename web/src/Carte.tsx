// Le board d'un ConVersus, en 3D : au centre la fleur, autour d'elle les idées qui flottent dans l'espace,
// chacune au bout de sa racine de lumière, et les réponses accrochées à leur message.
// On tourne autour de la fleur en faisant glisser, on zoome à la molette ; un clic sur un message
// fait venir la caméra jusqu'à lui (focus) et ouvre de quoi y répondre.
// Une bulle restée une minute sans réponse fait pousser une tige et une fleur ;
// quand quelqu'un lui répond enfin, la fleur tombe et la nouvelle racine prend sa place.
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Espace, type Brin, type Regard } from './filaments/Toile'
import { spatialiser } from './filaments/espace'
import type { Debat, MsgConv } from './conversus'
import {
  BULLE_L, FLEUR_TAILLE, FLEURS,
  couleursDe, disposer, fil, genreBulle, teinteBulle, typo,
  type Place,
} from './plan'

export type Mode = 'normal' | 'choix' | 'lecture'

type Props = {
  debat: Debat
  vie: number
  maintenant: number
  mode: Mode
  selection: Set<number>
  comme: string
  noms: string[]              // noms de test (vide hors développement)
  setComme: (n: string) => void
  onTout: () => void
  onFil: (ids: number[]) => void
  onBasculer: (id: number) => void
  onEcrire: (texte: string, anonyme: boolean, repondA?: number) => void
  onAvis: (id: number, v: 1 | -1) => void
  vise?: { id: number; n: number } | null    // un message à montrer (exemple cité dans la synthèse)
}

const ATTENTE_FLEUR = 60_000
type Bourgeon = { id: number; src: string; d: number }

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export default function Carte({
  debat, vie, maintenant, mode, selection, comme, noms, setComme, onTout, onFil, onBasculer, onEcrire, onAvis, vise = null,
}: Props) {
  const { msgs } = debat
  const places = useMemo(() => disposer(msgs), [msgs])
  const noeuds = useMemo(() => spatialiser(places), [places])
  const couleur = useMemo(() => couleursDe(debat), [debat])
  const participants = useMemo(() => new Set([debat.question.qui, ...msgs.map(m => m.qui)]).size, [debat.question.qui, msgs])
  const liste = [...places.values()]
  const idFiltre = useId().replace(/:/g, '')
  const choix = mode === 'choix'

  // Les messages restés une minute sans réponse portent une fleur.
  const bourgeons: Bourgeon[] = liste
    .filter(p => !p.enfants.length && p.m.analyse && maintenant - Date.parse(p.m.date) >= ATTENTE_FLEUR)
    .map(p => ({ id: p.m.id, src: FLEURS[p.m.analyse!.position], d: 62 + 46 * p.m.analyse!.force }))
  const cleBourgeons = bourgeons.map(b => b.id).join(',')

  // Une fleur qui disparaît parce qu'on vient de répondre à son message : elle tombe.
  const [tombees, setTombees] = useState<Bourgeon[]>([])
  const avant = useRef<Map<number, Bourgeon> | null>(null)
  useEffect(() => {
    const now = new Map(bourgeons.map(b => [b.id, b]))
    if (avant.current) {
      const parties = [...avant.current.values()].filter(b => !now.has(b.id) && places.get(b.id)?.enfants.length)
      if (parties.length) {
        setTombees(t => [...t, ...parties])
        setTimeout(() => setTombees(t => t.filter(x => !parties.includes(x))), 1800)
      }
    }
    avant.current = now
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleBourgeons, places])

  const brins: Brin[] = useMemo(() => [
    ...bourgeons.map(b => ({ cle: 'b' + b.id, id: b.id, tombe: false })),
    ...tombees.map(b => ({ cle: 't' + b.id, id: b.id, tombe: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [cleBourgeons, tombees])

  // -------------------------------------------------------------- la scène 3D
  const vue = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const espace = useRef<Espace | null>(null)
  const [sans3d, setSans3d] = useState(false)
  useEffect(() => {
    if (!canvas.current || !vue.current) return
    const e = Espace.creer(canvas.current, vue.current)
    if (!e) { setSans3d(true); return }
    espace.current = e
    // les étiquettes déjà montées s'enregistrent maintenant que la scène existe
    for (const [cle, el] of enAttente.current) e.etiquette(cle, el)
    for (const [id, el] of prisesEnAttente.current) e.prise(id, el)
    return () => { e.liberer(); espace.current = null }
  }, [])

  // Chaque élément HTML qui doit suivre un point 3D s'enregistre auprès de la scène.
  const enAttente = useRef(new Map<string, HTMLElement>())
  const prisesEnAttente = useRef(new Map<number, SVGPathElement>())
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const accrocher = useCallback((cle: string) => {
    let r = refs.current.get(cle)
    if (!r) {
      r = (el: HTMLElement | null) => {
        if (el) enAttente.current.set(cle, el); else enAttente.current.delete(cle)
        espace.current?.etiquette(cle, el)
      }
      refs.current.set(cle, r)
    }
    return r
  }, [])
  const accrocherPrise = useCallback((id: number) => (el: SVGPathElement | null) => {
    if (el) prisesEnAttente.current.set(id, el); else prisesEnAttente.current.delete(id)
    espace.current?.prise(id, el)
  }, [])

  // -------------------------------------------------------------- regarder, écrire
  const [regard, setRegard] = useState<Regard>(null)          // ce que la caméra regarde
  const [cible, setCible] = useState<'fleur' | number | null>(null)   // à quoi on est en train de répondre
  const [brouillon, setBrouillon] = useState('')
  const [anonyme, setAnonyme] = useState(false)
  const quitter = useCallback(() => { setCible(null); setRegard(null) }, [])
  useEffect(() => { if (choix) quitter() }, [choix, quitter])
  useEffect(() => {
    if (regard === null && cible === null) return
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') quitter() }
    addEventListener('keydown', touche)
    return () => removeEventListener('keydown', touche)
  }, [regard, cible, quitter])

  const envoyer = () => {
    const t = brouillon.trim()
    if (!t || cible === null) return
    onEcrire(t, anonyme, cible === 'fleur' ? undefined : cible)
    setBrouillon('')
    setCible(null)
  }

  // Un clic sur un message : la caméra vient jusqu'à lui, et on peut y répondre.
  const focus = useCallback((id: number) => { setRegard(id); setCible(id) }, [])
  const clicFleur = () => {
    if (choix) { onTout(); return }
    setRegard('fleur'); setCible('fleur')
  }

  // Montrer un message (exemple cité dans la synthèse) : la caméra s'y rend et il brille un instant.
  const [brille, setBrille] = useState<number | null>(null)
  useEffect(() => {
    if (!vise || !places.has(vise.id)) return
    setRegard(vise.id)
    setBrille(vise.id)
    const t = setTimeout(() => setBrille(null), 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vise])

  // Mon nouveau message brille en arrivant.
  const connus = useRef(new Set(msgs.map(m => m.id)))
  useEffect(() => {
    for (const p of places.values()) {
      if (connus.current.has(p.m.id)) continue
      connus.current.add(p.m.id)
      if (p.m.qui === comme) { setBrille(p.m.id); setTimeout(() => setBrille(b => (b === p.m.id ? null : b)), 1800) }
    }
  }, [places, comme])

  // Survoler un message tend ses racines.
  const [survol, setSurvol] = useState<number | null>(null)
  const survoler = useCallback((id: number | null) => setSurvol(id), [])

  const toutPris = mode !== 'normal' && selection.size === msgs.length && msgs.length > 0
  useEffect(() => {
    espace.current?.maj({ places, noeuds, vie, mode, selection, survol, brins, fleurPrise: toutPris, regard })
  }, [places, noeuds, vie, mode, selection, survol, brins, toutPris, regard, sans3d])

  const cibleMsg = typeof cible === 'number' ? places.get(cible)?.m ?? null : null
  const monAvis = cibleMsg ? cibleMsg.avis[comme]?.v ?? 0 : 0

  return (
    <div className={'bd-carte ' + mode + (regard !== null ? ' regard' : '')} ref={vue}
         onClickCapture={e => { if (espace.current?.vientDeGlisser()) e.stopPropagation() }}
         onClick={quitter}>
      <canvas className="bd-toile" ref={canvas} aria-hidden />
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <filter id={idFiltre} x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={9} />
        </filter>
      </svg>

      {choix && (
        <svg className="bd-prises" aria-hidden>
          {liste.map(p => (
            <path key={p.m.id} ref={accrocherPrise(p.m.id)} onClick={e => { e.stopPropagation(); onFil(fil(p)) }}>
              <title>Sélectionner ce fil</title>
            </path>
          ))}
        </svg>
      )}

      <div className="bd-espace">
        {/* La fleur est dessinée en filaments par la scène ; ici, sa zone cliquable.
            Le clic ne doit pas remonter jusqu'au board, qui quitterait aussitôt le focus. */}
        <div className="bd-ancre" ref={accrocher('fleur')}>
          <div className={'bd-coeur' + (choix ? ' prenable' : '') + (toutPris ? ' choisie' : '')} onClick={e => e.stopPropagation()}>
            <button className="bd-fleur" style={{ width: FLEUR_TAILLE * .82, height: FLEUR_TAILLE * .82 }} onClick={clicFleur}
                    title={!choix ? 'Proposer une nouvelle idée' : toutPris ? 'Tout désélectionner' : 'Synthèse de tout le débat'}
                    aria-label={!choix ? 'Proposer une nouvelle idée' : toutPris ? 'Tout désélectionner' : 'Synthèse de tout le débat'} />
          </div>
        </div>

        {bourgeons.map(b => <Bouton key={'b' + b.id} b={b} classe={mode === 'normal' ? '' : selection.has(b.id) ? ' choisie' : ' exclue'} accroche={accrocher('b' + b.id)} />)}
        {tombees.map(b => <Bouton key={'t' + b.id} b={b} classe=" tombe" accroche={accrocher('t' + b.id)} />)}

        {liste.map(p => (
          <Message key={p.m.id} p={p} accroche={accrocher('m' + p.m.id)}
                   couleur={couleur(p.m.qui)} participants={participants} filtre={idFiltre}
                   mode={mode} choisie={selection.has(p.m.id)} mien={p.m.qui === comme}
                   regarde={regard === p.m.id} estompe={typeof regard === 'number' && regard !== p.m.id && mode === 'normal'}
                   brille={brille === p.m.id}
                   onFocus={focus} onBasculer={onBasculer} onSurvol={survoler} />
        ))}
      </div>

      {cible !== null && !choix && (
        <div className="bd-compose" ref={accrocher('compose')} onClick={e => e.stopPropagation()}>
          <div className="bd-compose-tete">
            {cible === 'fleur'
              ? <>Nouvelle idée</>
              : <>Répondre à <b style={{ color: cibleMsg ? couleur(cibleMsg.qui) : undefined }}>{cibleMsg?.anonyme ? 'anonyme' : cibleMsg?.qui}</b></>}
            {cibleMsg && (
              <span className="bd-avis">
                <button className={'puce' + (monAvis === 1 ? ' active' : '')} title="J’aime" onClick={() => onAvis(cibleMsg.id, 1)}>👍{cibleMsg.pour > 0 && <i>{cibleMsg.pour}</i>}</button>
                <button className={'puce' + (monAvis === -1 ? ' active' : '')} title="Je n’aime pas" onClick={() => onAvis(cibleMsg.id, -1)}>👎{cibleMsg.contre > 0 && <i>{cibleMsg.contre}</i>}</button>
              </span>
            )}
            <button className="bd-fermer" aria-label="Fermer" onClick={quitter}>×</button>
          </div>
          <textarea autoFocus value={brouillon} rows={3}
                    onChange={e => setBrouillon(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer() } }}
                    placeholder={cible === 'fleur' ? 'Ton idée sur la question…' : 'Ta réponse…'} />
          <div className="bd-compose-pied">
            {noms.length > 0 && (
              <label className="bd-comme" title="Test : écrire sous un autre nom">
                <i style={{ background: couleur(comme) }} />
                <select value={comme} onChange={e => setComme(e.target.value)}>
                  {noms.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
            <button className={'outil' + (anonyme ? ' on' : '')} title={anonyme ? 'Mode anonyme activé' : 'Écrire sans révéler mon identité'}
                    aria-label="Mode anonyme" onClick={() => setAnonyme(a => !a)}>
              <img src="/anonyme.png" alt="" />
            </button>
            <button className="btn fort" disabled={!brouillon.trim()} onClick={envoyer}>Envoyer</button>
          </div>
        </div>
      )}

      {sans3d && <p className="bd-sans3d">Ton navigateur n’affiche pas la 3D (WebGL) : le ConVersus ne peut pas s’afficher ici.</p>}

      <div className="bd-zoom" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <button className="outil" title="Zoomer" aria-label="Zoomer" onClick={() => espace.current?.zoomer(.8)}>+</button>
        <button className="outil" title="Dézoomer" aria-label="Dézoomer" onClick={() => espace.current?.zoomer(1.25)}>−</button>
        <button className="outil" title="Revenir à la fleur" aria-label="Revenir à la fleur"
                onClick={() => { quitter(); espace.current?.recentrer() }}>⊙</button>
        <button className="outil" title="Tout voir" aria-label="Tout voir"
                onClick={() => { quitter(); espace.current?.ensemble() }}>⤢</button>
        <span className="bd-aide">glisser pour tourner · molette pour zoomer</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- la fleur au bout d'un message

function Bouton({ b, classe, accroche }: { b: Bourgeon; classe: string; accroche: (el: HTMLElement | null) => void }) {
  return (
    <div className="bd-ancre" ref={accroche}>
      <div className={'bd-bouton' + classe}>
        <img src={b.src} alt="" draggable={false} style={{ width: b.d, height: b.d }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- un message

const STYLE_LETTRE = {
  aime:   { fontFamily: 'Coxinelle', color: '#ffd36e' },
  rejete: { fontFamily: 'Nudles', color: '#aab0c8' },
}

// Les idées posées sur la fleur : du texte qui flotte, sans bulle. Les réponses : de petites bulles.
const Message = memo(function Message({
  p, accroche, couleur, participants, filtre, mode, choisie, mien, regarde, estompe, brille, onFocus, onBasculer, onSurvol,
}: {
  p: Place
  accroche: (el: HTMLElement | null) => void
  couleur: string
  participants: number
  filtre: string
  mode: Mode
  choisie: boolean
  mien: boolean
  regarde: boolean
  estompe: boolean
  brille: boolean
  onFocus: (id: number) => void
  onBasculer: (id: number) => void
  onSurvol: (id: number | null) => void
}) {
  const m: MsgConv = p.m
  const libre = !p.parent
  const { lettres, taille } = typo(m, participants)
  const nom = m.anonyme ? 'anonyme' : m.qui
  const teinte = teinteBulle(m)
  const etat = (mode === 'normal' ? '' : choisie ? ' choisie' : ' exclue') + (regarde ? ' regarde' : '') + (estompe ? ' estompe' : '')
    + (brille ? ' brille' : '') + (mode === 'choix' ? ' prenable' : '') + (mien ? ' mienne' : '')
  const classe = libre ? 'bd-mot' + etat : 'bd-bulle ' + teinte + genreBulle(m) + etat
  const texte = (
    <div className="bd-dit" style={{ fontSize: libre ? taille * 1.6 : taille }}>
      {[...m.dit].map((l, i) => {
        const s = lettres[i]
        return <span key={i} style={s ? STYLE_LETTRE[s] : undefined}>{l}</span>
      })}
    </div>
  )
  return (
    <div className="bd-ancre" ref={accroche}>
      <div className={classe} style={libre ? undefined : { width: BULLE_L }}
           role="button" tabIndex={0}
           aria-label={`Message de ${nom} : ${m.dit}`}
           onPointerEnter={() => onSurvol(m.id)} onPointerLeave={() => onSurvol(null)}
           onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (mode === 'choix') onBasculer(m.id); else onFocus(m.id) } }}
           onClick={e => { e.stopPropagation(); if (mode === 'choix') onBasculer(m.id); else onFocus(m.id) }}>
        {!libre && <span className="bd-fond" style={teinte === 'rongee' ? { filter: `url(#${filtre})` } : undefined} />}
        <div className="bd-qui">
          <b style={{ color: couleur }}>{nom}</b>
          <span>{heure(m.date)}</span>
        </div>
        {texte}
        {(m.pour > 0 || m.contre > 0) && (
          <div className="bd-score">
            {m.pour > 0 && <span className="pour">👍 {m.pour}</span>}
            {m.contre > 0 && <span className="contre">👎 {m.contre}</span>}
          </div>
        )}
      </div>
    </div>
  )
})

