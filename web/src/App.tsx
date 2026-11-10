import { useCallback, useEffect, useMemo, useState } from 'react'
import './styles.css'
import { Etoile } from './Etoile'
import { personne } from './donnees'
import Panneau from './Panneau'
import ModaleOuvrir from './ModaleOuvrir'
import Ouverture from './Ouverture'
import Cosmos from './Cosmos'
import Login from './ecrans/Login'
import Chat from './ecrans/Chat'
import Jardin from './ecrans/Jardin'
import Profil from './ecrans/Profil'
import Messages from './ecrans/Messages'
import Debats from './ecrans/Debats'
import TestArbre from './TestArbre'
import TestCarte from './TestCarte'
import { useConversus, versMsgCanal } from './useConversus'

export type { MsgConv } from './conversus'

type Ecran = 'canal' | 'conv' | 'profil' | 'parametres' | 'messages' | 'debats'

const EN_LIGNE = 15 * 60_000

export default function App() {
  const [ecran, setEcran]         = useState<Ecran>('canal')
  const [canalId, setCanalId]     = useState<number | null>(null)
  const [debatId, setDebatId]     = useState<number | null>(null)
  const [selection, setSelection] = useState<number[]>([])
  const [modale, setModale]       = useState(false)
  const [anime, setAnime]         = useState<string | null>(null)
  const [pleinEcran, setPleinEcran] = useState(false)               // le board sans le chat de gauche
  const [lancement, setLancement] = useState<string | null>(null)
  const [canalLat, setCanalLat]   = useState<number | null>(null)   // le canal ouvert à gauche pendant un débat

  const [policeRepos, setPoliceRepos] = useState('Tremplin')
  const [effets, setEffets]           = useState(true)
  const [visibilite, setVisibilite]   = useState('promo')

  const c = useConversus()
  const moi = c.session?.nom ?? ''

  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const suivre = () => setHash(location.hash)
    addEventListener('hashchange', suivre)
    return () => removeEventListener('hashchange', suivre)
  }, [])

  // Premier canal par défaut (en général « general »).
  useEffect(() => {
    if (canalId === null && c.canaux.length) setCanalId(c.canaux[0].id)
  }, [c.canaux, canalId])

  const canal    = c.canaux.find(x => x.id === canalId) ?? null
  const fil      = useMemo(() => (canalId !== null ? (c.fils[canalId] ?? []).map(versMsgCanal) : []), [c.fils, canalId])
  const extraits = fil.filter(m => selection.includes(m.id))
  const debat    = debatId !== null ? c.debats[debatId] ?? null : null
  const debats   = Object.values(c.debats).sort((a, b) => b.debut - a.debut)
  const enDebat  = ecran === 'conv'
  const latId    = canalLat ?? debat?.source.id ?? canalId
  const filLat   = useMemo(() => (latId !== null ? (c.fils[latId] ?? []).map(versMsgCanal) : []), [c.fils, latId])

  const lancer = async (sujet: string) => {
    if (!canal) return
    setModale(false)
    setLancement(sujet || 'Nouvelle conversation')
    try {
      const id = await c.lancer(canal, extraits.map(m => m.brut), sujet || 'Nouvelle conversation')
      if (id === null) return
      setSelection([])
      setCanalLat(null)
      setDebatId(id)
      setAnime(sujet || 'Nouvelle conversation')
      setEcran('conv')
    } catch (e) {
      alert(`Le ConVersus n’a pas pu être lancé : ${(e as Error).message}`)
    } finally {
      setLancement(null)
    }
  }

  const ouvrirDebat = (id: number) => {
    c.rejoindre(id)
    setCanalLat(null)
    setDebatId(id)
    setEcran('conv')
  }

  const finAnime = useCallback(() => setAnime(null), [])
  const debatOuvert = debat?.canalId
  const { ecrire, donnerAvis } = c
  const ecrireDebat = useCallback((t: string, a: boolean, r?: number, comme?: string) => {
    if (debatOuvert !== undefined) ecrire(debatOuvert, t, a, r, comme)
  }, [ecrire, debatOuvert])
  const avisDebat = useCallback((id: number, v: 1 | -1, comme?: string) => {
    if (debatOuvert !== undefined) donnerAvis(debatOuvert, id, v, comme)
  }, [donnerAvis, debatOuvert])

  // Présence approximative : a écrit dans le canal depuis moins de 15 minutes.
  const presence = useMemo(() => {
    const dernier = new Map<string, number>()
    for (const m of fil) if (!m.anonyme) dernier.set(m.qui, Math.max(dernier.get(m.qui) ?? 0, new Date(m.brut.posted_at).getTime()))
    if (moi) dernier.set(moi, Date.now())
    const gens = [...dernier.entries()].map(([nom, t]) => ({ ...personne(nom), enLigne: Date.now() - t < EN_LIGNE }))
    return { on: gens.filter(g => g.enLigne), off: gens.filter(g => !g.enLigne) }
  }, [fil, moi])

  if (hash === '#test-arbre') return <div className="app"><TestArbre /></div>
  if (hash === '#test-carte') return <TestCarte />

  if (!c.session) {
    return <div className="app"><Login onEntrer={c.connecter} /></div>
  }

  const deconnexion = () => { setSelection([]); setDebatId(null); setCanalId(null); setEcran('canal'); c.deconnecter() }

  return (
    <div className="app">
      <Cosmos />
      <nav className="nav">
        <span className="marque"><Etoile />ConVersus</span>

        {c.canaux.map(x => (
          <button key={x.id}
                  className={'onglet' + (ecran === 'canal' && canalId === x.id ? ' actif' : '')}
                  onClick={() => { setCanalId(x.id); setSelection([]); setEcran('canal') }}>
            {x.nom}
          </button>
        ))}

        <button className={'onglet' + (ecran === 'messages' ? ' actif' : '')}
                onClick={() => setEcran('messages')}>Mes messages</button>
        <button className={'onglet' + (ecran === 'debats' ? ' actif' : '')}
                onClick={() => setEcran('debats')}>
          Les ConVersus
        </button>

        <span className="pousse" />

        {([['en ligne', presence.on], ['hors ligne', presence.off]] as const).map(([etat, liste]) => (
          <span key={etat} className={'presence' + (etat === 'en ligne' ? ' on' : '')}>
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
        ))}

        <span className="moi">
          <span className="compte">{moi} <i>{personne(moi).pronom}</i></span>
          <span className={'avatar' + (ecran === 'profil' || ecran === 'parametres' ? ' actif' : '')}
                style={{ background: personne(moi).couleur }}
                onClick={() => setEcran('profil')}>{moi[0]}</span>
          <span className="moi-menu">
            <button onClick={() => setEcran('profil')}>Mon profil</button>
            <button onClick={() => setEcran('parametres')}>Paramètres</button>
            <button className="moi-sortir" onClick={deconnexion}>Déconnexion</button>
          </span>
        </span>
      </nav>

      {c.erreur && <div className="bandeau-erreur">{c.erreur}</div>}

      <div className="corps-app">
        {enDebat && !pleinEcran && (
          <Panneau
            canaux={c.canaux} canalId={latId} setCanal={setCanalLat}
            messages={filLat}
            onEnvoyer={t => { if (latId !== null) c.envoyerChat(latId, t, policeRepos, '', false) }}
            onDebat={ouvrirDebat}
            onAller={() => { setSelection([]); if (latId !== null) setCanalId(latId); setEcran('canal') }}
          />
        )}

        <div className="zone">
          {ecran === 'canal' && canal && (
            <Chat canal={canal} messages={fil} selection={selection} policeRepos={policeRepos}
                  setSelection={setSelection}
                  onOuvrir={() => setModale(true)}
                  onEnvoyer={(t, p, e, a) => c.envoyerChat(canal.id, t, p, e, a)}
                  onDebat={ouvrirDebat} />
          )}
          {ecran === 'canal' && !canal && <p className="vide">Chargement des canaux…</p>}

          {ecran === 'conv' && !debat && (
            <p className="vide">{lancement ? `Ouverture de « ${lancement} »…` : 'Chargement du ConVersus…'}</p>
          )}

          {ecran === 'conv' && debat && (
            <Jardin
              key={debat.canalId}
              debat={debat} moi={moi} iaErreur={c.iaErreur}
              pleinEcran={pleinEcran} setPleinEcran={setPleinEcran}
              onEcrire={ecrireDebat} onAvis={avisDebat}
              onSynthese={(ids, portee) => c.synthetiser(debat.canalId, ids, portee)}
            />
          )}

          {ecran === 'messages' && <Messages policeRepos={policeRepos} />}

          {ecran === 'debats' && <Debats debats={debats} moi={moi} onOuvrir={ouvrirDebat} />}

          {(ecran === 'profil' || ecran === 'parametres') && (
            <Profil vue={ecran}
                    policeRepos={policeRepos} setPoliceRepos={setPoliceRepos}
                    effets={effets} setEffets={setEffets}
                    visibilite={visibilite} setVisibilite={setVisibilite}
                    onDeconnexion={deconnexion} />
          )}

        </div>
      </div>

      {anime && <Ouverture sujet={anime} onFini={finAnime} />}

      {modale && (
        <ModaleOuvrir extraits={extraits}
                      onAnnuler={() => setModale(false)}
                      onLancer={lancer} />
      )}
    </div>
  )
}
