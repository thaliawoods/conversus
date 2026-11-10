import { useEffect, useState } from "react";
import Glaieul from "../filaments/Glaieul";

type LoginProps = { onLogin: (newToken: string) => void };

const API = "http://localhost:4000";
const FORMES = ["PicNic", "Coxinelle", "Nudles", "FixelPont", "LoveAndRage", "Frames"];

function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formeIndex, setFormeIndex] = useState(0);
  const [creer, setCreer] = useState(false);
  const [erreur, setErreur] = useState("");
  const [attente, setAttente] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setFormeIndex((n) => (n + 1) % FORMES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nom = username.trim();
    if (!nom || !password) return;

    setErreur("");
    setAttente(true);
    try {
      if (creer) {
        const inscription = await fetch(`${API}/user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: nom, password }),
        });
        if (!inscription.ok) {
          setErreur("Impossible de créer ce compte (le nom est peut-être déjà pris).");
          return;
        }
      }

      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nom, password }),
      });

      if (!response.ok) {
        setErreur(response.status === 401 ? "Nom ou mot de passe incorrect." : `Erreur ${response.status}`);
        return;
      }

      const newToken = await response.text();
      localStorage.setItem("token", newToken);
      onLogin(newToken);
    } catch {
      setErreur("Le backend ne répond pas. Il tourne bien (docker compose up) ?");
    } finally {
      setAttente(false);
    }
  }

  return (
    <main className="login">
      <Glaieul />

      <form className="login-card" onSubmit={handleSubmit}>
        <p className="login-marque">ConVersus</p>
        <h2>
          Ici exprime toi librement avec tes messages qui{" "}
          <span className="mot-forme" style={{ fontFamily: FORMES[formeIndex] }}>
            changent de forme
          </span>
        </h2>

        <label className="login-champ">
          <span>Nom d'utilisateur</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="login-champ">
          <span>Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={creer ? "new-password" : "current-password"}
          />
        </label>

        {erreur && <p className="login-erreur">{erreur}</p>}
        <button className="login-button" type="submit" disabled={attente}>
          {attente ? "…" : creer ? "Créer mon compte" : "Se connecter"}
        </button>
        <button
          type="button"
          className="login-bascule"
          onClick={() => {
            setCreer((c) => !c);
            setErreur("");
          }}
        >
          {creer ? "J’ai déjà un compte" : "Pas encore de compte ? En créer un"}
        </button>
      </form>
    </main>
  );
}

export default Login;
