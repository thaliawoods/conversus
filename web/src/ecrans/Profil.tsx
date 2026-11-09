import { Etoile } from '../Etoile'
import { PROFIL, POLICES_LISIBLES } from '../donnees'

type Props = {
  vue: 'profil' | 'parametres'
  policeRepos: string
  setPoliceRepos: (p: string) => void
  effets: boolean
  setEffets: (b: boolean) => void
  visibilite: string
  setVisibilite: (v: string) => void
  onDeconnexion: () => void
}

function Choix(
  { titre, aide, options, valeur, onChoisir }:
  { titre: string; aide?: string; options: { id: string; nom: string }[]
    valeur: string; onChoisir: (id: string) => void }
) {
  return (
    <div className="pref">
      <div className="pref-titre">{titre}</div>
      {aide && <div className="pref-aide">{aide}</div>}
      <div className="pref-choix">
        {options.map(o => (
          <button
            key={o.id}
            className={'puce' + (valeur === o.id ? ' active' : '')}
            style={titre === 'Police de repos' ? { fontFamily: o.id } : undefined}
            onClick={() => onChoisir(o.id)}
          >
            {o.nom}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Profil({
  vue, policeRepos, setPoliceRepos, effets, setEffets,
  visibilite, setVisibilite, onDeconnexion,
}: Props) {
  return (
    <div className="conv">
      <div className="conv-tete">
        <h1>{vue === 'profil' ? 'Mon profil' : 'Paramètres'}</h1>
      </div>

      <div className="synth">
        {vue === 'profil' && (
        <div className="bloc sombre carte-profil">
          <Etoile className="deco-profil" />
          <div className="avatar-xl">T</div>
          <div className="pseudo">{PROFIL.pseudo}</div>
          <div className="ligne-profil">{PROFIL.ligne}</div>
          <p className="bio">{PROFIL.bio}</p>

          <div className="stats">
            {PROFIL.stats.map(s => (
              <div key={s.quoi} className="stat">
                <div className="n">{s.n}</div>
                <div className="quoi">{s.quoi}</div>
              </div>
            ))}
          </div>

          <button className="btn" style={{ marginTop: '1.4rem' }}>Modifier le profil</button>
        </div>
        )}

        {vue === 'parametres' && (
        <div className="bloc">
          <h3>Préférences</h3>

          <Choix
            titre="Police de repos"
            options={POLICES_LISIBLES}
            valeur={policeRepos}
            onChoisir={setPoliceRepos}
          />

          <Choix
            titre="Effets typographiques"
            options={[{ id: 'oui', nom: 'Activés' }, { id: 'non', nom: 'Désactivés' }]}
            valeur={effets ? 'oui' : 'non'}
            onChoisir={v => setEffets(v === 'oui')}
          />

          <Choix
            titre="Qui voit mon profil"
            options={[
              { id: 'promo', nom: 'Toute la promo' },
              { id: 'groupes', nom: 'Mes groupes' },
              { id: 'personne', nom: 'Personne' },
            ]}
            valeur={visibilite}
            onChoisir={setVisibilite}
          />

          <button className="btn" style={{ marginTop: '1.6rem' }} onClick={onDeconnexion}>
            Se déconnecter
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
