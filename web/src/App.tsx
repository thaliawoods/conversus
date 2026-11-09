import { useEffect, useState } from 'react'
import './styles.css'
import { Etoile } from './Etoile'
import {
  CANAUX, GENS, POLICE_NEUTRE, REACTIONS_DEMO, REACTIONS_REPONSES_DEMO, REPONSES_DEMO, SPECTATEURS_DEMO,
  type Fiche, type Role,
} from './donnees'
import type { Emotion, Reaction } from './emotions'
import Panneau from './Panneau'
import ModaleOuvrir from './ModaleOuvrir'
import Ouverture from './Ouverture'
import Login from './ecrans/Login'
import Chat from './ecrans/Chat'
import Jardin from './ecrans/Jardin'
import Synthese from './ecrans/Synthese'
import Profil from './ecrans/Profil'
import Messages from './ecrans/Messages'
import Debats from './ecrans/Debats'
import { descendance } from './Arbre'
import TestArbre from './TestArbre'
import Planche from './Planche'

export type MsgConv = {
  id: number
  qui: string
  dit: string
  police: string
  effet: string
  anonyme: boolean
  epingle: boolean
  reactions: Reaction[]
  repondA?: number
}

// Simulation des réactions et réponses des autres pendant un ConVersus : désactivée pour tester
// à la main (menu du compte, « être »). Passer à true pour la relancer.
const SIMULATION = false

type Evenement = { id: number; r: Reaction } | { msg: MsgConv }

type Ecran = 'login'| 'canal' | 'conv' | 'synthese' | 'profil' | 'parametres' | 'messages' | 'debats'

export default function App() {
  const [ecran, setEcran]         = useState<Ecran>('login')
  const [moi, setMoi]             = useState('Thalia')
  const [canalId, setCanalId]     = useState(CANAUX[0].id)
  const [selection, setSelection] = useState<number[]>([])
  const [modale, setModale]       = useState(false)
  const [anime, setAnime]         = useState(false)
  const [close, setClose]         = useState(false)
  const [sujet, setSujet]         = useState('')
  const [question, setQuestion]   = useState<{qui:string;dit:string} | null>(null)
  const [duree, setDuree]         = useState(5)
  const [role, setRole]           = useState<Role>('debat')
  const [msgs, setMsgs]           = useState<MsgConv[]>([])
  const [presents, setPresents]   = useState<string[]>([])
  const [aVenir, setAVenir]       = useState<Evenement[]>([])

  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const suivre = () => setHash(location.hash)
    addEventListener('hashchange', suivre)
    return () => removeEventListener('hashchange', suivre)
  }, [])

  const [policeRepos, setPoliceRepos] = useState('Tremplin')
  const [effets, setEffets]           = useState(true)
  const [visibilite, setVisibilite]   = useState('promo')

  const canal    = CANAUX.find(c => c.id === canalId)!
  const extraits = canal.messages.filter(m => selection.includes(m.id))

  const lancer = (s: string, d: number, r: Role) => {
    setSujet(s || 'Nouvelle conversation')
    setDuree(d)
    setRole(r)
    const [tete, ...suite] = extraits
    setQuestion(tete ? { qui: tete.qui, dit: tete.dit } : null)
    setMsgs(suite.map(m => ({
      id: m.id, qui: m.qui, dit: m.dit,
      police: POLICE_NEUTRE,
      effet: '', anonyme: false,
      epingle: false,
      reactions: [],
    })))
    const reactionsDe = (id: number, liste: Reaction[] = []) => liste
      .filter(r => r.qui !== moi)
      .map((r, k) => ({ id, r, k }))
    const file: Evenement[] = suite
      .flatMap(m => reactionsDe(m.id, REACTIONS_DEMO[m.id]))
      .sort((a, b) => a.k - b.k)
      .map(({ id, r }) => ({ id, r }))
    const ids = new Set(suite.map(m => m.id))
    const reponses = REPONSES_DEMO.filter(rep => rep.qui !== moi && ids.has(rep.repondA) && ids.add(rep.id))
    reponses.forEach((rep, j) => file.splice(Math.min(2 + 4 * j, file.length), 0, { msg: {
      id: rep.id, qui: rep.qui, dit: rep.dit, police: POLICE_NEUTRE, effet: '',
      anonyme: false, epingle: false, reactions: [], repondA: rep.repondA,
    } }))
    file.push(...reponses.flatMap(rep => reactionsDe(rep.id, REACTIONS_REPONSES_DEMO[rep.id]))
      .map(({ id, r }) => ({ id, r })))
    setAVenir(file)
    setPresents([...new Set([...extraits.map(m => m.qui), moi, ...SPECTATEURS_DEMO])])
    setModale(false)
    setSelection([])
    setAnime(true)
    setClose(false)
    setEcran('conv')
  }

  const epingler = (id: number) =>
    setMsgs(m => m.map(x => x.id === id ? { ...x, epingle: !x.epingle } : x))

  const poser = (id: number, qui: string, r: Reaction | null) =>
    setMsgs(ms => ms.map(m => m.id !== id ? m : {
      ...m,
      reactions: [...m.reactions.filter(x => x.qui !== qui), ...(r ? [r] : [])],
    }))

  const reagir = (id: number, emotion: Emotion | null, anonyme: boolean) =>
    poser(id, moi, emotion ? { qui: moi, emotion, anonyme } : null)

  useEffect(() => {
    if (!SIMULATION || ecran !== 'conv' || close || anime || !aVenir.length) return
    const t = setTimeout(() => {
      const [suivant, ...reste] = aVenir
      if ('msg' in suivant) {
        const { msg } = suivant
        setMsgs(ms => [...ms, msg])
        setPresents(p => (p.includes(msg.qui) ? p : [...p, msg.qui]))
      } else {
        poser(suivant.id, suivant.r.qui, suivant.r)
      }
      setAVenir(reste)
    }, 4000)
    return () => clearTimeout(t)
  }, [ecran, close, anime, aVenir])

  const ecrire = (texte: string, police: string, effet: string, anonyme: boolean, repondA?: number) =>
    setMsgs(m => [...m, {
      id: Date.now(), qui: moi, dit: texte, police, effet, anonyme, epingle: false, reactions: [], repondA,
    }])

  // Interdit sur lui-même ou sur une de ses réponses : la branche se grefferait sur elle-même.
  const deplacer = (id: number, vers?: number) =>
    setMsgs(ms => {
      const m = ms.find(x => x.id === id)
      if (!m || m.qui !== moi || m.repondA === vers) return ms
      if (vers !== undefined && (vers === id || descendance(ms, id).has(vers))) return ms
      return ms.map(x => x.id === id ? { ...x, repondA: vers } : x)
    })

  const ouvrirFiche = (f: Fiche) => {
    setSujet(f.sujet)
    setQuestion(f.question)
    setDuree(f.statut === 'active' ? 3 : 5)
    setRole('debat')
    setMsgs(f.echange.map((m, i) => ({
      id: 9000 + i, qui: m.qui, dit: m.dit, police: m.police,
      effet: '', anonyme: false, epingle: false, reactions: [],
    })))
    setPresents([...new Set([...f.gens, f.question.qui, moi])])
    setAVenir([])
    setClose(f.statut === 'close')
    setEcran(f.statut === 'close' ? 'synthese' : 'conv')
  }

  const devenir = (qui: string) => {
    setMoi(qui)
    setAVenir(f => f.filter(e => ('msg' in e ? e.msg.qui : e.r.qui) !== qui))
    if (msgs.length) setPresents(p => (p.includes(qui) ? p : [...p, qui]))
  }

  const revenirAuCanal = () => { setSelection([]); setEcran('canal') }
  const deconnexion    = () => { setMsgs([]); setSelection([]); setEcran('login') }

  if (hash === '#test-arbre') return <div className="app"><TestArbre /></div>
  if (hash.startsWith('#planche-')) return <div className="app"><Planche key={hash} n={Number(hash.slice(9))} /></div>

  if (ecran === 'login') {
    return <div className="app"><Login onEntrer={() => setEcran('canal')} /></div>
  }

  return (
    <div className="app">
      <nav className="nav">
        <span className="marque"><Etoile />ConVersus</span>

        {CANAUX.map(c => (
          <button key={c.id}
                  className={'onglet' + (ecran === 'canal' && canalId === c.id ? ' actif' : '')}
                  onClick={() => { setCanalId(c.id); setSelection([]); setEcran('canal') }}>
            {c.nom}
          </button>
        ))}

        <button className={'onglet' + (ecran === 'messages' ? ' actif' : '')}
                onClick={() => setEcran('messages')}>Mes messages</button>
        <button className={'onglet' + (ecran === 'debats' ? ' actif' : '')}
                onClick={() => setEcran('debats')}>
          Les ConVersus {msgs.length ? <i className="pastille-nav" /> : null}
        </button>

        <span className="pousse" />

        {(['en ligne', 'hors ligne'] as const).map(etat => {
          const liste = Object.values(GENS)
            .filter(g => (etat === 'en ligne' ? g.enLigne : !g.enLigne))
          return (
            <span key={etat} className={'presence' + (etat === 'en ligne' ? ' on' : '')}>
              <span className={'point' + (etat === 'en ligne' ? ' on' : '')} />
              {etat} <b>{liste.length}</b>
              <span className="presence-liste">
                {liste.length === 0
                  ? <i className="presence-vide">personne</i>
                  : liste.map(g => (
                      <span key={g.nom} className="presence-item">
                        <span className="mini-av" style={{ background: g.couleur }}>{g.nom[0]}</span>
                        <span className="gens-nom">{g.nom}</span>
                        <span className="gens-pronom">{g.pronom}</span>
                      </span>
                    ))}
              </span>
            </span>
          )
        })}

        <span className="moi">
          <span className="compte">{moi === 'Thalia' ? 'thalia_woods' : moi} <i>{GENS[moi].pronom}</i></span>
          <span className={'avatar' + (ecran === 'profil' || ecran === 'parametres' ? ' actif' : '')}
                style={moi === 'Thalia' ? undefined : { background: GENS[moi].couleur }}
                onClick={() => setEcran('profil')}>{moi[0]}</span>
          <span className="moi-menu">
            <button onClick={() => setEcran('profil')}>Mon profil</button>
            <button onClick={() => setEcran('parametres')}>Paramètres</button>
            <span className="moi-etre">être</span>
            {Object.values(GENS).map(g => (
              <button key={g.nom} className={'moi-qui' + (g.nom === moi ? ' actif' : '')} onClick={() => devenir(g.nom)}>
                <span className="mini-av" style={{ background: g.couleur }}>{g.nom[0]}</span>
                {g.nom} <i>{g.pronom}</i>
              </button>
            ))}
            <button className="moi-sortir" onClick={deconnexion}>Déconnexion</button>
          </span>
        </span>
      </nav>

      <div className="corps-app">
        <Panneau
          mode={ecran === 'conv' || ecran === 'synthese' ? 'debat' : 'canal'}
          canalId={canalId}
          onAller={() => setEcran('canal')}
        />

        <div className="zone">
          {ecran === 'canal' && (
            <Chat canalId={canalId} selection={selection} policeRepos={policeRepos}
                  setSelection={setSelection}
                  onOuvrir={() => setModale(true)} />
          )}

          {ecran === 'conv' && (
            <Jardin
              sujet={sujet} question={question} duree={duree} role={role} setRole={setRole}
              msgs={msgs} presents={presents} moi={moi} policeRepos={policeRepos} onEcrire={ecrire} onReagir={reagir} onEpingler={epingler}
              onDeplacer={deplacer}
              onClore={() => { setClose(true); setEcran('synthese') }}
            />
          )}

          {ecran === 'messages' && <Messages policeRepos={policeRepos} />}

          {ecran === 'debats' && (
            <Debats
              courante={msgs.length ? {
                sujet,
                close,
                gens: [...new Set(msgs.map(m => m.qui))],
                retenus: msgs.filter(m => m.epingle).length,
              } : null}
              onAller={() => setEcran(close ? 'synthese' : 'conv')}
              onFiche={ouvrirFiche}
            />
          )}

          {(ecran === 'profil' || ecran === 'parametres') && (
            <Profil vue={ecran}
                    policeRepos={policeRepos} setPoliceRepos={setPoliceRepos}
                    effets={effets} setEffets={setEffets}
                    visibilite={visibilite} setVisibilite={setVisibilite}
                    onDeconnexion={deconnexion} />
          )}

          {ecran === 'synthese' && (
            <Synthese sujet={sujet} question={question} msgs={msgs} presents={presents} moi={moi}
                      onRetour={() => { setClose(false); setEcran('conv') }}
                      onCanal={revenirAuCanal} />
          )}
        </div>
      </div>

      {anime && <Ouverture sujet={sujet} onFini={() => setAnime(false)} />}

      {modale && (
        <ModaleOuvrir extraits={extraits}
                      onAnnuler={() => setModale(false)}
                      onLancer={lancer} />
      )}
    </div>
  )
}
