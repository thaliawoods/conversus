import { Suspense, lazy, useEffect, useState } from "react";
import Logo from "../components/Logo";
import { API, SERVER_DOWN } from "../api";
import { rememberAccount } from "../accounts";
import PronounsPicker from "../components/PronounsPicker";

const Gladiolus = lazy(() => import("../login-flower/Gladiolus"));

type LoginProps = { onLogin: (newToken: string) => void };

const SHAPE_FONTS = ["PicNic", "Coxinelle", "Nudles", "FixelPont", "LoveAndRage", "Frames"];

function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [pronouns, setPronouns] = useState("");
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
    if (!name || !password) {
      setError("Écris ton nom et ton mot de passe.");
      return;
    }
    if (signingUp && password !== passwordAgain) {
      setError("Les deux mots de passe ne sont pas pareils.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      if (signingUp) {
        const mine = pronouns.trim();
        const signup = await fetch(`${API}/user?namespace=conversus`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mine ? { username: name, password, metadata: { pronouns: mine } } : { username: name, password }),
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
      rememberAccount(name, newToken);
      onLogin(newToken);
    } catch {
      setError(SERVER_DOWN);
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
        <Logo />
        {signingUp && <p className="login-mode">Crée ton compte</p>}
        <h2>
          Ici, exprime-toi librement avec tes messages qui{" "}
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
        {signingUp && (
          <div className="login-extra">
            <label className="login-field">
              <span>Confirme ton mot de passe</span>
              <input
                type="password"
                value={passwordAgain}
                onChange={(event) => setPasswordAgain(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <div className="login-field">
              <span>Pronoms (facultatif)</span>
              <PronounsPicker value={pronouns} onChange={setPronouns} />
            </div>
          </div>
        )}

        {/* Always there (empty when no error): the form doesn't jump when an error appears. */}
        <p className="login-error" aria-live="polite">{error}</p>
        <button className="login-button" type="submit" disabled={loading}>
          {loading ? "…" : signingUp ? "Créer mon compte" : "Se connecter"}
          {/* variante pour la créa : une flèche au lieu du texte du bouton.
              si on la prend, ajouter aria-label et title sur le bouton
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M14 4h6v16h-6" />
            <path d="M3 12h12M11 8l4 4-4 4" />
          </svg>
          */}
        </button>
        <button
          type="button"
          className="login-switch"
          onClick={() => {
            setSigningUp((current) => !current);
            setError("");
            // The password typed for one form is not carried into the other.
            setPassword("");
            setPasswordAgain("");
          }}
        >
          {signingUp ? "J’ai déjà un compte" : "Pas encore de compte ? Inscris-toi"}
        </button>
      </form>
    </main>
  );
}

export default Login;
