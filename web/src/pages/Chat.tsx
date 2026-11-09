import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router";

type Channel = { id: number; name: string };
type Message = { id: number; content: string; user: string };

type ChatProps = { token: string; onTokenExpired: () => void };

function Chat({ token, onTokenExpired }: ChatProps) {
  const { channelId } = useParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  useEffect(() => {
    async function loadProfile() {
      const response = await fetch("http://localhost:4000/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        onTokenExpired();
        return;
      }
      const profile = await response.json();
      setChannels(profile.channels);
    }

    loadProfile();
  }, [token, onTokenExpired]);
  useEffect(() => {
    if (!channelId) return;

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
    return () => clearInterval(intervalId);
  }, [token, channelId]);
  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channelId) return;

    const response = await fetch(
      "http://localhost:4000/channel/message?namespace=conversus",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content,
          channel: Number(channelId),
          metadata: {},
        }),
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
      <nav>
        {channels.map((channel) => (
          <NavLink key={channel.id} to={`/channel/${channel.id}`}>
            {channel.name}
          </NavLink>
        ))}
      </nav>
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
          placeholder="Écris ton message..."
        />
        <button type="submit">Envoyer</button>
      </form>
    </main>
  );
}

export default Chat;
