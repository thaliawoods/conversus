import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import Navbar, { type Channel } from "../components/Navbar";
import Flower from "../components/Flower";
import ReactionIcon, { ReactionShape } from "../components/ReactionIcon";
import type { Message, ReactionValue } from "./Chat";
import { placeMessages, pointOnStem, stemPath, wiltSag, type Placement } from "../layout";
import { useCamera } from "../hooks/useCamera";
import MessageForm from "../components/MessageForm";
import { fontFamily } from "../fonts";

type DebateProps = { token: string };

const REACTIONS: { value: ReactionValue; label: string }[] = [
  { value: "leaf", label: "Feuille" },
  { value: "thorn", label: "Épine" },
  { value: "wilt", label: "Faner" },
];

function findParents(replies: Message[]) {
  return replies.map((message) => {
    const index = replies.findIndex((other) => other.id === message.metadata?.conversus?.replyTo);
    return index === -1 ? null : index;
  });
}

function countWilts(reactions: Message[], messageId: number) {
  return reactions.filter(
    (reaction) =>
      reaction.metadata?.conversus?.reactTo === messageId &&
      reaction.metadata?.conversus?.value === "wilt",
  ).length;
}

function displayName(message: Message) {
  const name = message.metadata?.conversus?.author ?? message.user;
  return message.anonymous || name === "anonymous" ? "Anonyme" : name;
}

function Debate({ token }: DebateProps) {
  const { channelId } = useParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [replies, setReplies] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const {
    camera,
    viewportRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleClickCapture,
    recenter,
  } = useCamera();
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
      const messages: Message[] = (data ?? []).toReversed().slice(1);
      setReplies(messages.filter((message) => message.metadata?.conversus?.reactTo === undefined));
      setReactions(messages.filter((message) => message.metadata?.conversus?.reactTo !== undefined));
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
    const sags = replies.map((message) => wiltSag(countWilts(reactions, message.id)));
    setPositions(placeMessages(sizes, parents, ids, sags));
  }, [replies, reactions]);

  async function handleSendMessage(content: string, font: string | undefined, anonymous: boolean) {
    const metadata: { replyTo?: number; font?: string } = {};
    if (replyingTo) metadata.replyTo = replyingTo.id;
    if (font) metadata.font = font;

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
          metadata,
          anonymous,
        }),
      },
    );
    if (!response.ok) {
      console.log("message refusé", response.status);
      return false;
    }
    setReplyingTo(null);
    return true;
  }

  async function handleReact(message: Message, value: ReactionValue) {
    const response = await fetch(
      "http://localhost:4000/channel/message?namespace=conversus",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: "",
          channel: Number(channelId),
          metadata: { reactTo: message.id, value },
        }),
      },
    );
    if (!response.ok) console.log("réaction refusée", response.status);
  }

  return (
    <main className="chat debate">
      <Navbar channels={channels} />
      <h2 className="channel-title">{debate?.name.replace(/#\d+$/, "")}</h2>
      <div
        className="viewport"
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        onClick={() => setOpenId(null)}
      >
        <div className="board" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <svg className="stems">
            {replies.map((message, index) => {
              const parent = parents[index];
              const to = positions[index];
              if (!to) return null;
              const from = parent === null ? null : positions[parent];
              const own = reactions.filter((reaction) => reaction.metadata?.conversus?.reactTo === message.id);
              const sag = wiltSag(countWilts(reactions, message.id));
              const drawn = own.filter((reaction) => {
                const value = reaction.metadata?.conversus?.value;
                return value === "leaf" || value === "thorn";
              });
              return (
                <g key={message.id}>
                  <path className="stem" d={stemPath(from, to, sag)} />
                  {drawn.map((reaction, k) => {
                    const value = reaction.metadata?.conversus?.value;
                    if (!value) return null;
                    const point = pointOnStem(from, to, (k + 1) / (drawn.length + 1), sag);
                    const side = k % 2 === 0 ? 1.5 : -1.5;
                    return (
                      <g
                        key={reaction.id}
                        transform={`translate(${point.x} ${point.y}) rotate(${point.angle}) scale(1.5 ${side})`}
                      >
                        <ReactionShape value={value} onStem />
                      </g>
                    );
                  })}
                </g>
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
              <strong>{displayName(message)}</strong>
              <p style={{ fontFamily: fontFamily(message.metadata?.conversus?.font) }}>{message.content}</p>
              {openId === message.id && (
                <div className="message-actions">
                  {REACTIONS.map((reaction) => (
                    <button type="button" key={reaction.value} onClick={() => handleReact(message, reaction.value)}>
                      <ReactionIcon value={reaction.value} />
                      {reaction.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setReplyingTo(message)}>Répondre</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="recenter"
          aria-label="Recentrer"
          title="Recentrer"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            recenter();
          }}
        >
          <Flower className="recenter-icon" />
        </button>
      </div>
      {replyingTo && (
        <div className="reply-banner">
          <p>
            Réponse à {displayName(replyingTo)} : « {replyingTo.content} »
          </p>
          <button type="button" onClick={() => setReplyingTo(null)}>Annuler</button>
        </div>
      )}
      <MessageForm onSend={handleSendMessage} />
    </main>
  );
}

export default Debate;
