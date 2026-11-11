import { API } from "../api";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CameraIcon from "../components/CameraIcon";
import Branches, { type Mark, type Stem } from "../components/Branches";
import ReactionIcon, { REACTIONS } from "../components/ReactionIcon";
import { debateLabel, type Channel, type Message, type ReactionValue } from "../types";
import { placeMessages, wiltSag, type Placement } from "../layout";
import { useCamera } from "../hooks/useCamera";
import MessageForm from "../components/MessageForm";
import { fontFamily } from "../fonts";
import { devinerStyle } from "../ia";

const ZOOM_STEP = 1.25;

type DebateProps = { token: string; debate: Channel; me: string | null };

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

// Mon message (pas les anonymes, ni les messages recopiés d'un autre auteur au lancement).
function isMine(message: Message, me: string | null) {
  if (!me || message.anonymous) return false;
  return (message.metadata?.conversus?.author ?? message.user) === me;
}

// Fil d'un message : ceux auxquels il répond (jusqu'à la racine) et toutes ses réponses, de proche en proche.
function threadOf(replies: Message[], id: number) {
  const parentOf = new Map(replies.map((message) => [message.id, message.metadata?.conversus?.replyTo]));
  const thread = new Set([id]);
  let parent = parentOf.get(id);
  while (parent !== undefined && parentOf.has(parent) && !thread.has(parent)) {
    thread.add(parent);
    parent = parentOf.get(parent);
  }
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const message of replies) {
      if (message.metadata?.conversus?.replyTo === current && !thread.has(message.id)) {
        thread.add(message.id);
        queue.push(message.id);
      }
    }
  }
  return thread;
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

function Debate({ token, debate, me }: DebateProps) {
  const channelId = debate.id;
  const [replies, setReplies] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const {
    camera,
    viewportRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleClickCapture,
    recenter,
    zoomBy,
  } = useCamera();
  const thread = useMemo(() => (hoveredId === null ? null : threadOf(replies, hoveredId)), [replies, hoveredId]);
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
    async function loadMessages() {
      const response = await fetch(
        `${API}/channel/message?channel=${channelId}&namespace=conversus`,
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

  async function handleSendMessage(content: string, font: string | undefined, anonymous: boolean, useAI: boolean) {
    const subject = debateLabel(debate.name);
    const effect = useAI ? await devinerStyle(subject, content, replyingTo?.content ?? null) : undefined;
    const metadata: { replyTo?: number; font?: string; effect?: ReactionValue } = {};
    if (replyingTo) metadata.replyTo = replyingTo.id;
    if (font) metadata.font = font;
    if (effect) metadata.effect = effect;

    const response = await fetch(
      `${API}/channel/message?namespace=conversus`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content,
          channel: channelId,
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

  return (
    <div className="debate">
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
        <Branches stems={stems} camera={camera} highlight={thread} />
        <div className="board" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <div className="central-flower" role="img" aria-label="Sujet du débat" />
          {replies.map((message, index) => (
            <div
              className={[
                "board-message",
                openId === message.id && "open",
                thread?.has(message.id) && "lit",
                thread && !thread.has(message.id) && "dimmed",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerEnter={() => setHoveredId(message.id)}
              onPointerLeave={() => setHoveredId((current) => (current === message.id ? null : current))}
              key={message.id}
              style={{ left: positions[index]?.x, top: positions[index]?.y, animationDelay: `${Math.min(index * 60, 900)}ms` }}
              ref={(element) => {
                if (element) messageRefs.current[index] = element;
              }}
              onClick={(event) => {
                event.stopPropagation();
                setOpenId(openId === message.id ? null : message.id);
              }}
            >
              <strong className={isMine(message, me) ? "mine" : undefined}>{displayName(message)}</strong>
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
                  <button type="button" onClick={() => setReplyingTo(message)}>Répondre</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div
          className="camera-controls"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" aria-label="Zoomer" title="Zoomer" onClick={() => zoomBy(ZOOM_STEP)}>
            <CameraIcon action="zoomIn" />
          </button>
          <button type="button" aria-label="Dézoomer" title="Dézoomer" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <CameraIcon action="zoomOut" />
          </button>
          <button type="button" aria-label="Recentrer" title="Recentrer" onClick={recenter}>
            <CameraIcon action="recenter" />
          </button>
        </div>
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
    </div>
  );
}

export default Debate;
