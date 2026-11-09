import { useState } from 'react'
import { DUREES, ROLES, GENS, type Role } from './donnees'
import { Etoile } from './Etoile'

type Props = {
  extraits: { id:number; qui:string; dit:string }[]
  onAnnuler: () => void
  onLancer: (sujet:string, duree:number, role:Role) => void
}

export default function ModaleOuvrir({ extraits, onAnnuler, onLancer }: Props) {
  const [sujet, setSujet] = useState(extraits[0]?.dit ?? '')
  const [duree, setDuree] = useState(5)
  const [role, setRole]   = useState<Role>('debat')

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

        <label className="lab">Durée</label>
        <div className="pref-choix">
          {DUREES.map(d => (
            <button key={d} className={'puce' + (duree === d ? ' active' : '')}
                    onClick={() => setDuree(d)}>
              {d} min
            </button>
          ))}
        </div>

        <label className="lab">Ton rôle</label>
        <div className="roles">
          {ROLES.map(r => (
            <button key={r.id}
                    className={'role' + (role === r.id ? ' active' : '')}
                    onClick={() => setRole(r.id)}>
              <span className="role-nom">{r.nom}</span>
              <span className="role-aide">{r.aide}</span>
            </button>
          ))}
        </div>

        <label className="lab">Messages à l'origine</label>
        <div className="extraits">
          {extraits.map(m => (
            <div key={m.id} className="extrait">
              <span className="mini-av" style={{ background: GENS[m.qui]?.couleur ?? '#999' }}>
                {m.qui[0]}
              </span>
              <span className="extrait-qui">{m.qui}</span>
              <span className="extrait-dit">{m.dit}</span>
            </div>
          ))}
        </div>

        <div className="modale-pied">
          <button className="btn" onClick={onAnnuler}>Annuler</button>
          <button className="btn fort" onClick={() => onLancer(sujet, duree, role)}>
            Lancer le ConVersus
          </button>
        </div>
      </div>
    </div>
  )
}
