import { FICHES, GENS, type Fiche } from '../donnees'
import { Etoile } from '../Etoile'

type Courante = { sujet: string; close: boolean; gens: string[]; retenus: number } | null

type Props = { courante: Courante; onAller: () => void; onFiche: (f: Fiche) => void }

export default function Debats({ courante, onAller, onFiche }: Props) {
  const actifs = FICHES.filter(f => f.statut === 'active')
  const clos   = FICHES.filter(f => f.statut === 'close')

  return (
    <div className="conv">
      <div className="conv-tete">
        <Etoile className="tete-etoile" />
        <h1>Les ConVersus</h1>
        <span className="compte">
          {actifs.length + (courante && !courante.close ? 1 : 0)} en cours ·
          {' '}{clos.length + (courante?.close ? 1 : 0)} clos
        </span>
      </div>

      <div className="synth">
        <div className="bloc">
          <h3>En cours</h3>
          <div className="cartes">
            {courante && !courante.close && (
              <button className="carte-deb mienne" onClick={onAller}>
                <span className="pastille active" />
                <span className="carte-sujet">{courante.sujet}</span>
                <span className="carte-bas">
                  <span className="trombi">
                    {courante.gens.map(n => (
                      <span key={n} className="mini-av"
                            style={{ background: GENS[n]?.couleur ?? '#999' }}>{n[0]}</span>
                    ))}
                  </span>
                  <span className="carte-meta">la tienne</span>
                </span>
              </button>
            )}
            {actifs.map(f => (
              <button key={f.id} className="carte-deb" onClick={() => onFiche(f)}>
                <span className="pastille active" />
                <span className="carte-sujet">{f.sujet}</span>
                <span className="carte-bas">
                  <span className="trombi">
                    {f.gens.map(n => (
                      <span key={n} className="mini-av"
                            style={{ background: GENS[n]?.couleur ?? '#999' }}>{n[0]}</span>
                    ))}
                  </span>
                  <span className="carte-meta">{f.canal} · {f.reste}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bloc">
          <h3>Clos</h3>
          <div className="cartes">
            {courante?.close && (
              <button className="carte-deb mienne close" onClick={onAller}>
                <span className="pastille" />
                <span className="carte-sujet">{courante.sujet}</span>
                <span className="carte-bas">
                  <span className="carte-meta">la tienne · {courante.retenus} retenus</span>
                </span>
              </button>
            )}
            {clos.map(f => (
              <button key={f.id} className="carte-deb close" onClick={() => onFiche(f)}>
                <span className="pastille" />
                <span className="carte-sujet">{f.sujet}</span>
                <span className="carte-bas">
                  <span className="carte-meta">{f.canal} · {f.retenus} retenus</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
