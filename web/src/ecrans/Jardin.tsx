// L'écran d'un ConVersus : le board, et autour, la synthèse à la demande et le plein écran.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Carte, { type Mode } from '../Carte'
import { couleursDe, fonce, vitalite } from '../plan'
import { NOMS_ISSUE, type Debat, type MsgConv, type SyntheseFaite } from '../conversus'

// En développement : écrire et donner son avis sous d'autres noms, pour simuler un vrai débat à plusieurs.
const TESTS = import.meta.env.DEV
const COMPTES_TEST = ['killian', 'thalia', 'clara', 'maya', 'enzo']

type Props = {
  debat: Debat
  moi: string
  pleinEcran: boolean
  setPleinEcran: (p: boolean) => void
  iaErreur: string | null
  onEcrire: (texte: string, anonyme: boolean, repondA?: number, comme?: string) => void
  onAvis: (id: number, v: 1 | -1, comme?: string) => void
  onSynthese: (ids: number[], portee: string) => Promise<SyntheseFaite | null>
}

type Volet = { etat: 'attente'; portee: string; ids: number[] } | { etat: 'pret'; s: SyntheseFaite } | { etat: 'erreur'; message: string }

const heure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Jardin({ debat, moi, pleinEcran, setPleinEcran, iaErreur, onEcrire, onAvis, onSynthese }: Props) {
  const { msgs } = debat
  const [maintenant, setMaintenant] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const vie = vitalite(debat, maintenant)

  const [comme, setComme] = useState(moi)
  const noms = TESTS ? [...new Set([moi, ...COMPTES_TEST])] : []

  const [mode, setMode] = useState<Mode>('normal')
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const [volet, setVolet] = useState<Volet | null>(null)
  const [vise, setVise] = useState<{ id: number; n: number } | null>(null)
  const voir = useCallback((id: number) => setVise(v => ({ id, n: (v?.n ?? 0) + 1 })), [])

  const commencer = () => { setVolet(null); setSelection(new Set()); setMode('choix') }
  const annuler = useCallback(() => { setMode('normal'); setSelection(new Set()) }, [])
  // La fleur prend tout le débat ; si tout est déjà pris, un second clic désélectionne tout.
  const onTout = useCallback(() => setSelection(s =>
    msgs.length && msgs.every(m => s.has(m.id)) ? new Set() : new Set(msgs.map(m => m.id))), [msgs])
  const onFil = useCallback((ids: number[]) => setSelection(new Set(ids)), [])
  const onBasculer = useCallback((id: number) => setSelection(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  }), [])
  const avis = useCallback((id: number, v: 1 | -1) => onAvis(id, v, comme), [onAvis, comme])
  const ecrire = useCallback((t: string, a: boolean, r?: number) => onEcrire(t, a, r, comme), [onEcrire, comme])

  const lancerSynthese = async () => {
    const ids = msgs.filter(m => selection.has(m.id)).map(m => m.id)
    if (!ids.length) return
    const portee = ids.length === msgs.length ? 'tout le débat' : `${ids.length} message${ids.length > 1 ? 's' : ''} choisi${ids.length > 1 ? 's' : ''}`
    setMode('lecture')
    setVolet({ etat: 'attente', portee, ids })
    try {
      const s = await onSynthese(ids, portee)
      setVolet(s ? { etat: 'pret', s } : { etat: 'erreur', message: 'le débat est introuvable' })
    } catch (e) {
      setVolet({ etat: 'erreur', message: (e as Error).message })
    }
  }
  const montrer = (s: SyntheseFaite) => { setVolet({ etat: 'pret', s }); setSelection(new Set(s.ids)); setMode('lecture') }
  const fermer = () => { setVolet(null); annuler() }

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as Element).closest?.('textarea')) return
      if (mode === 'choix') annuler()
    }
    addEventListener('keydown', touche)
    return () => removeEventListener('keydown', touche)
  }, [mode, annuler])

  return (
    <div className={'bd' + (volet ? ' avec-volet' : '')}>
      <Carte debat={debat} vie={vie} maintenant={maintenant} mode={mode} selection={selection}
             comme={comme} noms={noms} setComme={setComme}
             vise={vise}
             onTout={onTout} onFil={onFil} onBasculer={onBasculer} onEcrire={ecrire} onAvis={avis} />

      <div className="bd-titre">
        <h1>{debat.sujet}</h1>
        {iaErreur && <span className="bd-alerte" title={iaErreur}>lecture des messages en pause, nouvel essai…</span>}
      </div>

      <div className="bd-outils">
        <button className={'btn' + (mode === 'choix' ? ' fort' : '')} onClick={mode === 'choix' ? annuler : commencer}>
          {mode === 'choix' ? 'Annuler' : 'Synthèse'}
        </button>
        <button className="btn bd-plein" title={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'}
                aria-label={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'}
                onClick={() => setPleinEcran(!pleinEcran)}>
          <IconePlein dedans={pleinEcran} />
        </button>
      </div>

      {mode === 'choix' && (
        <div className="bd-choix">
          <p>
            <b>Que veux-tu synthétiser ?</b> La fleur pour tout le débat, une racine pour un fil.
            Clique un message pour l’exclure ou le reprendre.
          </p>
          <button className="btn fort" disabled={!selection.size} onClick={lancerSynthese}>
            Faire la synthèse{selection.size ? ` (${selection.size})` : ''}
          </button>
        </div>
      )}

      {volet && (
        <aside className="bd-volet">
          <div className="bd-volet-tete">
            <h3>Synthèse</h3>
            <button aria-label="Fermer la synthèse" onClick={fermer}>×</button>
          </div>
          {volet.etat === 'attente' && <p className="sy-attente">La synthèse de {volet.portee} s’écrit…</p>}
          {volet.etat === 'erreur' && <p className="sy-attente">La synthèse n’a pas pu être écrite ({volet.message}).</p>}
          {volet.etat === 'pret' && <Lecture s={volet.s} debat={debat} onVoir={voir} />}

          {debat.syntheses.length > 0 && (
            <div className="sy-anciennes">
              <h4>Synthèses déjà faites</h4>
              {[...debat.syntheses].reverse().map(s => (
                <button key={s.id} className={volet.etat === 'pret' && volet.s.id === s.id ? 'active' : undefined} onClick={() => montrer(s)}>
                  <b>{s.portee}</b> <span>par {s.par} · {heure(s.date)}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

const extrait = (t: string) => ([...t].length > 160 ? [...t].slice(0, 157).join('') + '…' : t)

function Lecture({ s, debat, onVoir }: { s: SyntheseFaite; debat: Debat; onVoir: (id: number) => void }) {
  const couleur = useMemo(() => couleursDe(debat), [debat])
  const choisis = debat.msgs.filter(m => s.ids.includes(m.id))
  return (
    <div className="sy-ia">
      <span className="sy-portee">{s.portee} · par {s.par}</span>
      <Participation msgs={choisis} couleur={couleur} />
      <span className={'sy-issue ' + s.synthese.issue}>{NOMS_ISSUE[s.synthese.issue]}</span>
      <p className="sy-resume">{s.synthese.resume}</p>
      {s.synthese.camps.map(c => (
        <div key={c.titre} className="sy-camp">
          <b>{c.titre}</b>
          <span>{c.idee}</span>
          <span className="sy-auteurs">
            {c.auteurs.map((a, i) => <span key={a} style={{ color: fonce(couleur(a)) }}>{i ? ', ' : ''}{a}</span>)}
          </span>
          {(c.exemples ?? []).map(e => {
            const m = debat.msgs.find(x => x.id === e.id)
            if (!m) return null
            const nom = m.anonyme ? 'anonyme' : m.qui
            return (
              <button key={e.id} className="sy-exemple" title="Voir ce message sur le board" onClick={() => onVoir(e.id)}>
                <span className="sy-citation">
                  <b style={{ color: fonce(couleur(m.qui)) }}>{nom}</b> « {extrait(m.dit)} »
                </span>
                {e.pourquoi && <span className="sy-pourquoi">{e.pourquoi}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Un point par personne, d'autant plus gros qu'elle a participé ; la légende détaille.
function Participation({ msgs, couleur }: { msgs: MsgConv[]; couleur: (n: string) => string }) {
  const parNom = new Map<string, number>()
  for (const m of msgs) parNom.set(m.qui, (parNom.get(m.qui) ?? 0) + 1)
  const total = msgs.length || 1
  const gens = [...parNom.entries()].sort((a, b) => b[1] - a[1])
  return (
    <div className="sy-part">
      <div className="sy-points" aria-hidden>
        {gens.map(([nom, n]) => {
          const d = Math.round(14 + 50 * Math.sqrt(n / total))
          return <span key={nom} style={{ width: d, height: d, background: couleur(nom) }} title={nom} />
        })}
      </div>
      <ul className="sy-legende">
        {gens.map(([nom, n]) => (
          <li key={nom}>
            <i style={{ background: couleur(nom) }} />
            <b style={{ color: fonce(couleur(nom)) }}>{nom}</b>
            <span>{n} message{n > 1 ? 's' : ''} · {Math.round(n / total * 100)} %</span>
          </li>
        ))}
      </ul>
      <p className="sy-note">Taille du point : part des messages écrits dans ce qui est synthétisé.</p>
    </div>
  )
}

// Double flèche bleue ; vers l'intérieur pour quitter le plein écran.
function IconePlein({ dedans }: { dedans: boolean }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <g fill="none" stroke="#4f8bff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        {dedans
          ? <><path d="M22 18 L33 7" /><path d="M23 9 V17 H31" /><path d="M18 22 L7 33" /><path d="M9 23 H17 V31" /></>
          : <><path d="M10 30 L30 10" /><path d="M21 9 H31 V19" /><path d="M9 21 V31 H19" /></>}
      </g>
    </svg>
  )
}
