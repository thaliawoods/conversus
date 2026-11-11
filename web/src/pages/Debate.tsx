import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import Navbar, { type Channel } from "../components/Navbar";
import Flower from "../components/Flower";
import CentralFlower from "../components/CentralFlower";
import Branches, { type Mark, type Stem } from "../components/Branches";
import ReactionIcon, { REACTIONS } from "../components/ReactionIcon";
import AnonymousIcon from "../components/AnonymousIcon";
import type { Message, ReactionValue } from "./Chat";
import { placeMessages, wiltSag, type Placement } from "../layout";
import { useCamera } from "../hooks/useCamera";
import MessageForm from "../components/MessageForm";
import { fontFamily } from "../fonts";

type DebateProps = { token: string; onTokenExpired: () => void; onSwitch: (newToken: string) => void };

function findParents(replies: Message[]) {
  return replies.map((message) => {
    const index = replies.findIndex((other) => other.id === message.metadata?.conversus?.replyTo);
    return index === -1 ? null : index;
  });
}

function countWilts(reactions: Message[], message: Message) {
  const fromReactions = reactions.filter(
    (reaction) =>
      reaction.metadata?.conversus?.reactTo === message.id &&
      reaction.metadata?.conversus?.value === "wilt",
  ).length;
  const fromEffect = message.metadata?.conversus?.effect === "wilt" ? 1 : 0;
  return fromReactions + fromEffect;
}

function marksOf(reactions: Message[], message: Message) {
  return [
    message.metadata?.conversus?.effect,
    ...reactions
      .filter((reaction) => reaction.metadata?.conversus?.reactTo === message.id)
      .map((reaction) => reaction.metadata?.conversus?.value),
  ].filter((value): value is Mark => value === "leaf" || value === "thorn");
}

function displayName(message: Message) {
  const name = message.metadata?.conversus?.author ?? message.user;
  return message.anonymous || name === "anonymous" ? "Anonyme" : name;
}

function whoReacted(reactions: Message[], message: Message) {
  const own = reactions.filter((reaction) => reaction.metadata?.conversus?.reactTo === message.id);
  return REACTIONS.map((reaction) => {
    const names = own
      .filter((item) => item.metadata?.conversus?.value === reaction.value)
      .map(displayName);
    if (message.metadata?.conversus?.effect === reaction.value) names.unshift(displayName(message));
    return { ...reaction, names };
  }).filter((reaction) => reaction.names.length > 0);
}

function Debate({ token, onTokenExpired, onSwitch }: DebateProps) {
  const { channelId } = useParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [replies, setReplies] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [reactAnonymously, setReactAnonymously] = useState(false);
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
  const reactedBy = replies.map((message) => whoReacted(reactions, message));
  const stems = useMemo(() => {
    const parents = findParents(replies);
    return replies.flatMap((message, index): Stem[] => {
      const to = positions[index];
      if (!to) return [];
      const parent = parents[index];
      const from = parent === null ? null : positions[parent];
      const marks = marksOf(reactions, message);
      return [{ from, to, sag: wiltSag(countWilts(reactions, message)), id: message.id, marks }];
    });
  }, [replies, reactions, positions]);

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
    const sags = replies.map((message) => wiltSag(countWilts(reactions, message)));
    const marks = replies.map((message) => marksOf(reactions, message).length);
    setPositions(placeMessages(sizes, parents, ids, sags, marks));
  }, [replies, reactions]);

  async function handleSendMessage(
    content: string,
    font: string | undefined,
    effect: ReactionValue | undefined,
    anonymous: boolean,
  ) {
    const metadata: { replyTo?: number; font?: string; effect?: ReactionValue } = {};
    if (replyingTo) metadata.replyTo = replyingTo.id;
    if (font) metadata.font = font;
    if (effect) metadata.effect = effect;

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
          anonymous: reactAnonymously,
        }),
      },
    );
    if (!response.ok) console.log("réaction refusée", response.status);
  }

  return (
    <main className="chat debate">
      <Navbar channels={channels} onSwitch={onSwitch} onLogout={onTokenExpired} />
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
        <Branches stems={stems} camera={camera} />
        <div className="board" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <CentralFlower />
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
              {reactedBy[index].length > 0 && (
                <div className="who-reacted">
                  {reactedBy[index].map((reaction) => (
                    <div key={reaction.value}>
                      <ReactionIcon value={reaction.value} />
                      {reaction.label} : <span>{reaction.names.join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}
              {openId === message.id && (
                <div className="message-actions" onClick={(event) => event.stopPropagation()}>
                  {REACTIONS.map((reaction) => (
                    <button type="button" key={reaction.value} onClick={() => handleReact(message, reaction.value)}>
                      <ReactionIcon value={reaction.value} />
                      {reaction.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={reactAnonymously ? "on" : undefined}
                    title={reactAnonymously ? "Réaction anonyme" : "Réagir sans révéler mon identité"}
                    aria-label="Réaction anonyme"
                    aria-pressed={reactAnonymously}
                    onClick={() => setReactAnonymously(!reactAnonymously)}
                  >
                    <AnonymousIcon lit={reactAnonymously} />
                  </button>
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
