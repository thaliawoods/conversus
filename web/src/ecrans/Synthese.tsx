import { useState } from 'react'
import { EtoileMini } from '../Etoile'
import { GENS } from '../donnees'
import type { MsgConv } from '../App'
import { styleDe, teintes } from '../emotions'
import Arbre from '../Arbre'

type Props = {
  sujet: string
  question: { qui: string; dit: string } | null
  msgs: MsgConv[]
  presents: string[]
  moi: string
  onRetour: () => void
  onCanal: () => void
}

export default function Synthese({ sujet, question, msgs, presents, moi, onRetour, onCanal }: Props) {
  const pins = msgs.filter(m => m.epingle)
  const [vise, setVise] = useState<{ id: number; n: number } | null>(null)
  const nomDe = (m: MsgConv) => (m.anonyme ? 'anonyme' : m.qui)

  return (
    <div className="conv">
      <div className="conv-tete">
        <h1>{sujet}</h1>
        <span className="compte">ConVersus clos · {pins.length} retenus</span>
        <button className="btn" onClick={onRetour}>Rouvrir le ConVersus</button>
        <button className="btn fort" onClick={onCanal}>Partager dans le canal</button>
      </div>

      <div className={'synth-arbre' + (pins.length ? '' : ' seul')}>
        <Arbre msgs={msgs} audience={presents.length} moi={moi} question={question} fige vise={vise} />

        {pins.length > 0 && (
          <div className="synth-retenus">
            <h3>À retenir</h3>
            {pins.map(m => {
              const lettres = [...m.dit]
              const etat    = teintes(lettres, m.reactions, presents.length)
              const origine = msgs.find(x => x.id === m.repondA)
              return (
                <button key={m.id} className="sy-msg"
                        onClick={() => setVise(v => ({ id: m.id, n: (v?.n ?? 0) + 1 }))}>
                  <span className="jd-qui">
                    <EtoileMini className="jd-etoile" couleur="#8b5fd6" />
                    <span className="qui">{nomDe(m)}</span>
                    {!m.anonyme && <span className="pronom">{GENS[m.qui]?.pronom ?? ''}</span>}
                  </span>
                  {origine && <span className="sy-origine">en réponse à {nomDe(origine)}</span>}
                  <span className={'jd-dit ' + m.effet}>
                    {lettres.map((l, i) => {
                      const s = styleDe(etat[i], m.police)
                      return <span key={i} style={{ fontFamily: s.police, color: s.couleur, opacity: s.opacite }}>{l}</span>
                    })}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
