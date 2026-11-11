import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Navbar, { type Channel } from "../components/Navbar";
import LaunchModal from "../components/LaunchModal";
import SendArrow from "../components/SendArrow";
import { SERVER_DOWN, formatTime, request } from "../api";

export type ReactionValue = "leaf" | "thorn" | "wilt";

export type Message = {
  id: number;
  content: string;
  user: string;
  user_id?: number;
  anonymous?: boolean;
  posted_at?: string;
  metadata?: {
    conversus?: {
      channelName?: string;
      author?: string;
      replyTo?: number;
      font?: string;
      effect?: ReactionValue;
      reactTo?: number;
      // Subject message of a debate: the channel it was opened from.
      origin?: number;
      // Synthesis shared in a channel: which debate, last message it covers, messages retained then.
      synthesisOf?: string;
      upTo?: number;
      retained?: number[];
      // Retenir: aims at a message, value true to retain it, false to take it back.
      retain?: number;
      value?: ReactionValue | boolean;
    };
  };
};

type ChatProps = { token: string; onTokenExpired: () => void; onSwitch: (newToken: string) => void };

const MESSAGES = "/channel/message?namespace=conversus";
const OPENED = "a ouvert un ConVersus : ";

function Chat({ token, onTokenExpired, onSwitch }: ChatProps) {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [username, setUsername] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  // error: an action failed; connectionError: the 2 s reload failed.
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
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
      const response = await request(token, "/me");
      if (response?.status === 401) {
        onTokenExpired();
        return;
      }
      if (!response?.ok) {
        setConnectionError(SERVER_DOWN);
        return;
      }
      const profile = await response.json();
      setChannels(profile.channels);
      setUsername(profile.username);
    }

    loadProfile();
  }, [token, onTokenExpired]);
  useEffect(() => {
    if (!channelId) return;

    async function loadMessages() {
      const response = await request(token, `/channel/message?channel=${channelId}&namespace=conversus`);
      if (response?.status === 401) {
        onTokenExpired();
        return;
      }
      if (!response?.ok) {
        setConnectionError(response ? "Les messages n'ont pas pu être chargés." : SERVER_DOWN);
        return;
      }
      setConnectionError("");
      const data: Message[] | null = await response.json();
      setMessages((data ?? []).toReversed());
    }

    loadMessages();
    const intervalId = setInterval(loadMessages, 2000);
    return () => clearInterval(intervalId);
  }, [token, channelId, onTokenExpired]);
  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [lastMessageId]);
  // Shared ending of every action: true when it worked, otherwise the error is shown.
  function checkResponse(response: Response | null, failure: string) {
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
  async function handleLaunch(subject: string) {
    const failure = "Le ConVersus n'a pas pu être lancé. Réessaie.";
    const response = await request(token, "/channel?namespace=conversus", {
      name: `${subject}#${Date.now()}`,
      metadata: {},
    });
    if (!checkResponse(response, failure)) {
      setIsLaunching(false);
      return;
    }
    const debate: Channel = await response!.json();
    await request(token, MESSAGES, { content: subject, channel: debate.id, metadata: { origin: Number(channelId) } });
    for (const message of selectedMessages) {
      await request(token, MESSAGES, {
        content: message.content,
        channel: debate.id,
        metadata: { author: message.user },
      });
    }
    await request(token, MESSAGES, {
      content: `a ouvert un ConVersus : ${subject}`,
      channel: Number(channelId),
      metadata: { channelName: debate.name },
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

    const response = await request(token, "/channel/enter", { channel: channelName });
    if (!checkResponse(response, "Impossible de rejoindre ce ConVersus. Réessaie.")) return;
    const debate: Channel = await response!.json();
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
    if (!channelId || sending) return;
    if (!content.trim()) return;

    setSending(true);
    const response = await request(token, MESSAGES, {
      content,
      channel: Number(channelId),
      metadata: {},
    });
    setSending(false);
    if (!checkResponse(response, "Message non envoyé. Réessaie.")) return;

    const message: Message = await response!.json();
    setMessages((current) => [...current, message]);
    setContent("");
  }

  const shownError = error || connectionError;

  return (
    <main className="chat">
      <Navbar channels={channels} username={username} onSwitch={onSwitch} onLogout={onTokenExpired} />
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
            {/* Left column: name and time, aligned on the right */}
            <strong className="message-author">
              {message.user}
              {message.posted_at && <time dateTime={message.posted_at}>{formatTime(message.posted_at)}</time>}
            </strong>
            <div className="message-body">
              {message.metadata?.conversus?.channelName ? (
                <>
                  <p>a ouvert un ConVersus</p>
                  <p className="message-subject">{message.content.replace(OPENED, "")}</p>
                  <button className="join-button" type="button" onClick={() => handleJoin(message)}>
                    Rejoindre
                  </button>
                </>
              ) : message.metadata?.conversus?.synthesisOf ? (
                <>
                  <p>a partagé la synthèse de</p>
                  <p className="message-subject">{message.metadata.conversus.synthesisOf.split("#")[0]}</p>
                  <p>{message.content}</p>
                </>
              ) : (
                <p>{message.content}</p>
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
      {shownError && <p className="login-error send-error" role="alert">{shownError}</p>}
      <form className="message-form" onSubmit={handleSendMessage}>
        <div className="send-line">
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Écris ton message..."
          />
          <button className="send-button" type="submit" disabled={sending} aria-label="Envoyer" data-tip="Envoyer">
            <SendArrow />
          </button>
        </div>
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
