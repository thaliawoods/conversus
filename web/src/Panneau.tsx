import { CANAUX, GENS } from './donnees'
import { EtoileMini } from './Etoile'

type Props = {
  mode: 'canal' | 'debat'
  canalId: string
  onAller: () => void
}

export default function Panneau({ mode, canalId, onAller }: Props) {
  if (mode !== 'debat') return null

  const canal = CANAUX.find(c => c.id === canalId)!

  return (
    <aside className="panneau-lat large">
        <section className="sect-fil">
          <h4><EtoileMini /> {canal.nom}</h4>
          <div className="fil-mini">
            {canal.messages.map(m => (
              <div key={m.id} className="ligne-mini">
                <span className="mini-av"
                      style={{ background: GENS[m.qui]?.couleur ?? '#999' }}>
                  {m.qui[0]}
                </span>
                <div>
                  <div className="mini-qui">{m.qui} <i>{m.heure}</i></div>
                  <div className="mini-dit">{m.dit}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn" onClick={onAller}>Revenir au canal</button>
        </section>
    </aside>
  )
}
