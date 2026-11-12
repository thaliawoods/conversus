import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { HIDDEN_CHANNELS, isDebate, shownName, workspacePath, type Channel } from "../channels";
import DebatePicker from "../components/DebatePicker";
import SynthesisModal from "../components/SynthesisModal";
import SynthesisIcon from "../components/SynthesisIcon";
import CameraIcon from "../components/CameraIcon";
import Branches, { type Arrival, type Color, type Mark, type Stem } from "../components/Branches";
import Rain, { type Shower } from "../components/Rain";
import Leaves from "../components/Leaves";
import ReactionIcon, { REACTIONS } from "../components/ReactionIcon";
import type { Message, ReactionValue } from "./Chat";
import { placeMessages, wiltSag, type Placement, type Size } from "../layout";
import { useCamera } from "../hooks/useCamera";
import { useGlide, type Spot } from "../hooks/useGlide";
import useSprouts from "../hooks/useSprouts";
import MessageForm from "../components/MessageForm";
import { fontFamily, shownFont } from "../fonts";
import { SERVER_DOWN, formatTime, request } from "../api";
import { FALLBACK_POLL, listenToChannel } from "../live";
import { pronounsByName } from "../pronouns";

const ZOOM_STEP = 1.25;
const MESSAGES = "/channel/message?namespace=conversus";
const MAX_PREVIEW = 120;

type Synthesis = { text: string | null; error: string; upTo: number; retained: number[] };

type DebateProps = {
  token: string;
  channels: Channel[];
  me: string | null;
  pronouns: string;
  onTokenExpired: () => void;
};

function findParents(replies: Message[]) {
  return replies.map((message) => {
    const index = replies.findIndex((other) => other.id === message.metadata?.conversus?.replyTo);
    return index === -1 ? null : index;
  });
}

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

// Son des feuilles (freesound « crunching leaves »), joué quand on réagit Content.
const LEAF_SOUND = new Audio("/sounds/feuilles.mp3");
// Pluie (dragon-studio « calming rain ») : 2 s du milieu, fondus calés sur Rain.tsx.
const RAIN_SOUND = new Audio("/sounds/pluie.mp3");
// Orage (evanaeva « thunderstorm ») : de 2 à 4 s, joué quand on réagit En colère.
const THUNDER_SOUND = new Audio("/sounds/orage.mp3");

const MOOD_FONTS: Record<ReactionValue, string> = { thorn: "LoveAndRage", wilt: "Nudles", leaf: "LigaSans" };

function moodFont(reactions: Message[], message: Message) {
  const winner = majorityReaction(reactions, message);
  return winner ? MOOD_FONTS[winner] : shownFont(message.metadata?.conversus?.font);
}

const MOOD_COLORS: Record<ReactionValue, Color> = {
  leaf: [0.878, 0.31, 0.604],
  thorn: [1.0, 0.353, 0.212],
  wilt: [0.608, 0.42, 1.0],
};

function majorityReaction(reactions: Message[], message: Message) {
  const counts: Record<ReactionValue, number> = { leaf: 0, thorn: 0, wilt: 0 };
  for (const reaction of reactions) {
    const { reactTo, value } = reaction.metadata?.conversus ?? {};
    if (reactTo === message.id && (value === "leaf" || value === "thorn" || value === "wilt")) counts[value] += 1;
  }
  const best = Math.max(counts.leaf, counts.thorn, counts.wilt);
  const winners = (Object.keys(counts) as ReactionValue[]).filter((value) => counts[value] === best);
  return best > 0 && winners.length === 1 ? winners[0] : null;
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

const MAX_MARKS = 8;

function marksOf(reactions: Message[], message: Message) {
  return [
    message.metadata?.conversus?.effect,
    ...reactions
      .filter((reaction) => reaction.metadata?.conversus?.reactTo === message.id)
      .map((reaction) => reaction.metadata?.conversus?.value),
  ]
    .filter((value): value is Mark => value === "leaf" || value === "thorn")
    .slice(-MAX_MARKS);
}

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

function preview(text: string) {
  if (text.length <= MAX_PREVIEW) return text;
  const cut = text.slice(0, MAX_PREVIEW);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

function textSize(element: HTMLDivElement): Size {
  const box = element.getBoundingClientRect();
  const scale = element.offsetWidth / box.width || 1;
  const range = document.createRange();
  let right = 0;
  let bottom = 0;
  for (const part of element.querySelectorAll("strong, p")) {
    range.selectNodeContents(part);
    const rect = range.getBoundingClientRect();
    right = Math.max(right, rect.right - box.left);
    bottom = Math.max(bottom, rect.bottom - box.top);
  }
  return { width: right * scale, height: bottom * scale };
}

function Debate({ token, channels, me, pronouns, onTokenExpired }: DebateProps) {
  const { debateId: channelId, channelId: openChannelId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sharedSynthesis: { text: string; sharedAt: string } | undefined = location.state?.synthesis;
  const sectionRef = useRef<HTMLElement>(null);
  const [subject, setSubject] = useState<Message | null>(null);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [pendingReactions, setPendingReactions] = useState<string[]>([]);
  const [replies, setReplies] = useState<Message[]>([]);
  const pronounsOf = useMemo(() => pronounsByName(replies, me, pronouns), [replies, me, pronouns]);
  const [reactions, setReactions] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const [textSizes, setTextSizes] = useState<Size[]>([]);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
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
      const text = textSizes[index] ?? to;
      return [{ from, to, sag: to.sag, id: message.id, marks, text }];
    });
  }, [replies, reactions, shown, textSizes]);
  const moods = useMemo(
    () =>
      new Map(
        replies.flatMap((message): [number, Color][] => {
          const winner = majorityReaction(reactions, message);
          return winner ? [[message.id, MOOD_COLORS[winner]]] : [];
        }),
      ),
    [replies, reactions],
  );
  const thread = useMemo(() => (hoveredId === null ? null : threadOf(replies, hoveredId)), [replies, hoveredId]);
  function veilAt(arrival: Arrival) {
    const target = shown.get(arrival.target);
    return target && ({
      "--x": `calc(50% + ${camera.x + target.x * camera.zoom}px)`,
      "--y": `calc(50% + ${camera.y + target.y * camera.zoom}px)`,
    } as CSSProperties);
  }

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
      const all: Message[] = (data ?? []).toReversed();
      setSubject(all[0] ?? null);
      const messages = all.slice(1);
      setReplies(
        messages.filter(
          (message) =>
            message.metadata?.conversus?.reactTo === undefined && message.metadata?.conversus?.retain === undefined,
        ),
      );
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
      if (freshThorns.length > 0) setThornArrival(freshThorns[freshThorns.length - 1]);
      const leavesToPlay = freshLeaves.filter((leaf) => {
        const index = ownLeaves.current.indexOf(leaf.target);
        if (index === -1) return true;
        ownLeaves.current.splice(index, 1);
        return false;
      });
      if (leavesToPlay.length > 0) setLeafArrival(leavesToPlay[leavesToPlay.length - 1]);
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
    const stopListening = listenToChannel(token, channelId, loadMessages);
    const intervalId = setInterval(loadMessages, FALLBACK_POLL);
    return () => {
      stopListening();
      clearInterval(intervalId);
    };
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
    setTextSizes(messageRefs.current.slice(0, replies.length).map(textSize));
  }, [replies, reactions]);

  async function handleSendMessage(
    content: string,
    font: string | undefined,
    effect: ReactionValue | undefined,
    anonymous: boolean,
  ) {
    const metadata: { replyTo?: number; font?: string; effect?: ReactionValue; pronouns?: string } = {};
    if (!anonymous) metadata.pronouns = pronouns;
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
    sectionRef.current?.querySelector<HTMLInputElement>(".message-form input")?.focus();
  }

  async function handleReact(message: Message, value: ReactionValue) {
    const key = `${message.id}-${value}`;
    if (pendingReactions.includes(key)) return;
    setPendingReactions((current) => [...current, key]);
    setOpenId(null);
    if (value === "thorn") {
      THUNDER_SOUND.currentTime = 0;
      THUNDER_SOUND.play().catch(() => {});
    }
    if (value === "wilt") {
      ownWilts.current.push(message.id);
      setShowers([{ key: -Date.now(), target: message.id }]);
      RAIN_SOUND.currentTime = 0;
      RAIN_SOUND.play().catch(() => {});
    }
    if (value === "leaf") {
      ownLeaves.current.push(message.id);
      setLeafArrival({ key: -Date.now(), target: message.id });
      LEAF_SOUND.currentTime = 0;
      LEAF_SOUND.play().catch(() => {});
    }
    const response = await request(token, MESSAGES, {
      content: "",
      channel: Number(channelId),
      metadata: { reactTo: message.id, value },
      anonymous: false,
    });
    if (checkResponse(response, "Réaction non envoyée. Réessaie.")) {
      const created: Message = await response!.json();
      setReactions((current) => [...current, created]);
    } else {
      const own = value === "leaf" ? ownLeaves.current : ownWilts.current;
      const index = own.indexOf(message.id);
      if ((value === "wilt" || value === "leaf") && index !== -1) own.splice(index, 1);
    }
    setPendingReactions((current) => current.filter((item) => item !== key));
  }

  async function handleSynthesis() {
    const snapshot: Synthesis = {
      text: null,
      error: "",
      upTo: replies[replies.length - 1]?.id ?? 0,
      retained: [],
    };
    setSynthesis(snapshot);
    const response = await fetch("/ia/synthese", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sujet: debate ? shownName(debate) : "",
        messages: replies.map((message) => ({
          id: message.id,
          auteur: displayName(message),
          texte: message.content,
          repond_a: message.metadata?.conversus?.replyTo ?? null,
          retenu: false,
        })),
      }),
    }).catch(() => null);
    const result = response?.ok ? await response.json() : null;
    setSynthesis((current) =>
      current === null
        ? null
        : result?.synthese
          ? { ...current, text: result.synthese }
          : { ...current, error: "La synthèse n'a pas pu être faite. Réessaie." },
    );
  }

  async function findOrigin() {
    const origin = subject?.metadata?.conversus?.origin;
    if (origin !== undefined) return origin;
    const candidates = channels.filter((channel) => !isDebate(channel) && !HIDDEN_CHANNELS.includes(channel.name));
    for (const channel of candidates) {
      const response = await request(token, `/channel/message?channel=${channel.id}&namespace=conversus`);
      if (!response?.ok) continue;
      const messages: Message[] = (await response.json()) ?? [];
      if (messages.some((message) => message.metadata?.conversus?.channelName === debate?.name)) return channel.id;
    }
    return null;
  }

  async function handleShare() {
    if (!synthesis?.text || !debate || sharing) return;
    setSharing(true);
    const origin = await findOrigin();
    if (origin === null) {
      setSynthesis({ ...synthesis, error: "Le canal d'origine est introuvable." });
      setSharing(false);
      return;
    }
    const response = await request(token, MESSAGES, {
      content: synthesis.text,
      channel: origin,
      metadata: { synthesisOf: debate.name, upTo: synthesis.upTo, retained: synthesis.retained, pronouns },
    });
    setSharing(false);
    if (response?.status === 401) {
      onTokenExpired();
      return;
    }
    if (!response?.ok) {
      setSynthesis({ ...synthesis, error: response ? "La synthèse n'a pas pu être partagée. Réessaie." : SERVER_DOWN });
      return;
    }
    setSynthesis(null);
    navigate(workspacePath(origin, channelId));
  }

  return (
    <section className="chat debate" ref={sectionRef}>
      <div className="col-head">
        <DebatePicker
          current={debate ?? null}
          debates={channels.filter(isDebate).toSorted((a, b) => b.id - a.id)}
          onSelect={(entry) => entry.id !== undefined && navigate(workspacePath(openChannelId, entry.id))}
        />
        <button
          type="button"
          className="synthesis-button"
          onClick={handleSynthesis}
          disabled={replies.length === 0 || synthesis !== null}
        >
          <SynthesisIcon />
          Faire ma Synthesis
        </button>
      </div>
      {!synthesis && sharedSynthesis && (
        <SynthesisModal
          stems={stems}
          moods={moods}
          retainedCount={0}
          text={sharedSynthesis.text}
          sharedAt={sharedSynthesis.sharedAt}
          error=""
          sharing={false}
          readOnly
          onCancel={() => navigate(location.pathname, { replace: true, state: null })}
          onShare={() => {}}
        />
      )}
      {synthesis && (
        <SynthesisModal
          stems={stems}
          moods={moods}
          retainedCount={synthesis.retained.length}
          text={synthesis.text}
          error={synthesis.error}
          sharing={sharing}
          onCancel={() => setSynthesis(null)}
          onShare={handleShare}
        />
      )}
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
              className={["board-message", openId === message.id && "open", thread?.has(message.id) && "lit", thread && !thread.has(message.id) && "dimmed"].filter(Boolean).join(" ")}
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
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenId(openId === message.id ? null : message.id);
                }
              }}
            >
              <strong>
                {displayName(message)}
                {displayName(message) !== "Anonyme" && pronounsOf.get(displayName(message)) && (
                  <span className="pronouns"> · {pronounsOf.get(displayName(message))}</span>
                )}
                {openId === message.id && message.posted_at && (
                  <time className="message-time" dateTime={message.posted_at}>{formatTime(message.posted_at)}</time>
                )}
              </strong>
              <p
                data-font={moodFont(reactions, message)}
                style={{ fontFamily: fontFamily(moodFont(reactions, message)) }}
              >
                {openId === message.id ? message.content : preview(message.content)}
              </p>
              {openId === message.id && (
                <div className="message-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="reply-link" onClick={() => handleReply(message)}>Répondre</button>
                  {REACTIONS.map((reaction) => (
                    <button
                      type="button"
                      key={reaction.value}
                      disabled={pendingReactions.includes(`${message.id}-${reaction.value}`)}
                      data-tip={reaction.label}
                      data-reaction={reaction.value}
                      aria-label={reaction.label}
                      onClick={() => handleReact(message, reaction.value)}
                    >
                      <ReactionIcon value={reaction.value} />
                    </button>
                  ))}
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
    </section>
  );
}

export default Debate;
