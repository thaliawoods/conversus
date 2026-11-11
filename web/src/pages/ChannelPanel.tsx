import { useEffect, useRef, useState } from "react";
import { API } from "../api";
import LaunchModal from "../components/LaunchModal";
import ChannelComposer from "../components/ChannelComposer";
import type { Channel, Message } from "../types";

type ChannelPanelProps = {
  token: string;
  channel: Channel;
  me: string | null;
  // ConVersus annoncés dans ce channel (nom complet du channel de débat).
  onDebatesSeen: (names: string[]) => void;
  onOpenDebate: (name: string) => void;
  onDebateLaunched: (debate: Channel) => void;
};

function formatTime(message: Message) {
  const raw = message.posted_at ?? message.creation_date;
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date().toDateString() === date.toDateString();
  return today ? `Aujourd'hui à ${time}` : `${date.toLocaleDateString("fr-FR")} à ${time}`;
}

function authorOf(message: Message) {
  return message.anonymous || !message.user ? "Anonyme" : message.user;
}

async function post(token: string, body: object) {
  return fetch(`${API}/channel/message?namespace=conversus`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function ChannelPanel({ token, channel, me, onDebatesSeen, onOpenDebate, onDebateLaunched }: ChannelPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const stickToBottom = useRef(true);
  const selectedMessages = messages.filter((message) => selectedIds.includes(message.id));
  const lastMessageId = messages.at(-1)?.id;
  const debatesSeen = useRef(onDebatesSeen);
  useEffect(() => {
    debatesSeen.current = onDebatesSeen;
  }, [onDebatesSeen]);

  useEffect(() => {
    let cancelled = false;
    async function loadMessages() {
      const response = await fetch(`${API}/channel/message?channel=${channel.id}&namespace=conversus`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        console.log("messages refusés", response.status);
        return;
      }
      const data: Message[] | null = await response.json();
      if (cancelled) return;
      const ordered = (data ?? []).toReversed();
      setMessages(ordered);
      const names = ordered.flatMap((message) => message.metadata?.conversus?.channelName ?? []);
      if (names.length > 0) debatesSeen.current(names);
    }

    loadMessages();
    const intervalId = setInterval(loadMessages, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [token, channel.id]);

  // On reste collé en bas sauf si l'utilisateur est remonté lire l'historique.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [lastMessageId]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  }

  async function handleSend(content: string) {
    const response = await post(token, { content, channel: channel.id, metadata: {} });
    if (!response.ok) {
      console.log("message refusé", response.status);
      return false;
    }
    const message: Message = await response.json();
    stickToBottom.current = true;
    setMessages((current) => [...current, message]);
    return true;
  }

  async function handleLaunch(subject: string) {
    const response = await fetch(`${API}/channel?namespace=conversus`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `${subject}#${Date.now()}`, metadata: {} }),
    });
    if (!response.ok) {
      console.log("débat refusé", response.status);
      return;
    }
    const debate: Channel = await response.json();
    await post(token, { content: subject, channel: debate.id, metadata: {} });
    for (const message of selectedMessages) {
      await post(token, { content: message.content, channel: debate.id, metadata: { author: message.user } });
    }
    await post(token, {
      content: `a ouvert un ConVersus : ${subject}`,
      channel: channel.id,
      metadata: { channelName: debate.name },
    });
    setIsLaunching(false);
    setIsSelecting(false);
    setSelectedIds([]);
    onDebateLaunched(debate);
  }

  function toggleMessage(messageId: number) {
    setSelectedIds((current) =>
      current.includes(messageId) ? current.filter((id) => id !== messageId) : [...current, messageId],
    );
  }

  return (
    <section className="channel-panel">
      <header className="panel-header">
        <h2 className="channel-title"># {channel.name}</h2>
        <button
          type="button"
          className="panel-action"
          onClick={() => {
            setIsSelecting(!isSelecting);
            setSelectedIds([]);
          }}
        >
          {isSelecting ? "Annuler" : "Lancer un ConVersus"}
        </button>
      </header>
      <ul className="messages" ref={listRef} onScroll={handleScroll}>
        {messages.map((message) => {
          const author = authorOf(message);
          const mine = !!me && !message.anonymous && message.user === me;
          const debateName = message.metadata?.conversus?.channelName;
          return (
            <li className="message" key={message.id}>
              {isSelecting && (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(message.id)}
                  onChange={() => toggleMessage(message.id)}
                  aria-label="Cibler ce message"
                />
              )}
              <span className="avatar">{author[0]}</span>
              <div className="message-body">
                <div className="message-meta">
                  <strong className={mine ? "mine" : undefined}>{author}</strong>
                  <time>{formatTime(message)}</time>
                </div>
                <p>{message.content}</p>
                {debateName && (
                  <button className="join-button" type="button" onClick={() => onOpenDebate(debateName)}>
                    Rejoindre
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {isSelecting && (
        <div className="selection-bar">
          <span>
            {selectedIds.length} {selectedIds.length > 1 ? "messages ciblés" : "message ciblé"}
          </span>
          <button type="button" disabled={selectedIds.length === 0} onClick={() => setIsLaunching(true)}>
            Lancer le ConVersus
          </button>
        </div>
      )}
      <ChannelComposer placeholder={`Écrire dans #${channel.name}`} onSend={handleSend} />
      {isLaunching && (
        <LaunchModal messages={selectedMessages} onCancel={() => setIsLaunching(false)} onLaunch={handleLaunch} />
      )}
    </section>
  );
}

export default ChannelPanel;
