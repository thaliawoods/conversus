import { useState } from 'react'
import { GENS, EMOJIS, EFFETS, POLICES_LISIBLES } from '../donnees'

const FILS = [
  { qui: 'Clara',   apercu: 'tu viens au débat de 14h ?', quand: '11:40', nonlu: 2,
    echange: [
      { moi: false, dit: 'tu viens au débat de 14h ?' },
      { moi: true,  dit: 'oui, je finis les ronces et j’arrive' },
      { moi: false, dit: 'parfait, Maya a déjà posé sa forme' },
    ] },
  { qui: 'Killian', apercu: 'j’ai poussé la branche', quand: '11:12', nonlu: 0,
    echange: [
      { moi: false, dit: 'j’ai poussé la branche' },
      { moi: true,  dit: 'je regarde ça' },
    ] },
  { qui: 'Maya',    apercu: 'le logo débat est prêt', quand: '09:48', nonlu: 0,
    echange: [
      { moi: false, dit: 'le logo débat est prêt' },
      { moi: true,  dit: 'les deux étoiles avec la ronce ? parfait' },
    ] },
]

// Minuscules et sans accents : « eli » trouve « Éli ».
const simplifier = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

type Bulle = { moi: boolean; dit: string; police?: string; effet?: string }
type Fil = Omit<typeof FILS[number], 'echange'> & { echange: Bulle[] }

export default function Messages({ policeRepos }: { policeRepos: string }) {
  const [fils, setFils]           = useState<Fil[]>(FILS)
  const [actif, setActif]         = useState(0)
  const [brouillon, setBrouillon] = useState('')
  const [choisir, setChoisir]     = useState(false)
  const [recherche, setRecherche] = useState('')
  const [panneau, setPanneau]     = useState<'' | 'emoji' | 'police' | 'effet'>('')
  const [police, setPolice]       = useState(policeRepos)
  const [effet, setEffet]         = useState('')
  const fil = fils[actif]

  const trouves = Object.values(GENS)
    .filter(g => g.nom !== 'Thalia' && simplifier(`${g.nom} ${g.pronom}`).includes(simplifier(recherche.trim())))

  const ouvrir = (i: number) => {
    setActif(i)
    setFils(fs => fs.map((f, j) => j === i ? { ...f, nonlu: 0 } : f))
  }

  const fermer = () => { setChoisir(false); setRecherche('') }

  const nouveau = (qui: string) => {
    const deja = fils.findIndex(f => f.qui === qui)
    if (deja >= 0) {
      ouvrir(deja)
    } else {
      setFils(fs => [{ qui, apercu: '', quand: '', nonlu: 0, echange: [] }, ...fs])
      setActif(0)
    }
    fermer()
  }

  const envoyer = () => {
    const dit = brouillon.trim()
    if (!dit) return
    const quand = new Date().toTimeString().slice(0, 5)
    setFils(fs => fs.map((f, j) => j === actif
      ? { ...f, apercu: dit, quand, echange: [...f.echange, { moi: true, dit, police, effet }] }
      : f))
    setBrouillon('')
    setPanneau('')
  }

  return (
    <div className="conv">
      <div className="conv-tete">
        <h1>Mes messages</h1>
        <span className="compte">{fils.filter(f => f.nonlu).length} non lus</span>
      </div>

      <div className="msgs">
        <div className="msgs-liste">
          <button className="btn fort nouveau-msg" onClick={() => (choisir ? fermer() : setChoisir(true))}>
            Nouveau message
          </button>

          {choisir && (
            <div className="nouveau-liste">
              <input className="nouveau-recherche" autoFocus value={recherche}
                     placeholder="Chercher une personne…" aria-label="Chercher une personne"
                     onChange={e => setRecherche(e.target.value)}
                     onKeyDown={e => {
                       if (e.key === 'Enter' && trouves[0]) nouveau(trouves[0].nom)
                       if (e.key === 'Escape') fermer()
                     }} />
              {trouves.length === 0 && <i className="presence-vide">personne</i>}
              {trouves.map(g => (
                <button key={g.nom} className="presence-item" onClick={() => nouveau(g.nom)}>
                  <span className="mini-av" style={{ background: g.couleur }}>{g.nom[0]}</span>
                  <span className="gens-nom">{g.nom}</span>
                  <span className="gens-pronom">{g.pronom}</span>
                </button>
              ))}
            </div>
          )}

          {fils.map((f, i) => (
            <button key={f.qui} className={'fil-item' + (i === actif ? ' actif' : '')}
                    onClick={() => ouvrir(i)}>
              <span className="mini-av gros" style={{ background: GENS[f.qui]?.couleur }}>
                {f.qui[0]}
              </span>
              <span className="fil-corps">
                <span className="fil-haut">
                  <b>{f.qui}</b>
                  <i className="pronom">{GENS[f.qui]?.pronom}</i>
                  <span className="fil-quand">{f.quand}</span>
                </span>
                <span className="fil-apercu">{f.apercu}</span>
              </span>
              {f.nonlu > 0 && <span className="fil-nonlu">{f.nonlu}</span>}
            </button>
          ))}
        </div>

        <div className="msgs-fil">
          <div className="msgs-tete">
            <span className="mini-av gros" style={{ background: GENS[fil.qui]?.couleur }}>
              {fil.qui[0]}
            </span>
            <b>{fil.qui}</b>
            <span className="pronom">{GENS[fil.qui]?.pronom}</span>
          </div>

          <div className="msgs-bulles">
            {fil.echange.length === 0 && (
              <i className="presence-vide">Aucun message pour l’instant.</i>
            )}
            {fil.echange.map((e, i) => (
              <div key={i} className={'bul' + (e.moi ? ' moi' : '')}>
                <span className={e.effet} style={{ fontFamily: e.police }}>{e.dit}</span>
              </div>
            ))}
          </div>

          {panneau === 'emoji' && (
            <div className="panneau">
              {EMOJIS.map(e => (
                <button key={e} className="emoji"
                        onClick={() => { setBrouillon(b => b + e); setPanneau('') }}>{e}</button>
              ))}
            </div>
          )}
          {panneau === 'police' && (
            <div className="panneau">
              {POLICES_LISIBLES.map(p => (
                <button key={p.id} className={'puce' + (police === p.id ? ' active' : '')}
                        style={{ fontFamily: p.id }}
                        onClick={() => { setPolice(p.id); setPanneau('') }}>{p.nom}</button>
              ))}
            </div>
          )}
          {panneau === 'effet' && (
            <div className="panneau">
              {EFFETS.map(f => (
                <button key={f.id} className={'puce' + (effet === f.id ? ' active' : '')}
                        onClick={() => { setEffet(f.id); setPanneau('') }}>
                  <span className={f.id}>{f.nom}</span>
                </button>
              ))}
            </div>
          )}

          <div className="saisie">
            <button className={'outil' + (panneau === 'emoji' ? ' on' : '')} title="Emoji"
                    onClick={() => setPanneau(p => p === 'emoji' ? '' : 'emoji')}>☺</button>
            <button className={'outil' + (panneau === 'police' ? ' on' : '')} title="Choisir la police"
                    onClick={() => setPanneau(p => p === 'police' ? '' : 'police')}>Aa</button>
            <button className={'outil' + (panneau === 'effet' ? ' on' : '')} title="Appliquer un effet"
                    onClick={() => setPanneau(p => p === 'effet' ? '' : 'effet')}>✦</button>
            <input placeholder={`Écris à ${fil.qui}…`} aria-label="Écris ton message"
                   className={effet} style={{ fontFamily: police }}
                   value={brouillon}
                   onChange={e => setBrouillon(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') envoyer() }} />
            <button className="env" onClick={envoyer}>Envoyer</button>
          </div>
        </div>
      </div>
    </div>
  )
}
