import { useEffect, useRef, useState } from "react";
import { SERVER_DOWN, request } from "../api";
import LaunchModal from "../components/LaunchModal";
import ChannelComposer from "../components/ChannelComposer";
import type { Message } from "./Chat";
import type { Channel } from "../channels";
import { pronounsByName } from "../pronouns";

type ChannelPanelProps = {
  token: string;
  channel: Channel;
  me: string | null;
  pronouns: string;
  onDebatesSeen?: (names: string[]) => void;
  onOpenDebate: (name: string) => void;
  onDebateLaunched: (debate: Channel) => void;
  onTokenExpired: () => void;
  selecting: boolean;
  onSelectingChange: (selecting: boolean) => void;
};

function formatTime(message: Message) {
  const raw = message.posted_at;
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
  return request(token, "/channel/message?namespace=conversus", body);
}

function ChannelPanel({ token, channel, me, pronouns, onDebatesSeen, onOpenDebate, onDebateLaunched, onTokenExpired, selecting, onSelectingChange }: ChannelPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const isSelecting = selecting;
  const setIsSelecting = onSelectingChange;
  const [isLaunching, setIsLaunching] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const tokenExpired = useRef(onTokenExpired);
  useEffect(() => {
    tokenExpired.current = onTokenExpired;
  }, [onTokenExpired]);
  const stickToBottom = useRef(true);
  const pronounsOf = pronounsByName(messages);
  const selectedMessages = messages.filter((message) => selectedIds.includes(message.id));
  const lastMessageId = messages.at(-1)?.id;
  const debatesSeen = useRef(onDebatesSeen);
  useEffect(() => {
    debatesSeen.current = onDebatesSeen;
  }, [onDebatesSeen]);

  useEffect(() => {
    let cancelled = false;
    async function loadMessages() {
      const response = await request(token, `/channel/message?channel=${channel.id}&namespace=conversus`);
      if (cancelled) return;
      if (response?.status === 401) {
        tokenExpired.current();
        return;
      }
      if (!response?.ok) {
        setConnectionError(response ? "Les messages n'ont pas pu être chargés." : SERVER_DOWN);
        return;
      }
      setConnectionError("");
      const data: Message[] | null = await response.json();
      if (cancelled) return;
      const ordered = (data ?? []).toReversed();
      setMessages(ordered);
      const names = ordered.flatMap((message) => message.metadata?.conversus?.channelName ?? []);
      if (names.length > 0) debatesSeen.current?.(names);
    }

    loadMessages();
    const intervalId = setInterval(loadMessages, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [token, channel.id]);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [lastMessageId]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  }

  function checkResponse(response: Response | null, failure: string): response is Response {
    if (response?.status === 401) {
      onTokenExpired();
      return false;
    }
    if (!response?.ok) {
      setError(response ? failure : SERVER_DOWN);
      return false;
    }
    setError("");
    return true;
  }

  async function handleSend(content: string) {
    const response = await post(token, { content, channel: channel.id, metadata: { pronouns } });
    if (!checkResponse(response, "Message non envoyé. Réessaie.")) return false;
    const message: Message = await response.json();
    stickToBottom.current = true;
    setMessages((current) => [...current, message]);
    return true;
  }

  async function handleLaunch(subject: string) {
    const response = await request(token, "/channel?namespace=conversus", {
      name: `${subject}#${Date.now()}`,
      metadata: {},
    });
    if (!checkResponse(response, "Le ConVersus n'a pas pu être lancé. Réessaie.")) {
      setIsLaunching(false);
      return;
    }
    const debate: Channel = await response.json();
    await post(token, { content: subject, channel: debate.id, metadata: { origin: channel.id, pronouns } });
    for (const message of selectedMessages) {
      await post(token, { content: message.content, channel: debate.id, metadata: { author: message.user } });
    }
    await post(token, {
      content: `a ouvert un ConVersus : ${subject}`,
      channel: channel.id,
      metadata: { channelName: debate.name, pronouns },
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
        <h2 className="channel-title">{channel.name}</h2>
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
                  {!message.anonymous && pronounsOf.get(message.user) && (
                    <span className="pronouns">· {pronounsOf.get(message.user)}</span>
                  )}
                  <time>{formatTime(message)}</time>
                </div>
                {message.metadata?.conversus?.synthesisOf ? (
                  <>
                    <p>a partagé la synthèse de</p>
                    <p className="message-subject">{message.metadata.conversus.synthesisOf.split("#")[0]}</p>
                    <p>{message.content}</p>
                  </>
                ) : (
                  <p>{message.content}</p>
                )}
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
      {(error || connectionError) && (
        <p className="login-error send-error" role="alert">{error || connectionError}</p>
      )}
      <ChannelComposer placeholder={`Écrire dans ${channel.name}`} onSend={handleSend} />
      {isLaunching && (
        <LaunchModal messages={selectedMessages} onCancel={() => setIsLaunching(false)} onLaunch={handleLaunch} />
      )}
    </section>
  );
}

export default ChannelPanel;
