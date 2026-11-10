import { useEffect, useMemo, useRef, useState } from 'react'
import { POLICES_LISIBLES, personne } from '../donnees'
import { Etoile } from '../Etoile'
import Glaieul from '../filaments/Glaieul'
import type { Canal, MsgCanal } from '../useConversus'

const EMOJIS = ['🥐', '🍫', '🔥', '😭', '😤', '✨', '👀', '💜', '🙃', '🤝']

const EFFETS = [
  { id: '',           nom: 'Aucun' },
  { id: 'tremble',    nom: 'Tremblement' },
  { id: 'ondule',     nom: 'Ondulation' },
  { id: 'respire',    nom: 'Respiration' },
]

type Props = {
  canal: Canal
  messages: MsgCanal[]
  selection: number[]
  setSelection: (ids: number[]) => void
  onOuvrir: () => void
  onEnvoyer: (texte: string, police: string, effet: string, anonyme: boolean) => void
  onDebat: (canalId: number) => void
  policeRepos: string
}

export default function Chat({ canal, messages, selection, setSelection, onOuvrir, onEnvoyer, onDebat, policeRepos }: Props) {
  const [brouillon, setBrouillon] = useState('')
  const [cible, setCible]         = useState(false)
  const [panneau, setPanneau]     = useState<'' | 'emoji' | 'police' | 'effet'>('')
  const [police, setPolice]       = useState(policeRepos)
  const [effet, setEffet]         = useState('')
  const [anonyme, setAnonyme]     = useState(false)

  const envoyer = () => {
    if (!brouillon.trim()) return
    onEnvoyer(brouillon.trim(), police, effet, anonyme)
    setBrouillon('')
    setPanneau('')
  }

  // On suit le bas du fil quand un message arrive.
  const fil = useRef<HTMLDivElement>(null)
  const dernier = messages[messages.length - 1]?.id
  useEffect(() => { fil.current?.scrollTo({ top: fil.current.scrollHeight }) }, [dernier])

  const cocher = (id: number) => {
    if (!cible) return
    setSelection(
      selection.includes(id) ? selection.filter(x => x !== id) : [...selection, id]
    )
  }

  const annuler = () => { setCible(false); setSelection([]) }

  return (
    <div className="canal-page">
    <div className="chat">

      <div className="barre-canal">
        <span className="nom-canal">{canal.nom}</span>
        <span className="pousse" />
        {cible
          ? <>
              <button className="btn" onClick={annuler}>Annuler</button>
            </>
          : <button className="btn fort" onClick={() => setCible(true)}>
              <Etoile /> Lancer un ConVersus
            </button>}
      </div>

      <div className="fil" ref={fil}>
        {messages.length === 0 && <p className="vide">Aucun message dans ce canal pour l’instant.</p>}
        {messages.map(m => {
          if (m.annonce) {
            const a = m.annonce
            return (
              <button key={m.id} className="ligne annonce" onClick={() => onDebat(a.canalId)}>
                <Etoile />
                <span><b>{m.qui}</b> a lancé un ConVersus : <i>{a.sujet}</i></span>
                <span className="annonce-aller">Rejoindre</span>
              </button>
            )
          }
          const coche = selection.includes(m.id)
          return (
            <div
              key={m.id}
              className={'ligne' + (coche ? ' coche' : '') + (cible ? ' ciblable' : '')}
              onClick={() => cocher(m.id)}
            >
              {cible && <span className="case">{coche ? '✓' : ''}</span>}
              <span className="mini-av gros"
                    style={{ background: personne(m.qui).couleur }}>
                {m.qui[0]}
              </span>
              <div className="corps">
                <div className="qui">
                  <b>{m.qui}</b>
                  <span className="pronom">{personne(m.qui).pronom}</span>
                  <span className="heure">{m.heure}</span>
                </div>
                <div className={'dit ' + (m.effet ?? '')} style={m.police ? { fontFamily: m.police } : undefined}>{m.dit}</div>
              </div>
            </div>
          )
        })}
      </div>

      {cible && selection.length > 0 && (
        <div className="bandeau">
          <span className="txt">
            {selection.length} message{selection.length > 1 ? 's' : ''} ciblé
            {selection.length > 1 ? 's' : ''}
          </span>
          <button className="plat" onClick={annuler}>Annuler</button>
          <button onClick={onOuvrir}>Lancer le ConVersus</button>
        </div>
      )}

      <div className="zone-saisie">

        {panneau === 'emoji' && (
          <div className="panneau">
            {EMOJIS.map(e => (
              <button key={e} className="emoji"
                      onClick={() => { setBrouillon(b => b + e); setPanneau('') }}>
                {e}
              </button>
            ))}
          </div>
        )}

        {panneau === 'police' && (
          <div className="panneau">
            {POLICES_LISIBLES.map(p => (
              <button key={p.id}
                      className={'puce' + (police === p.id ? ' active' : '')}
                      style={{ fontFamily: p.id }}
                      onClick={() => { setPolice(p.id); setPanneau('') }}>
                {p.nom}
              </button>
            ))}
          </div>
        )}

        {panneau === 'effet' && (
          <div className="panneau">
            {EFFETS.map(f => (
              <button key={f.id}
                      className={'puce' + (effet === f.id ? ' active' : '')}
                      onClick={() => { setEffet(f.id); setPanneau('') }}>
                <span className={f.id}>{f.nom}</span>
              </button>
            ))}
          </div>
        )}

        {brouillon && (
          <div className="apercu">
            <span className="etiq-apercu">aperçu</span>
            <span className={effet} style={{ fontFamily: police }}>{brouillon}</span>
          </div>
        )}

        <div className="saisie">
          <button className={'outil' + (panneau === 'emoji' ? ' on' : '')}
                  title="Emoji"
                  onClick={() => setPanneau(p => p === 'emoji' ? '' : 'emoji')}>☺</button>
          <button className={'outil' + (panneau === 'police' ? ' on' : '')}
                  title="Choisir la police"
                  onClick={() => setPanneau(p => p === 'police' ? '' : 'police')}>Aa</button>
          <button className={'outil' + (panneau === 'effet' ? ' on' : '')}
                  title="Appliquer un effet"
                  onClick={() => setPanneau(p => p === 'effet' ? '' : 'effet')}>✦</button>
          <button className={'outil' + (anonyme ? ' on' : '')}
                  title={anonyme ? 'Mode anonyme activé' : 'Envoyer sans révéler mon identité'}
                  aria-label="Mode anonyme"
                  onClick={() => setAnonyme(a => !a)}>
            <img src="/anonyme.png" alt="" />
          </button>

          <input
            value={brouillon}
            onChange={e => setBrouillon(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && envoyer()}
            placeholder="Écris ton message…"
            aria-label="Écris ton message"
            style={{ fontFamily: police }}
          />
          <button className="env" onClick={envoyer}>
            Envoyer
          </button>
        </div>
      </div>
    </div>
    <CoteCanal canal={canal} messages={messages} onDebat={onDebat} />
    </div>
  )
}

// ---------------------------------------------------------------- le panneau à côté du canal

// À côté du fil : le glaïeul du canal (le même qu'à la connexion, en entier), les ConVersus nés dans ce canal,
// et les voix qui l'animent le plus.
function CoteCanal({ canal, messages, onDebat }: { canal: Canal; messages: MsgCanal[]; onDebat: (canalId: number) => void }) {
  const { annonces, voix, total } = useMemo(() => {
    const annonces = messages.filter(m => m.annonce).reverse()
    const parNom = new Map<string, number>()
    let total = 0
    for (const m of messages) {
      if (m.annonce) continue
      total++
      if (!m.anonyme) parNom.set(m.qui, (parNom.get(m.qui) ?? 0) + 1)
    }
    const voix = [...parNom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    return { annonces, voix, total }
  }, [messages])
  const max = voix[0]?.[1] ?? 1

  return (
    <aside className="canal-cote">
      <section className="cote-fleur">
        <Glaieul cadrage="entier" className="cote-glaieul" />
        <div className="cote-fleur-legende">
          <b>{canal.nom}</b>
          <span>{total} message{total > 1 ? 's' : ''} · {voix.length} voix</span>
        </div>
      </section>

      <section className="cote-carte">
        <h3>ConVersus nés ici</h3>
        {annonces.length === 0
          ? <p className="cote-vide">Aucun pour l’instant. Coche quelques messages et lance le premier !</p>
          : annonces.slice(0, 5).map(m => (
              <button key={m.id} className="cote-debat" onClick={() => onDebat(m.annonce!.canalId)}>
                <Etoile />
                <span className="cote-debat-txt">
                  <b>{m.annonce!.sujet}</b>
                  <i>par {m.qui} · {m.heure}</i>
                </span>
              </button>
            ))}
      </section>

      <section className="cote-carte">
        <h3>Les voix du canal</h3>
        {voix.length === 0 && <p className="cote-vide">Personne n’a encore parlé ici.</p>}
        {voix.map(([nom, n]) => (
          <div key={nom} className="cote-voix">
            <span className="mini-av" style={{ background: personne(nom).couleur }}>{nom[0]}</span>
            <span className="cote-voix-nom">{nom}</span>
            <span className="cote-voix-barre"><span style={{ width: `${Math.round(n / max * 100)}%` }} /></span>
            <span className="cote-voix-n">{n}</span>
          </div>
        ))}
      </section>
    </aside>
  )
}

