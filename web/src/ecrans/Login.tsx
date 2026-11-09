import { useState, useEffect } from 'react'
import { Etoile } from '../Etoile'

const FORMES = ['PicNic', 'Coxinelle', 'Nudles', 'FixelPont', 'LoveAndRage', 'Frames']

export default function Login({ onEntrer }: { onEntrer: () => void }) {
  const [nom, setNom] = useState('thalia_woods')
  const [mdp, setMdp] = useState('••••••••••')
  const [i, setI]     = useState(0)

  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % FORMES.length), 4000)
    return () => clearInterval(t)
  }, [])

  const forme = FORMES[i]

  return (
    <div className="login">
      <Etoile className="deco" />
      <Etoile className="deco" />
      <Etoile className="deco" />

      <form className="carte-login" onSubmit={e => { e.preventDefault(); onEntrer() }}>
        <h2>
          Ici exprime toi librement avec tes messages qui{' '}
          <span className="mot-forme" style={{ fontFamily: forme }}>
            changent de forme
          </span>
        </h2>

        <input value={nom} onChange={e => setNom(e.target.value)}
               placeholder="Nom d'utilisateur" aria-label="Nom d'utilisateur" />
        <input type="password" value={mdp} onChange={e => setMdp(e.target.value)}
               placeholder="Mot de passe" aria-label="Mot de passe" />

        <button className="go" type="submit">Se connecter</button>
      </form>
    </div>
  )
}
