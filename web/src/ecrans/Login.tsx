import { useState, useEffect } from 'react'
import { ErreurApi } from '../api'
import Glaieul from '../filaments/Glaieul'

const FORMES = ['PicNic', 'Coxinelle', 'Nudles', 'FixelPont', 'LoveAndRage', 'Frames']

type Props = { onEntrer: (nom: string, mdp: string, creer: boolean) => Promise<void> }

export default function Login({ onEntrer }: Props) {
  const [nom, setNom] = useState('')
  const [mdp, setMdp] = useState('')
  const [i, setI]     = useState(0)
  const [creer, setCreer]   = useState(false)
  const [erreur, setErreur] = useState('')
  const [attente, setAttente] = useState(false)

  const valider = async () => {
    if (!nom.trim() || !mdp) return
    setErreur('')
    setAttente(true)
    try {
      await onEntrer(nom.trim(), mdp, creer)
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
    <div className="login">
      <Glaieul />

      <form className="carte-login" onSubmit={e => { e.preventDefault(); valider() }}>
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
