import { useState } from 'react'
import { personne } from './donnees'
import { Etoile } from './Etoile'

type Props = {
  extraits: { id:number; qui:string; dit:string }[]
  onAnnuler: () => void
  onLancer: (sujet:string) => void
}

export default function ModaleOuvrir({ extraits, onAnnuler, onLancer }: Props) {
  const [sujet, setSujet] = useState(extraits[0]?.dit ?? '')

  return (
    <div className="voile" onClick={onAnnuler}>
      <div className="modale" onClick={e => e.stopPropagation()}>

        <div className="modale-tete">
          <Etoile className="modale-etoile" />
          <h2>Ouvrir un ConVersus</h2>
        </div>

        <label className="lab" htmlFor="suj">Sujet</label>
        <input id="suj" className="saisie-modale" value={sujet}
               onChange={e => setSujet(e.target.value)}
               placeholder="De quoi parle-t-on ?" />

        <p className="modale-ia">Pas de minuteur : le ConVersus reste ouvert. Chaque idée pousse depuis la fleur, chaque réponse depuis sa bulle, et la fleur vit tant qu’on en parle.</p>

        <label className="lab">Messages à l'origine</label>
        <div className="extraits">
          {extraits.map(m => (
            <div key={m.id} className="extrait">
              <span className="mini-av" style={{ background: personne(m.qui).couleur }}>
                {m.qui[0]}
              </span>
              <span className="extrait-qui">{m.qui}</span>
              <span className="extrait-dit">{m.dit}</span>
            </div>
          ))}
        </div>

        <div className="modale-pied">
          <button className="btn" onClick={onAnnuler}>Annuler</button>
          <button className="btn fort" onClick={() => onLancer(sujet)}>
            Lancer le ConVersus
          </button>
        </div>
      </div>
    </div>
  )
}
