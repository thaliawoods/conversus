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
import MessageForm from "../components/MessageForm";
import { fontFamily } from "../fonts";

const ZOOM_STEP = 1.25;

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
  const [replies, setReplies] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
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
    if (value === "wilt") {
      ownWilts.current.push(message.id);
      setShowers([{ key: -Date.now(), target: message.id }]);
    }
    if (value === "leaf") {
      ownLeaves.current.push(message.id);
      setLeafArrival({ key: -Date.now(), target: message.id });
    }
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
    if (!response.ok) {
      console.log("réaction refusée", response.status);
      const own = value === "leaf" ? ownLeaves.current : ownWilts.current;
      const index = own.indexOf(message.id);
      if ((value === "wilt" || value === "leaf") && index !== -1) own.splice(index, 1);
    }
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
        {thornArrival && <div className="thorn-veil" key={thornArrival.key} style={veilAt(thornArrival)} aria-hidden />}
        {leafArrival && <div className="leaf-veil" key={leafArrival.key} style={veilAt(leafArrival)} aria-hidden />}
        <Rain showers={showers} stems={stems} camera={camera} />
        <Branches stems={stems} camera={camera} thornArrival={thornArrival} leafArrival={leafArrival} />
        <Leaves arrival={leafArrival} stems={stems} camera={camera} />
        <div className="board" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <div className="central-flower" role="img" aria-label="Sujet du débat" />
          {replies.map((message, index) => (
            <div
              className={openId === message.id ? "board-message open" : "board-message"}
              key={message.id}
              style={{ left: shown.get(message.id)?.x, top: shown.get(message.id)?.y }}
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
    </main>
  );
}

export default Debate;
