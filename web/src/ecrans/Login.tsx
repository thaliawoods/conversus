import { useState, useEffect, useRef } from 'react'
import { ErreurApi } from '../api'
import Glaieul from '../filaments/Glaieul'

const FORMES = ['PicNic', 'Coxinelle', 'Nudles', 'FixelPont', 'LoveAndRage', 'Frames']

type Props = { onEntrer: (nom: string, mdp: string, creer: boolean, avant: () => Promise<void>) => Promise<void> }

// La sortie se joue en deux temps : d'abord le bloc s'efface entièrement ; ensuite seulement la fleur éclate
// (ECLAT ms), puis on entre dans l'appli.
const ECLAT = 2100

export default function Login({ onEntrer }: Props) {
  const [nom, setNom] = useState('')
  const [mdp, setMdp] = useState('')
  const [i, setI]     = useState(0)
  const [creer, setCreer]   = useState(false)
  const [erreur, setErreur] = useState('')
  const [attente, setAttente] = useState(false)
  const [part, setPart] = useState(false)       // le bloc s'efface
  const [eclate, setEclate] = useState(false)   // le bloc a disparu : la fleur éclate
  const finir = useRef<(() => void) | null>(null)
  const sortir = () => new Promise<void>(fini => { finir.current = fini; setPart(true) })
  // Le bloc a fini de s'effacer : l'éclatement commence, et l'appli entrera quand il sera fini.
  const lance = useRef(false)
  const exploser = () => {
    if (lance.current) return
    lance.current = true
    setEclate(true)
    setTimeout(() => finir.current?.(), ECLAT)
  }
  // Filet de sécurité si la fin de l'effacement n'est jamais signalée (onglet en arrière-plan…).
  useEffect(() => {
    if (!part) return
    const t = setTimeout(exploser, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part])

  const valider = async () => {
    if (!nom.trim() || !mdp) return
    setErreur('')
    setAttente(true)
    try {
      await onEntrer(nom.trim(), mdp, creer, sortir)
    } catch (e) {
      setErreur(e instanceof TypeError ? 'Le backend ne répond pas. Il tourne bien (docker compose up) ?'
        : e instanceof ErreurApi && e.statut === 401 ? 'Nom ou mot de passe incorrect.'
        : creer ? 'Impossible de créer ce compte (le nom est peut-être déjà pris).'
        : (e as Error).message)
    } finally {
      setAttente(false)
    }
  }

  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % FORMES.length), 4000)
    return () => clearInterval(t)
  }, [])

  const forme = FORMES[i]

  return (
    <div className={'login' + (part ? ' part' : '') + (eclate ? ' eclate' : '')}>
      <Glaieul explose={eclate} />

      <form className="carte-login" onAnimationEnd={e => { if (e.animationName === 'login-part') exploser() }} onSubmit={e => { e.preventDefault(); valider() }}>
        <p className="login-marque">ConVersus</p>
        <h2>
          Ici exprime toi librement avec tes messages qui{' '}
          <span className="mot-forme" style={{ fontFamily: forme }}>
            changent de forme
          </span>
        </h2>

        <label className="login-champ">
          <span>Nom d'utilisateur</span>
          <input value={nom} onChange={e => setNom(e.target.value)} autoComplete="username" />
        </label>
        <label className="login-champ">
          <span>Mot de passe</span>
          <input type="password" value={mdp} onChange={e => setMdp(e.target.value)}
                 autoComplete={creer ? 'new-password' : 'current-password'} />
        </label>

        {erreur && <p className="login-erreur">{erreur}</p>}
        <button className="go" type="submit" disabled={attente}>
          {attente ? '…' : creer ? 'Créer mon compte' : 'Se connecter'}
        </button>
        <button type="button" className="login-bascule" onClick={() => { setCreer(c => !c); setErreur('') }}>
          {creer ? 'J’ai déjà un compte' : 'Pas encore de compte ? En créer un'}
        </button>
      </form>
    </div>
  )
}
