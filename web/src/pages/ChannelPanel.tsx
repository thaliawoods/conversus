import { useEffect, useRef, useState } from "react";
import { SERVER_DOWN, formatTime, request } from "../api";
import { FALLBACK_POLL, listenToChannel } from "../live";
import LaunchModal from "../components/LaunchModal";
import ChannelComposer from "../components/ChannelComposer";
import { PetalFlower } from "../components/PetalIcons";
import type { Message } from "./Chat";
import { channelLabel, isClockTick, isSynthesis, SHARED_CHANNEL, shownName, SYNTHESIS_CHANNEL, type Channel } from "../channels";
import { pronounsByName } from "../pronouns";

type ChannelPanelProps = {
  token: string;
  channel: Channel;
  me: string | null;
  pronouns: string;
  onDebatesSeen?: (names: string[]) => void;
  onOpenDebate: (name: string, synthesis?: { text: string; sharedAt: string }) => void;
  onDebateLaunched: (debate: Channel) => void;
  onTokenExpired: () => void;
  selecting: boolean;
  onSelectingChange: (selecting: boolean) => void;
};

// "partagée aujourd'hui à 15:40" or "partagée le 11/11/2026 à 22:02".
function sharedLabel(message: Message) {
  const when = formatTime(message.posted_at);
  if (!when) return "";
  return when.startsWith("Aujourd'hui") ? `partagée a${when.slice(1)}` : `partagée le ${when}`;
}

function authorOf(message: Message) {
  return message.anonymous || !message.user ? "Anonyme" : message.user;
}

// Tige en tourbillon : de la ligne citée (en haut à droite) jusqu'au haut de l'avatar.
const CURL = "M40 8 C 33 8, 28 2, 21 3 C 14 4, 11 10, 15 12 C 19 14, 23 8, 18 6 C 13 4, 15 13, 16 20";

async function post(token: string, body: object) {
  return request(token, "/channel/message?namespace=conversus", body);
}

function ChannelPanel({ token, channel, me, pronouns, onDebatesSeen, onOpenDebate, onDebateLaunched, onTokenExpired, selecting, onSelectingChange }: ChannelPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const readOnly = channel.name === SYNTHESIS_CHANNEL;
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
  const pronounsOf = pronounsByName(messages, me, pronouns);
  const selectedMessages = messages.filter((message) => selectedIds.includes(message.id));
  const lastMessageId = messages.at(-1)?.id;
  const [reply, setReply] = useState<{ channelId: number; message: Message } | null>(null);
  const replyingTo = reply?.channelId === channel.id ? reply.message : null;
  const messageById = new Map(messages.map((message) => [message.id, message]));
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
      // The synthesis channel only shows syntheses, even if something else was posted there.
      const onlySyntheses = channel.name === SYNTHESIS_CHANNEL;
      const ordered = (data ?? [])
        .filter((message) => !isClockTick(message) && (!onlySyntheses || isSynthesis(message)))
        .toReversed();
      setMessages(ordered);
      const names = ordered.flatMap((message) => message.metadata?.conversus?.channelName ?? []);
      if (names.length > 0 && channel.name !== SHARED_CHANNEL) debatesSeen.current?.(names);
    }

    loadMessages();
    const stopListening = listenToChannel(token, channel.id, loadMessages);
    const intervalId = setInterval(loadMessages, FALLBACK_POLL);
    return () => {
      cancelled = true;
      stopListening();
      clearInterval(intervalId);
    };
  }, [token, channel.id]);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [lastMessageId]);

  useEffect(() => {
    if (!replyingTo) return;
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setReply(null);
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [replyingTo]);

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
    const metadata = replyingTo ? { pronouns, replyTo: replyingTo.id } : { pronouns };
    const response = await post(token, { content, channel: channel.id, metadata });
    if (!checkResponse(response, "Message non envoyé. Réessaie.")) return false;
    const message: Message = await response.json();
    stickToBottom.current = true;
    setMessages((current) => [...current, message]);
    setReply(null);
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
        <h2 className="channel-title">{shownName(channel)}</h2>
        {!readOnly && (
          <button
            type="button"
            className="panel-action"
            onClick={() => {
              setIsSelecting(!isSelecting);
              setSelectedIds([]);
            }}
          >
            {isSelecting ? "Annuler" : (
              <>
                <PetalFlower className="petal-flower launch-flower" flat />
                <span className="launch-label">Lancer un ConVersus</span>
              </>
            )}
          </button>
        )}
      </header>
      <ul className="messages" ref={listRef} onScroll={handleScroll}>
        {messages.map((message) => {
          const author = authorOf(message);
          const mine = !!me && !message.anonymous && message.user === me;
          const debateName = message.metadata?.conversus?.channelName;
          const synthesisOf = message.metadata?.conversus?.synthesisOf;
          const joinTarget = debateName || synthesisOf;
          const replyId = message.metadata?.conversus?.replyTo;
          const quoted = replyId === undefined ? undefined : messageById.get(replyId);
          return (
            <li className={quoted ? "message has-quote" : "message"} key={message.id}>
              {quoted && (
                <>
                  <svg className="reply-curl" viewBox="0 0 42 20" aria-hidden>
                    <path className="reply-curl-glow" d={CURL} />
                    <path className="reply-curl-core" d={CURL} />
                  </svg>
                  <p className="reply-quote">
                    <span className="reply-quote-name">{authorOf(quoted)}</span> {quoted.content}
                  </p>
                </>
              )}
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
                  <time>{formatTime(message.posted_at)}</time>
                </div>
                {synthesisOf ? (
                  <button type="button" className="synthesis-card" onClick={() => onOpenDebate(synthesisOf, { text: message.content, sharedAt: sharedLabel(message) })}>
                    <span>a partagé la synthèse de</span>
                    <span className="message-subject">
                      {channelLabel(synthesisOf)}
                    </span>
                    <span className="synthesis-excerpt">{message.content}</span>
                  </button>
                ) : debateName ? (
                  <button type="button" className="synthesis-card" onClick={() => onOpenDebate(debateName)}>
                    <span>a ouvert un ConVersus</span>
                    <span className="message-subject">
                      {channelLabel(debateName)}
                    </span>
                  </button>
                ) : (
                  <p className="message-text">
                    {message.content}
                    {!isSelecting && (
                      <>
                        <button type="button" className="reply-link" onClick={() => setReply({ channelId: channel.id, message })}>
                          Répondre
                        </button>
                      </>
                    )}
                  </p>
                )}
                {joinTarget && (
                  <button className="join-button" type="button" onClick={() => onOpenDebate(joinTarget)}>
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
      {replyingTo && (
        <div className="reply-banner">
          <p>
            Réponse à {authorOf(replyingTo)} : « {replyingTo.content} »
          </p>
          <button type="button" onClick={() => setReply(null)}>Annuler</button>
        </div>
      )}
      {!readOnly && (
        <ChannelComposer
          placeholder={replyingTo ? `Réponds à ${authorOf(replyingTo)}…` : `Écrire dans ${shownName(channel)}`}
          onSend={handleSend}
        />
      )}
      {isLaunching && (
        <LaunchModal messages={selectedMessages} onCancel={() => setIsLaunching(false)} onLaunch={handleLaunch} />
      )}
    </section>
  );
}

export default ChannelPanel;
