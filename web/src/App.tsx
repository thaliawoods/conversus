import { useEffect, useState } from "react";
import "./App.css";

type Channel = { id: number; name: string };
type Message = { id: number; content: string; user: string };
function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  useEffect(() => {
    if (!token) return;

    async function loadProfile() {
      const response = await fetch("http://localhost:4000/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profile = await response.json();
      setChannels(profile.channels);
    }

    loadProfile();
  }, [token]);

  useEffect(() => {
    if (!token || channelId === null) return;

    async function loadMessages() {
      const response = await fetch(
        `http://localhost:4000/channel/message?channel=${channelId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        console.log("messages refusés", response.status);
        return;
      }
      const data: Message[] | null = await response.json();
      setMessages((data ?? []).toReversed());
    }

    loadMessages();
    const intervalId = setInterval(loadMessages, 2000);
    return () => clearInterval(intervalId);  }, [token, channelId]);

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
    setToken(newToken);
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (channelId === null) return;

    const response = await fetch(
      "http://localhost:4000/channel/message?namespace=conversus",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content, channel: channelId, metadata: {} }),
      },
    );

    if (!response.ok) {
      console.log("message refusé", response.status);
      return;
    }

    const message: Message = await response.json();
    setMessages([...messages, message]);
    setContent("");
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
      <ul>
        {channels.map((channel) => (
          <li key={channel.id}>
            <button type="button" onClick={() => setChannelId(channel.id)}>
              {channel.name}
            </button>
          </li>
        ))}
      </ul>
      <ul>
        {messages.map((message) => (
          <li key={message.id}>
            {message.user} : {message.content}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSendMessage}>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <button type="submit">send</button>
      </form>
    </main>
  );
}

export default App;
