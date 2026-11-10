// Pendant un ConVersus : les canaux textuels restent ouverts à gauche, en direct, et on peut y écrire.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { personne } from './donnees'
import { EtoileMini } from './Etoile'
import type { Canal, MsgCanal } from './useConversus'

type Props = {
  canaux: Canal[]
  canalId: number | null
  setCanal: (id: number) => void
  messages: MsgCanal[]
  onEnvoyer: (texte: string) => void
  onDebat: (canalId: number) => void
  onAller: () => void
}

// L'horloge interne du backend poste un message toutes les 10 minutes : inutile ici.
const bruit = (m: MsgCanal) => m.brut.user === 'internal-clock'

export default function Panneau({ canaux, canalId, setCanal, messages, onEnvoyer, onDebat, onAller }: Props) {
  const [brouillon, setBrouillon] = useState('')
  const fil = useRef<HTMLDivElement>(null)
  const enBas = useRef(true)
  const visibles = messages.filter(m => !bruit(m)).slice(-60)
  const dernier = visibles[visibles.length - 1]?.id

  // On reste collé en bas tant qu'on n'est pas remonté lire plus haut.
  useLayoutEffect(() => {
    const f = fil.current
    if (f && enBas.current) f.scrollTop = f.scrollHeight
  }, [dernier, canalId])
  useEffect(() => { enBas.current = true }, [canalId])

  const envoyer = () => {
    const t = brouillon.trim()
    if (!t) return
    onEnvoyer(t)
    setBrouillon('')
    enBas.current = true
  }

  return (
    <aside className="panneau-lat large">
      <section className="sect-fil">
        <h4><EtoileMini /> Canaux</h4>
        <div className="pl-onglets">
          {canaux.map(c => (
            <button key={c.id} className={c.id === canalId ? 'actif' : undefined} onClick={() => setCanal(c.id)}>{c.nom}</button>
          ))}
        </div>

        <div className="fil-mini" ref={fil}
             onScroll={e => { const f = e.currentTarget; enBas.current = f.scrollHeight - f.scrollTop - f.clientHeight < 40 }}>
          {visibles.length === 0 && <p className="vide">Rien pour l’instant.</p>}
          {visibles.map(m => m.annonce ? (
            <div key={m.id} className="pl-annonce">
              ⟡ {m.qui} a lancé « {m.annonce.sujet} »
              <button onClick={() => onDebat(m.annonce!.canalId)}>voir</button>
            </div>
          ) : (
            <div key={m.id} className="ligne-mini">
              <span className="mini-av" style={{ background: personne(m.qui).couleur }}>{m.qui[0]}</span>
              <div>
                <div className="mini-qui">{m.qui} <i>{m.heure}</i></div>
                <div className="mini-dit" style={m.police ? { fontFamily: m.police } : undefined}>{m.dit}</div>
              </div>
            </div>
          ))}
        </div>

        <form className="pl-saisie" onSubmit={e => { e.preventDefault(); envoyer() }}>
          <input value={brouillon} onChange={e => setBrouillon(e.target.value)}
                 placeholder={`Écrire dans ${canaux.find(c => c.id === canalId)?.nom ?? 'le canal'}…`}
                 aria-label="Écrire dans le canal" />
          <button type="submit">Envoyer</button>
        </form>
        <div className="pl-bas"><button onClick={onAller}>ouvrir le canal en grand</button></div>
      </section>
    </aside>
  )
}
