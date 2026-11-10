import { useEffect, useState } from 'react'
import { Etoile } from '../Etoile'
import Fleur from '../Fleur'
import { couleursDe, fonce, vitalite } from '../plan'
import type { Debat } from '../conversus'

type Props = { debats: Debat[]; moi: string; onOuvrir: (canalId: number) => void }

const derniere = (d: Debat) => Math.max(d.debut, ...d.msgs.map(m => Date.parse(m.date)))

function ilYa(t: number, maintenant: number) {
  const min = Math.round((maintenant - t) / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`
}

function Carte({ d, moi, maintenant, onOuvrir }: { d: Debat; moi: string; maintenant: number; onOuvrir: (id: number) => void }) {
  const couleur = couleursDe(d)
  const gens = [...new Set([d.question.qui, ...d.msgs.map(m => m.qui)])]
  const vie = vitalite(d, maintenant)
  return (
    <button className={'carte-deb' + (d.lanceur === moi ? ' mienne' : '')} onClick={() => onOuvrir(d.canalId)}>
      <Fleur vie={vie} taille={44} className="carte-fleur" />
      <span className="carte-sujet">{d.sujet}</span>
      <span className="carte-bas">
        <span className="trombi">
          {gens.slice(0, 6).map(n => (
            <span key={n} className="mini-av" style={{ background: fonce(couleur(n)) }}>{n[0]}</span>
          ))}
        </span>
        <span className="carte-meta">
          {d.lanceur === moi ? 'le tien · ' : ''}{d.source.nom} · {d.msgs.length} message{d.msgs.length > 1 ? 's' : ''} · {ilYa(derniere(d), maintenant)}
        </span>
      </span>
    </button>
  )
}

export default function Debats({ debats, moi, onOuvrir }: Props) {
  const [maintenant, setMaintenant] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const tries = [...debats].sort((a, b) => derniere(b) - derniere(a))

  return (
    <div className="conv">
      <div className="conv-tete">
        <Etoile className="tete-etoile" />
        <h1>Les ConVersus</h1>
        <span className="compte">{debats.length} ouvert{debats.length > 1 ? 's' : ''}</span>
      </div>

      <div className="synth">
        <div className="bloc">
          <h3>Du plus vivant au plus ancien</h3>
          <div className="cartes">
            {tries.length === 0 && (
              <p className="vide">Aucun ConVersus pour l’instant. Sélectionne des messages dans un canal pour en lancer un.</p>
            )}
            {tries.map(d => <Carte key={d.canalId} d={d} moi={moi} maintenant={maintenant} onOuvrir={onOuvrir} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
