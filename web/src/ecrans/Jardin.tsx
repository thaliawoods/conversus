import { useEffect, useRef, useState } from 'react'
import { Etoile } from '../Etoile'
import { EFFETS, EMOJIS, POLICES_LISIBLES, ROLES, type Role } from '../donnees'
import type { MsgConv } from '../App'
import type { Emotion } from '../emotions'
import Arbre from '../Arbre'

type Props = {
  sujet: string
  question: { qui: string; dit: string } | null
  duree: number
  role: Role
  setRole: (r: Role) => void
  msgs: MsgConv[]
  presents: string[]
  moi: string
  policeRepos: string
  onEcrire: (texte: string, police: string, effet: string, anonyme: boolean, repondA?: number) => void
  onReagir: (id: number, emotion: Emotion | null, anonyme: boolean) => void
  onEpingler: (id: number) => void
  onDeplacer: (id: number, vers?: number) => void
  onClore: () => void
}

export default function Jardin({
  sujet, question, duree, role, setRole, msgs, presents, moi, policeRepos, onEcrire, onReagir, onEpingler, onDeplacer, onClore,
}: Props) {
  const [brouillon, setBrouillon] = useState('')
  const [anonyme, setAnonyme]     = useState(false)
  const [reste, setReste]         = useState(duree * 60)
  const [reponse, setReponse]     = useState<number | null>(null)
  const [panneau, setPanneau]     = useState<'' | 'emoji' | 'police' | 'effet'>('')
  const [police, setPolice]       = useState(policeRepos)
  const [effet, setEffet]         = useState('')
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (reste <= 0) { onClore(); return }
    const t = setTimeout(() => setReste(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [reste, onClore])

  const mm = Math.floor(reste / 60)
  const ss = String(reste % 60).padStart(2, '0')

  const cible = msgs.find(m => m.id === reponse)
  const envoyer = () => {
    if (!brouillon.trim()) return
    onEcrire(brouillon.trim(), police, effet, anonyme, cible?.id)
    setBrouillon('')
    setPanneau('')
    setReponse(null)
  }
  const repondre = (id: number) => {
    setReponse(id)
    champ.current?.focus()
  }

  return (
    <div className="conv">
      <div className="conv-tete">
        <Etoile className="tete-etoile" />
        <h1>{sujet}</h1>
        <span className="bascule">
          {ROLES.map(r => (
            <button key={r.id} className={role === r.id ? 'active' : undefined}
                    onClick={() => { setRole(r.id); setReponse(null) }}>{r.nom}</button>
          ))}
        </span>
        <span className="participants">
          <span className="compte">{presents.length} personnes</span>
        </span>
        <span className={'chrono' + (reste < 60 ? ' urgent' : '')}>{mm}:{ss}</span>
        <button className="btn mini" title="Rallonger la conversation de deux minutes"
                onClick={() => setReste(r => r + 120)}>+ 2 min</button>
        <span className="compte">{msgs.filter(m => m.epingle).length} retenus</span>
        <button className="btn fort" onClick={onClore}>Clore et faire la synthèse</button>
      </div>

      <Arbre msgs={msgs} audience={presents.length} moi={moi} question={question}
             peutRepondre={role === 'debat'}
             onReagir={onReagir} onEpingler={onEpingler} onRepondre={repondre} onDeplacer={onDeplacer} />

      <div className="pied">
        {role === 'debat' && panneau === 'emoji' && (
          <div className="panneau">
            {EMOJIS.map(e => (
              <button key={e} className="emoji"
                      onClick={() => { setBrouillon(b => b + e); setPanneau('') }}>{e}</button>
            ))}
          </div>
        )}
        {role === 'debat' && panneau === 'police' && (
          <div className="panneau">
            {POLICES_LISIBLES.map(p => (
              <button key={p.id} className={'puce' + (police === p.id ? ' active' : '')}
                      style={{ fontFamily: p.id }}
                      onClick={() => { setPolice(p.id); setPanneau('') }}>{p.nom}</button>
            ))}
          </div>
        )}
        {role === 'debat' && panneau === 'effet' && (
          <div className="panneau">
            {EFFETS.map(f => (
              <button key={f.id} className={'puce' + (effet === f.id ? ' active' : '')}
                      onClick={() => { setEffet(f.id); setPanneau('') }}>
                <span className={f.id}>{f.nom}</span>
              </button>
            ))}
          </div>
        )}
        {role === 'debat' && brouillon && (
          <div className="apercu">
            <span className="etiq-apercu">aperçu</span>
            <span className={effet} style={{ fontFamily: police }}>{brouillon}</span>
          </div>
        )}

        {role === 'debat' && (
          <div className="saisie conv-saisie">
            <button className={'outil' + (panneau === 'emoji' ? ' on' : '')} title="Emoji"
                    onClick={() => setPanneau(p => p === 'emoji' ? '' : 'emoji')}>☺</button>
            <button className={'outil' + (panneau === 'police' ? ' on' : '')} title="Choisir la police"
                    onClick={() => setPanneau(p => p === 'police' ? '' : 'police')}>Aa</button>
            <button className={'outil' + (panneau === 'effet' ? ' on' : '')} title="Appliquer un effet"
                    onClick={() => setPanneau(p => p === 'effet' ? '' : 'effet')}>✦</button>
            <button className={'outil' + (anonyme ? ' on' : '')}
                    title={anonyme ? 'Mode anonyme activé' : 'Écrire sans révéler mon identité'}
                    aria-label="Mode anonyme"
                    onClick={() => setAnonyme(a => !a)}>
              <img src="/anonyme.png" alt="" />
            </button>
            {cible && (
              <span className="jd-reponse">
                en réponse à {cible.anonyme ? 'anonyme' : cible.qui}
                <button aria-label="Annuler la réponse" onClick={() => setReponse(null)}>×</button>
              </span>
            )}
            <input ref={champ} value={brouillon}
                   onChange={e => setBrouillon(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && envoyer()}
                   placeholder="Continue le ConVersus…"
                   aria-label="Continue le ConVersus"
                   className={effet} style={{ fontFamily: police }} />
            <button className="env" onClick={envoyer}>Envoyer</button>
          </div>
        )}
      </div>
    </div>
  )
}
