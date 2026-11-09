import { useState } from 'react'
import { CANAUX, POLICES_LISIBLES, GENS } from '../donnees'
import { Etoile } from '../Etoile'

const EMOJIS = ['🥐', '🍫', '🔥', '😭', '😤', '✨', '👀', '💜', '🙃', '🤝']

const EFFETS = [
  { id: '',           nom: 'Aucun' },
  { id: 'tremble',    nom: 'Tremblement' },
  { id: 'ondule',     nom: 'Ondulation' },
  { id: 'respire',    nom: 'Respiration' },
]

type Props = {
  canalId: string
  selection: number[]
  setSelection: (ids: number[]) => void
  onOuvrir: () => void
  policeRepos: string
}

export default function Chat({ canalId, selection, setSelection, onOuvrir, policeRepos }: Props) {
  const [brouillon, setBrouillon] = useState('')
  const [cible, setCible]         = useState(false)
  const [panneau, setPanneau]     = useState<'' | 'emoji' | 'police' | 'effet'>('')
  const [police, setPolice]       = useState(policeRepos)
  const [effet, setEffet]         = useState('')
  const [anonyme, setAnonyme]     = useState(false)

  const canal = CANAUX.find(c => c.id === canalId)!

  const cocher = (id: number) => {
    if (!cible) return
    setSelection(
      selection.includes(id) ? selection.filter(x => x !== id) : [...selection, id]
    )
  }

  const annuler = () => { setCible(false); setSelection([]) }

  return (
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

      <div className="fil">
        {canal.messages.map(m => {
          const coche = selection.includes(m.id)
          return (
            <div
              key={m.id}
              className={'ligne' + (coche ? ' coche' : '') + (cible ? ' ciblable' : '')}
              onClick={() => cocher(m.id)}
            >
              {cible && <span className="case">{coche ? '✓' : ''}</span>}
              <span className="mini-av gros"
                    style={{ background: GENS[m.qui]?.couleur ?? '#999' }}>
                {m.qui[0]}
              </span>
              <div className="corps">
                <div className="qui">
                  <b>{m.qui}</b>
                  <span className="pronom">{GENS[m.qui]?.pronom ?? ''}</span>
                  <span className="heure">{m.heure}</span>
                </div>
                <div className="dit">{m.dit}</div>
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
            placeholder="Écris ton message…"
            aria-label="Écris ton message"
            style={{ fontFamily: police }}
          />
          <button className="env" onClick={() => { setBrouillon(''); setPanneau('') }}>
            Envoyer
          </button>
        </div>
      </div>
    </div>
  )
}
