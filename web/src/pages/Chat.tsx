import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Navbar, { type Channel } from "../components/Navbar";
import LaunchModal from "../components/LaunchModal";

export type ReactionValue = "leaf" | "thorn" | "wilt";

export type Message = {
  id: number;
  content: string;
  user: string;
  anonymous?: boolean;
  metadata?: {
    conversus?: {
      channelName?: string;
      author?: string;
      replyTo?: number;
      font?: string;
      effect?: ReactionValue;
      reactTo?: number;
      value?: ReactionValue;
    };
  };
};

type ChatProps = { token: string; onTokenExpired: () => void };

function Chat({ token, onTokenExpired }: ChatProps) {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const messagesRef = useRef<HTMLUListElement>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const selectedMessages = messages.filter((message) =>
    selectedIds.includes(message.id),
  );
  const lastMessageId = messages.at(-1)?.id;
  const currentChannel = channels.find(
    (channel) => channel.id === Number(channelId),
  );
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
        `http://localhost:4000/channel/message?channel=${channelId}&namespace=conversus`,
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
  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [lastMessageId]);
  async function handleLaunch(subject: string) {
    const response = await fetch(
      "http://localhost:4000/channel?namespace=conversus",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: `${subject}#${Date.now()}`,
          metadata: {},
        }),
      },
    );
    if (!response.ok) {
      console.log("débat refusé", response.status);
      return;
    }
    const debate: Channel = await response.json();
    await fetch("http://localhost:4000/channel/message?namespace=conversus", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content: subject,
        channel: debate.id,
        metadata: {},
      }),
    });
    for (const message of selectedMessages) {
      await fetch("http://localhost:4000/channel/message?namespace=conversus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: message.content,
          channel: debate.id,
          metadata: { author: message.user },
        }),
      });
    }
    await fetch("http://localhost:4000/channel/message?namespace=conversus", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content: `a ouvert un ConVersus : ${subject}`,
        channel: Number(channelId),
        metadata: { channelName: debate.name },
      }),
    });
    navigate(`/debate/${debate.id}`);
  }
  async function handleJoin(message: Message) {
    const channelName = message.metadata?.conversus?.channelName;
    if (!channelName) return;

    const joined = channels.find((channel) => channel.name === channelName);
    if (joined) {
      navigate(`/debate/${joined.id}`);
      return;
    }

    const response = await fetch("http://localhost:4000/channel/enter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: channelName }),
    });
    if (!response.ok) {
      console.log("entrée refusée", response.status);
      return;
    }
    const debate: Channel = await response.json();
    navigate(`/debate/${debate.id}`);
  }
  function handleToggleSelecting() {
    setIsSelecting(!isSelecting);
    setSelectedIds([]);
  }
  function handleToggleMessage(messageId: number) {
    if (selectedIds.includes(messageId)) {
      setSelectedIds(selectedIds.filter((id) => id !== messageId));
      return;
    }
    setSelectedIds([...selectedIds, messageId]);
  }
  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channelId) return;
    if (!content.trim()) return;

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
    <main className="chat">
      <Navbar channels={channels} />
      <div className="chat-actions">
        <h2 className="channel-title">{currentChannel?.name}</h2>
        <button type="button" onClick={handleToggleSelecting}>
          {isSelecting ? "Annuler" : "Lancer un ConVersus"}
        </button>
      </div>
      <ul className="messages" ref={messagesRef}>
        {messages.map((message) => (
          <li className="message" key={message.id}>
            {isSelecting && (
              <input
                type="checkbox"
                checked={selectedIds.includes(message.id)}
                onChange={() => handleToggleMessage(message.id)}
              />
            )}
            <span className="avatar">{message.user[0]}</span>
            <div className="message-body">
              <strong>{message.user}</strong>
              <p>{message.content}</p>
              {message.metadata?.conversus?.channelName && (
                <button
                  className="join-button"
                  type="button"
                  onClick={() => handleJoin(message)}
                >
                  Rejoindre
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {isSelecting && (
        <div className="selection-bar">
          <span>
            {selectedIds.length}{" "}
            {selectedIds.length > 1 ? "messages ciblés" : "message ciblé"}
          </span>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => setIsLaunching(true)}
          >
            Lancer le ConVersus
          </button>
        </div>
      )}
      <form className="message-form" onSubmit={handleSendMessage}>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Écris ton message..."
        />
        <button type="submit">Envoyer</button>
      </form>
      {isLaunching && (
        <LaunchModal
          messages={selectedMessages}
          onCancel={() => setIsLaunching(false)}
          onLaunch={handleLaunch}
        />
      )}
    </main>
  );
}

export default Chat;
