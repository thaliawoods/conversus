import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams } from "react-router";
import Navbar, { type Channel } from "../components/Navbar";
import CameraIcon from "../components/CameraIcon";
import Branches, { type Arrival, type Mark, type Stem } from "../components/Branches";
import Rain, { type Shower } from "../components/Rain";
import Leaves from "../components/Leaves";
import ReactionIcon, { REACTIONS } from "../components/ReactionIcon";
import AnonymousIcon from "../components/AnonymousIcon";
import type { Message, ReactionValue } from "./Chat";
import { placeMessages, wiltSag, type Placement } from "../layout";
import { useCamera } from "../hooks/useCamera";
import { useGlide, type Spot } from "../hooks/useGlide";
import useSprouts from "../hooks/useSprouts";
import MessageForm from "../components/MessageForm";
import { fontFamily } from "../fonts";
import { SERVER_DOWN, formatTime, request } from "../api";

const ZOOM_STEP = 1.25;
const MESSAGES = "/channel/message?namespace=conversus";

// Bubble on a greyed reaction button.
const ALREADY_GIVEN: Record<ReactionValue, string> = {
  leaf: "Tu as déjà donné une Feuille",
  thorn: "Tu as déjà donné une Épine",
  wilt: "Tu as déjà fané ce message",
};

// One reaction of each kind per person and per message: an effect on my own message counts too.
function hasReacted(reactions: Message[], message: Message, value: ReactionValue, myId: number | null) {
  if (myId === null) return false;
  if (message.user_id === myId && message.metadata?.conversus?.effect === value) return true;
  return reactions.some(
    (reaction) =>
      reaction.user_id === myId &&
      reaction.metadata?.conversus?.reactTo === message.id &&
      reaction.metadata?.conversus?.value === value,
  );
}

type DebateProps = { token: string; onTokenExpired: () => void; onSwitch: (newToken: string) => void };

function findParents(replies: Message[]) {
  return replies.map((message) => {
    const index = replies.findIndex((other) => other.id === message.metadata?.conversus?.replyTo);
    return index === -1 ? null : index;
  });
}

// Thread of a message (from Kilian): the ones it answers, up to the flower, and all its answers.
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

// Every reaction of one kind in the debate: a reaction aims at reactTo, an effect at its own message.
function arrivalsOf(messages: Message[], value: ReactionValue): Arrival[] {
  return messages.flatMap((message) => {
    const conversus = message.metadata?.conversus;
    if (conversus?.value === value && conversus.reactTo !== undefined) {
      return [{ key: message.id, target: conversus.reactTo }];
    }
    if (conversus?.effect === value) return [{ key: message.id, target: message.id }];
    return [];
  });
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
  const [username, setUsername] = useState("");
  const [myId, setMyId] = useState<number | null>(null);
  // error: an action failed; connectionError: the 2 s reload failed.
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  // Reactions on their way to the server, as "messageId-value".
  const [pendingReactions, setPendingReactions] = useState<string[]>([]);
  const [replies, setReplies] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [reactAnonymously, setReactAnonymously] = useState(false);
  const [showers, setShowers] = useState<Shower[]>([]);
  const [thornArrival, setThornArrival] = useState<Arrival | null>(null);
  const [leafArrival, setLeafArrival] = useState<Arrival | null>(null);
  const seenReactions = useRef<Set<number> | null>(null);
  const ownWilts = useRef<number[]>([]);
  const ownLeaves = useRef<number[]>([]);
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
  const debate = channels.find((channel) => channel.id === Number(channelId));
  const reactedBy = replies.map((message) => whoReacted(reactions, message));
  // Where each message should be, then where it is shown while it slides there.
  const targets = useMemo(
    () =>
      new Map(
        replies.flatMap((message, index): [number, Spot][] =>
          positions[index] ? [[message.id, { ...positions[index], sag: wiltSag(countWilts(reactions, message)) }]] : [],
        ),
      ),
    [replies, reactions, positions],
  );
  const shown = useGlide(targets);
  const { sprouts, appear } = useSprouts(replies);
  const stems = useMemo(() => {
    const parents = findParents(replies);
    return replies.flatMap((message, index): Stem[] => {
      const to = shown.get(message.id);
      if (!to) return [];
      const parent = parents[index];
      const from = parent === null ? null : (shown.get(replies[parent].id) ?? null);
      const marks = marksOf(reactions, message);
      return [{ from, to, sag: to.sag, id: message.id, marks }];
    });
  }, [replies, reactions, shown]);
  const thread = useMemo(() => (hoveredId === null ? null : threadOf(replies, hoveredId)), [replies, hoveredId]);
  // Screen position of the message an Épine or a Feuille aims at, where its veil is strongest.
  function veilAt(arrival: Arrival) {
    const target = shown.get(arrival.target);
    return target && ({
      "--x": `calc(50% + ${camera.x + target.x * camera.zoom}px)`,
      "--y": `calc(50% + ${camera.y + target.y * camera.zoom}px)`,
    } as CSSProperties);
  }

  useEffect(() => {
    async function loadChannels() {
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
      setMyId(profile.id);
    }

    loadChannels();
  }, [token, onTokenExpired]);

  useEffect(() => {
    async function loadMessages() {
      const response = await request(token, `/channel/message?channel=${channelId}&namespace=conversus`);
      if (response?.status === 401) {
        onTokenExpired();
        return;
      }
      if (!response?.ok) {
        setConnectionError(response ? "Le débat n'a pas pu être chargé." : SERVER_DOWN);
        return;
      }
      setConnectionError("");
      const data = await response.json();
      const messages: Message[] = (data ?? []).toReversed().slice(1);
      setReplies(messages.filter((message) => message.metadata?.conversus?.reactTo === undefined));
      setReactions(messages.filter((message) => message.metadata?.conversus?.reactTo !== undefined));

      const wilts = arrivalsOf(messages, "wilt");
      const thorns = arrivalsOf(messages, "thorn");
      const leaves = arrivalsOf(messages, "leaf");
      if (seenReactions.current === null) {
        seenReactions.current = new Set([...wilts, ...thorns, ...leaves].map((arrival) => arrival.key));
        return;
      }
      const seen = seenReactions.current;
      const freshWilts = wilts.filter((wilt) => !seen.has(wilt.key));
      const freshThorns = thorns.filter((thorn) => !seen.has(thorn.key));
      const freshLeaves = leaves.filter((leaf) => !seen.has(leaf.key));
      [...freshWilts, ...freshThorns, ...freshLeaves].forEach((arrival) => seen.add(arrival.key));
      // One Épine and one Feuille at a time: the latest one wins.
      if (freshThorns.length > 0) setThornArrival(freshThorns[freshThorns.length - 1]);
      // My own leaves already flew at the click: don't play them twice.
      const leavesToPlay = freshLeaves.filter((leaf) => {
        const index = ownLeaves.current.indexOf(leaf.target);
        if (index === -1) return true;
        ownLeaves.current.splice(index, 1);
        return false;
      });
      if (leavesToPlay.length > 0) setLeafArrival(leavesToPlay[leavesToPlay.length - 1]);
      // My own wilts already rained at the click: don't play them twice.
      const toPlay = freshWilts.filter((wilt) => {
        const index = ownWilts.current.indexOf(wilt.target);
        if (index === -1) return true;
        ownWilts.current.splice(index, 1);
        return false;
      });
      if (toPlay.length > 0) setShowers(toPlay);
    }

    seenReactions.current = null;
    loadMessages();
    const intervalId = setInterval(loadMessages, 2000);
    return () => clearInterval(intervalId);
  }, [token, channelId, onTokenExpired]);

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

    const response = await request(token, MESSAGES, {
      content,
      channel: Number(channelId),
      metadata,
      anonymous,
    });
    if (!checkResponse(response, "Message non envoyé. Réessaie.")) return false;
    setReplyingTo(null);
    return true;
  }

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

  function handleReply(message: Message) {
    setReplyingTo(message);
    document.querySelector<HTMLInputElement>(".message-form input")?.focus();
  }

  async function handleReact(message: Message, value: ReactionValue) {
    const key = `${message.id}-${value}`;
    if (pendingReactions.includes(key) || hasReacted(reactions, message, value, myId)) return;
    setPendingReactions((current) => [...current, key]);
    // Close the buttons so they don't hide the effect on the branch.
    setOpenId(null);
    if (value === "wilt") {
      ownWilts.current.push(message.id);
      setShowers([{ key: -Date.now(), target: message.id }]);
    }
    if (value === "leaf") {
      ownLeaves.current.push(message.id);
      setLeafArrival({ key: -Date.now(), target: message.id });
    }
    const response = await request(token, MESSAGES, {
      content: "",
      channel: Number(channelId),
      metadata: { reactTo: message.id, value },
      anonymous: reactAnonymously,
    });
    if (checkResponse(response, "Réaction non envoyée. Réessaie.")) {
      // Shown right away, so the button stays greyed until the next reload confirms it.
      const created: Message = await response!.json();
      setReactions((current) => [...current, created]);
    } else {
      const own = value === "leaf" ? ownLeaves.current : ownWilts.current;
      const index = own.indexOf(message.id);
      if ((value === "wilt" || value === "leaf") && index !== -1) own.splice(index, 1);
    }
    setPendingReactions((current) => current.filter((item) => item !== key));
  }

  return (
    <main className="chat debate">
      <Navbar channels={channels} username={username} onSwitch={onSwitch} onLogout={onTokenExpired} />
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
        {thornArrival && <div className="thorn-veil" key={thornArrival.key} style={veilAt(thornArrival)} aria-hidden />}
        {leafArrival && <div className="leaf-veil" key={leafArrival.key} style={veilAt(leafArrival)} aria-hidden />}
        <Rain showers={showers} stems={stems} camera={camera} />
        <Branches stems={stems} camera={camera} thornArrival={thornArrival} leafArrival={leafArrival} sprouts={sprouts} highlight={thread} />
        <Leaves arrival={leafArrival} stems={stems} camera={camera} />
        <div className="board" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <div className="central-flower" role="img" aria-label="Sujet du débat" />
          {replies.map((message, index) => (
            <div
              className={openId === message.id ? "board-message open" : "board-message"}
              key={message.id}
              style={{ left: shown.get(message.id)?.x, top: shown.get(message.id)?.y, ...appear(message.id) }}
              ref={(element) => {
                if (element) messageRefs.current[index] = element;
              }}
              tabIndex={0}
              onPointerEnter={() => setHoveredId(message.id)}
              onPointerLeave={() => setHoveredId((current) => (current === message.id ? null : current))}
              onFocus={() => setHoveredId(message.id)}
              onBlur={() => setHoveredId((current) => (current === message.id ? null : current))}
              onClick={(event) => {
                event.stopPropagation();
                setOpenId(openId === message.id ? null : message.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpenId(null);
                // Only the message itself, not the buttons inside it.
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenId(openId === message.id ? null : message.id);
                }
              }}
            >
              <strong>
                {displayName(message)}
                {openId === message.id && message.posted_at && (
                  <time className="message-time" dateTime={message.posted_at}>{formatTime(message.posted_at)}</time>
                )}
              </strong>
              <p
                data-font={message.metadata?.conversus?.font}
                style={{ fontFamily: fontFamily(message.metadata?.conversus?.font) }}
              >
                {message.content}
              </p>
              {reactedBy[index].length > 0 && (
                <div className="who-reacted">
                  {reactedBy[index].map((reaction) => (
                    <div key={reaction.value}>
                      <ReactionIcon value={reaction.value} label={reaction.label} />
                      <span>{reaction.names.join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}
              {openId === message.id && (
                <div className="message-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => handleReply(message)}>Répondre</button>
                  {REACTIONS.map((reaction) => (
                    <button
                      type="button"
                      key={reaction.value}
                      disabled={
                        pendingReactions.includes(`${message.id}-${reaction.value}`) ||
                        hasReacted(reactions, message, reaction.value, myId)
                      }
                      data-tip={hasReacted(reactions, message, reaction.value, myId) ? ALREADY_GIVEN[reaction.value] : reaction.label}
                      aria-label={reaction.label}
                      onClick={() => handleReact(message, reaction.value)}
                    >
                      <ReactionIcon value={reaction.value} />
                    </button>
                  ))}
                  <button
                    type="button"
                    className={reactAnonymously ? "on" : undefined}
                    data-tip="Anonyme"
                    aria-label="Anonyme"
                    aria-pressed={reactAnonymously}
                    onClick={() => setReactAnonymously(!reactAnonymously)}
                  >
                    <AnonymousIcon lit={reactAnonymously} />
                  </button>
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
          <button type="button" aria-label="Zoomer" data-tip="Zoomer" onClick={() => zoomBy(ZOOM_STEP)}>
            <CameraIcon action="zoomIn" />
          </button>
          <button type="button" aria-label="Dézoomer" data-tip="Dézoomer" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <CameraIcon action="zoomOut" />
          </button>
          <button type="button" aria-label="Recentrer" data-tip="Recentrer" onClick={recenter}>
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
      <MessageForm
        onSend={handleSendMessage}
        placeholder={replyingTo ? `Réponds à ${displayName(replyingTo)}…` : "Réponds au sujet…"}
        error={error || connectionError}
      />
    </main>
  );
}

export default Debate;
