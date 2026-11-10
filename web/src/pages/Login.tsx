import { Suspense, lazy, useEffect, useState } from "react";

const Gladiolus = lazy(() => import("../login-flower/Gladiolus"));

type LoginProps = { onLogin: (newToken: string) => void };

const API = "http://localhost:4000";
const SHAPE_FONTS = ["PicNic", "Coxinelle", "Nudles", "FixelPont", "LoveAndRage", "Frames"];

function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fontIndex, setFontIndex] = useState(0);
  const [signingUp, setSigningUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setFontIndex((index) => (index + 1) % SHAPE_FONTS.length), 4000);
    return () => clearInterval(timer);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = username.trim();
    if (!name || !password) return;

    setError("");
    setLoading(true);
    try {
      if (signingUp) {
        const signup = await fetch(`${API}/user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: name, password }),
        });
        if (!signup.ok) {
          setError("Impossible de créer ce compte (le nom est peut-être déjà pris).");
          return;
        }
      }

      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password }),
      });

      if (!response.ok) {
        setError(response.status === 401 ? "Nom ou mot de passe incorrect." : `Erreur ${response.status}`);
        return;
      }

      const newToken = await response.text();
      localStorage.setItem("token", newToken);
      onLogin(newToken);
    } catch {
      setError("Le serveur ne répond pas. Réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <Suspense fallback={null}>
        <Gladiolus />
      </Suspense>

      <form className="login-card" onSubmit={handleSubmit}>
        <p className="login-brand">ConVersus</p>
        <h2>
          Ici exprime toi librement avec tes messages qui{" "}
          <span className="shape-word" style={{ fontFamily: SHAPE_FONTS[fontIndex] }}>
            changent de forme
          </span>
        </h2>

        <label className="login-field">
          <span>Nom d'utilisateur</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="login-field">
          <span>Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={signingUp ? "new-password" : "current-password"}
          />
        </label>

        {error && <p className="login-error">{error}</p>}
        <button className="login-button" type="submit" disabled={loading}>
          {loading ? "…" : signingUp ? "Créer mon compte" : "Se connecter"}
        </button>
        <button
          type="button"
          className="login-switch"
          onClick={() => {
            setSigningUp((current) => !current);
            setError("");
          }}
        >
          {signingUp ? "J’ai déjà un compte" : "Pas encore de compte ? En créer un"}
        </button>
      </form>
    </main>
  );
}

export default Login;
