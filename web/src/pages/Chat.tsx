import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import LaunchModal from "../components/LaunchModal";
import SendArrow from "../components/SendArrow";
import PanelMenu from "../components/PanelMenu";
import { PetalFlower } from "../components/PetalIcons";
import { shownName, workspacePath, type Channel } from "../channels";
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
      pronouns?: string;
      origin?: number;
      synthesisOf?: string;
      upTo?: number;
      retained?: number[];
      retain?: number;
      value?: ReactionValue | boolean;
    };
  };
};

type ChatProps = {
  token: string;
  channels: Channel[];
  onTokenExpired: () => void;
  onChannelsChanged: () => void;
  selecting: boolean;
  onSelectingChange: (selecting: boolean) => void;
};

const MESSAGES = "/channel/message?namespace=conversus";
const OPENED = "a ouvert un ConVersus : ";

function Chat({ token, channels, onTokenExpired, onChannelsChanged, selecting: isSelecting, onSelectingChange }: ChatProps) {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const messagesRef = useRef<HTMLUListElement>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const selectedMessages = messages.filter((message) =>
    selectedIds.includes(message.id),
  );
  const lastMessageId = messages.at(-1)?.id;
  const currentChannel = channels.find(
    (channel) => channel.id === Number(channelId),
  );
  useEffect(() => {
    setSelectedIds([]);
  }, [channelId, isSelecting]);
  useEffect(() => {
    if (!channelId) return;
    setMessages([]);

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
    setIsLaunching(false);
    onSelectingChange(false);
    onChannelsChanged();
    navigate(workspacePath(channelId, debate.id));
  }
  async function handleJoin(message: Message) {
    const channelName = message.metadata?.conversus?.channelName;
    if (!channelName) return;

    const joined = channels.find((channel) => channel.name === channelName);
    if (joined) {
      navigate(workspacePath(channelId, joined.id));
      return;
    }

    const response = await request(token, "/channel/enter", { channel: channelName });
    if (!checkResponse(response, "Impossible de rejoindre ce ConVersus. Réessaie.")) return;
    const debate: Channel = await response!.json();
    onChannelsChanged();
    navigate(workspacePath(channelId, debate.id));
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
    <section className="chat">
      <div className="col-head">
        {currentChannel && <PetalFlower className="petal-flower title-flower" />}
        <h2 className="channel-title">{currentChannel && shownName(currentChannel)}</h2>
        {channelId && (
          <PanelMenu items={[{ label: "Lancer un ConVersus", onClick: () => onSelectingChange(true), disabled: isSelecting }]} />
        )}
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
          <span className="selection-actions">
            <button type="button" className="reply-link" onClick={() => onSelectingChange(false)}>
              Annuler
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => setIsLaunching(true)}
            >
              Lancer le ConVersus
            </button>
          </span>
        </div>
      )}
      {shownError && <p className="login-error send-error" role="alert">{shownError}</p>}
      {channelId && (
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
      )}
      {isLaunching && (
        <LaunchModal
          messages={selectedMessages}
          onCancel={() => setIsLaunching(false)}
          onLaunch={handleLaunch}
        />
      )}
    </section>
  );
}

export default Chat;
