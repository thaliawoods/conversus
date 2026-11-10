import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import Navbar, { type Channel } from "../components/Navbar";
import Flower from "../components/Flower";
import type { Message } from "./Chat";
import { placeMessages, stemPath, type Placement } from "../layout";

type DebateProps = { token: string };

function findParents(replies: Message[]) {
  return replies.map((message) => {
    const index = replies.findIndex((other) => other.id === message.metadata?.conversus?.replyTo);
    return index === -1 ? null : index;
  });
}

function Debate({ token }: DebateProps) {
  const { channelId } = useParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [content, setContent] = useState("");
  const [replies, setReplies] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const debate = channels.find((channel) => channel.id === Number(channelId));
  const parents = findParents(replies);

  useEffect(() => {
    async function loadChannels() {
      const response = await fetch("http://localhost:4000/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const profile = await response.json();
      setChannels(profile.channels);
    }

    loadChannels();
  }, [token]);

  useEffect(() => {
    async function loadMessages() {
      const response = await fetch(
        `http://localhost:4000/channel/message?channel=${channelId}&namespace=conversus`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) return;
      const data = await response.json();
      setReplies((data ?? []).toReversed().slice(1));
    }

    loadMessages();
    const intervalId = setInterval(loadMessages, 2000);
    return () => clearInterval(intervalId);
  }, [token, channelId]);

  useLayoutEffect(() => {
    const sizes = messageRefs.current.slice(0, replies.length).map((element) => ({
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
    const parents = findParents(replies);
    const ids = replies.map((message) => message.id);
    setPositions(placeMessages(sizes, parents, ids));
  }, [replies]);

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          metadata: replyingTo ? { replyTo: replyingTo.id } : {},
        }),
      },
    );
    if (!response.ok) {
      console.log("message refusé", response.status);
      return;
    }
    setContent("");
    setReplyingTo(null);
  }

  return (
    <main className="chat debate">
      <Navbar channels={channels} />
      <h2 className="channel-title">{debate?.name.replace(/#\d+$/, "")}</h2>
      <div className="viewport" onClick={() => setOpenId(null)}>
        <div className="board">
          <svg className="stems">
            {replies.map((message, index) => {
              const parent = parents[index];
              return positions[index] && (
                <path
                  className="stem"
                  key={message.id}
                  d={stemPath(parent === null ? null : positions[parent], positions[index])}
                />
              );
            })}
          </svg>
          <Flower />
          {replies.map((message, index) => (
            <div
              className={openId === message.id ? "board-message open" : "board-message"}
              key={message.id}
              style={{ left: positions[index]?.x, top: positions[index]?.y }}
              ref={(element) => {
                if (element) messageRefs.current[index] = element;
              }}
              onClick={(event) => {
                event.stopPropagation();
                setOpenId(openId === message.id ? null : message.id);
              }}
            >
              <strong>{message.metadata?.conversus?.author ?? message.user}</strong>
              <p>{message.content}</p>
              {openId === message.id && (
                <div className="message-actions">
                  <button type="button" onClick={() => setReplyingTo(message)}>Répondre</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {replyingTo && (
        <div className="reply-banner">
          <p>
            Réponse à {replyingTo.metadata?.conversus?.author ?? replyingTo.user} : « {replyingTo.content} »
          </p>
          <button type="button" onClick={() => setReplyingTo(null)}>Annuler</button>
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
    </main>
  );
}

export default Debate;
