import { useState } from "react";
import "./App.css";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
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

    setToken(await response.text());
        const newToken = await response.text();
    localStorage.setItem("token", newToken);
    setToken(newToken);
  }

  return (
    <main>
      <h1>ConVersus</h1>
      <form onSubmit={handleSubmit}>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
                    placeholder="username"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
                    placeholder="password"
        />
        <button type="submit">login</button>
      </form>
      <p>{token}</p>
    </main>
  );
}

export default App;