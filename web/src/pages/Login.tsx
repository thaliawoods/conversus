import { useState } from "react";

type LoginProps = { onLogin: (newToken: string) => void };

function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch("http://localhost:4000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      console.log("login refusé", response.status);
      return;
    }

    const newToken = await response.text();
    localStorage.setItem("token", newToken);
    onLogin(newToken);
  }

  return (
    <main className="login">
      <form className="carte-login" onSubmit={handleSubmit}>
        <h2>Ici exprime toi librement avec tes messages qui changent de forme</h2>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Nom d'utilisateur"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mot de passe"
                  />
        <button className="go" type="submit">Se connecter</button>
              </form>
    </main>
  );
}

export default Login;
