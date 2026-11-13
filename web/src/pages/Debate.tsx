import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { enterSynthesisChannel, HIDDEN_CHANNELS, isDebate, shownName, SYNTHESIS_CHANNEL, workspacePath, type Channel } from "../channels";
import DebatePicker from "../components/DebatePicker";
import SynthesisModal from "../components/SynthesisModal";
import SynthesisIcon from "../components/SynthesisIcon";
import CameraIcon from "../components/CameraIcon";
import Branches, { type Arrival, type Color, type Mark, type Stem } from "../components/Branches";
import Leaves from "../components/Leaves";
import ReactionIcon, { REACTIONS } from "../components/ReactionIcon";
import type { Message, ReactionValue } from "./Chat";
import { placeMessages, type Placement, type Size } from "../layout";
import { useCamera } from "../hooks/useCamera";
import { useGlide, type Spot } from "../hooks/useGlide";
import useSprouts from "../hooks/useSprouts";
import MessageForm from "../components/MessageForm";
import { fontFamily, shownFont, useSpecialFonts } from "../fonts";
import FontToggle from "../components/FontToggle";
import { userStyle } from "../userColor";
import { SERVER_DOWN, formatTime, request } from "../api";
import { FALLBACK_POLL, listenToChannel } from "../live";
import { pronounsByName } from "../pronouns";
import { SYNTHESIS_USERS } from "../synthesis";

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
  // Full screen: the ConVersus takes the whole window, without the channels beside it.
  expanded: boolean;
  onToggleExpanded: () => void;
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

function isReactionValue(value: unknown): value is ReactionValue {
  return value === "leaf" || value === "thorn" || value === "wilt";
}

// One vote per person: reacting again replaces your previous reaction. Oldest vote first.
function currentVotes(reactions: Message[], message: Message): ReactionValue[] {
  const latest = new Map<string, Message>();
  for (const reaction of reactions) {
    const { reactTo, value } = reaction.metadata?.conversus ?? {};
    if (reactTo !== message.id || !isReactionValue(value)) continue;
    const previous = latest.get(reaction.user);
    if (!previous || previous.id < reaction.id) latest.set(reaction.user, reaction);
  }
  return [...latest.values()]
    .sort((a, b) => a.id - b.id)
    .map((reaction) => reaction.metadata!.conversus!.value as ReactionValue);
}

// The most voted reaction; on a tie, the most recent vote among the tied ones wins.
function majorityReaction(reactions: Message[], message: Message) {
  const votes = currentVotes(reactions, message);
  const counts: Record<ReactionValue, number> = { leaf: 0, thorn: 0, wilt: 0 };
  for (const vote of votes) counts[vote] += 1;
  const best = Math.max(counts.leaf, counts.thorn, counts.wilt);
  if (best === 0) return null;
  return votes.findLast((vote) => counts[vote] === best) ?? null;
}

const MAX_LEAVES = 8;

// A leaf on the branch for every "content": the effect chosen when posting, then each current vote.
// They only decorate the stem: placement ignores them, so nothing moves when one grows.
function leavesOf(reactions: Message[], message: Message): Mark[] {
  const fromEffect = message.metadata?.conversus?.effect === "leaf" ? 1 : 0;
  const fromVotes = currentVotes(reactions, message).filter((vote) => vote === "leaf").length;
  return Array<Mark>(Math.min(MAX_LEAVES, fromEffect + fromVotes)).fill("leaf");
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

function Debate({ token, channels, me, pronouns, onTokenExpired, expanded, onToggleExpanded }: DebateProps) {
  const { debateId: channelId, channelId: openChannelId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sharedSynthesis: { text: string; sharedAt: string } | undefined = location.state?.synthesis;
  const sectionRef = useRef<HTMLElement>(null);
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
  const { special: specialFonts } = useSpecialFonts();
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [thornArrival, setThornArrival] = useState<Arrival | null>(null);
  const [leafArrival, setLeafArrival] = useState<Arrival | null>(null);
  const [wiltArrival, setWiltArrival] = useState<Arrival | null>(null);
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
  const canSynthesize = me !== null && SYNTHESIS_USERS.includes(me.toLowerCase());
  const targets = useMemo(
    () =>
      new Map(
        replies.flatMap((message, index): [number, Spot][] =>
          // Votes never move a branch: no sag, whatever the reactions.
          positions[index] ? [[message.id, { ...positions[index], sag: 0 }]] : [],
        ),
      ),
    [replies, positions],
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
      const text = textSizes[index] ?? to;
      // Votes colour the branch (moods) and "content" grows leaves on it, without moving anything.
      return [{ from, to, sag: 0, id: message.id, marks: leavesOf(reactions, message), text }];
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
      if (toPlay.length > 0) setWiltArrival(toPlay[toPlay.length - 1]);
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
    // Placement ignores votes, so a message stays where it is when someone reacts to it.
    const none = replies.map(() => 0);
    setPositions(placeMessages(sizes, parents, ids, none, none));
    setTextSizes(messageRefs.current.slice(0, replies.length).map(textSize));
    // The plain font changes the size of the messages: measure them again.
  }, [replies, reactions, specialFonts]);

  async function handleSendMessage(
    content: string,
    effect: ReactionValue | undefined,
    anonymous: boolean,
  ) {
    const metadata: { replyTo?: number; effect?: ReactionValue; pronouns?: string } = {};
    if (!anonymous) metadata.pronouns = pronouns;
    if (replyingTo) metadata.replyTo = replyingTo.id;
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
      setWiltArrival({ key: -Date.now(), target: message.id });
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
      // The server checks with this login who is asking: only some accounts may use the synthesis.
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    const result: { synthese?: string; erreur?: string } | null = await response?.json().catch(() => null) ?? null;
    // 401/403: not allowed, the server's own message says why. Anything else: a passing failure.
    const refused = response?.status === 401 || response?.status === 403;
    setSynthesis((current) =>
      current === null
        ? null
        : result?.synthese
          ? { ...current, text: result.synthese }
          : { ...current, error: (refused && result?.erreur) || "La synthèse n'a pas pu être faite. Réessaie." },
    );
  }

  async function handleShare() {
    if (!synthesis?.text || !debate || sharing) return;
    setSharing(true);
    let target: Channel | undefined = channels.find((channel) => channel.name === SYNTHESIS_CHANNEL);
    if (!target) {
      const entered = await enterSynthesisChannel(token);
      if (entered?.ok) target = await entered.json();
    }
    if (!target) {
      setSynthesis({ ...synthesis, error: "Le canal des synthèses est introuvable. Réessaie." });
      setSharing(false);
      return;
    }
    const response = await request(token, MESSAGES, {
      content: synthesis.text,
      channel: target.id,
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
    navigate(workspacePath(target.id, channelId));
  }

  return (
    <section className="chat debate" ref={sectionRef}>
      <div className="col-head">
        <DebatePicker
          current={debate ?? null}
          debates={channels.filter((channel) => isDebate(channel) && !HIDDEN_CHANNELS.includes(channel.name)).toSorted((a, b) => b.id - a.id)}
          onSelect={(entry) => entry.id !== undefined && navigate(workspacePath(openChannelId, entry.id))}
        />
        <button
          type="button"
          className="synthesis-button"
          onClick={handleSynthesis}
          disabled={replies.length === 0 || synthesis !== null || !canSynthesize}
          title={canSynthesize ? undefined : `Synthèse réservée à ${SYNTHESIS_USERS.join(", ")}`}
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
          question={debate ? shownName(debate) : undefined}
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
        <Branches
          stems={stems}
          camera={camera}
          thornArrival={thornArrival}
          leafArrival={leafArrival}
          wiltArrival={wiltArrival}
          sprouts={sprouts}
          highlight={thread}
        />
        <Leaves arrival={leafArrival} wilt={wiltArrival} stems={stems} camera={camera} />
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
              <strong style={userStyle(displayName(message))}>
                {displayName(message)}
                {displayName(message) !== "Anonyme" && pronounsOf.get(displayName(message)) && (
                  <span className="pronouns"> · {pronounsOf.get(displayName(message))}</span>
                )}
                {openId === message.id && message.posted_at && (
                  <time className="message-time" dateTime={message.posted_at}>{formatTime(message.posted_at)}</time>
                )}
              </strong>
              <p
                data-font={specialFonts ? moodFont(reactions, message) : "plain"}
                style={{ fontFamily: fontFamily(moodFont(reactions, message), specialFonts) }}
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
          <FontToggle />
          <button type="button" aria-label="Zoomer" data-tip="Zoomer" onClick={() => zoomBy(ZOOM_STEP)}>
            <CameraIcon action="zoomIn" />
          </button>
          <button type="button" aria-label="Dézoomer" data-tip="Dézoomer" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <CameraIcon action="zoomOut" />
          </button>
          <button type="button" aria-label="Recentrer" data-tip="Recentrer" onClick={recenter}>
            <CameraIcon action="recenter" />
          </button>
          <button
            type="button"
            aria-label={expanded ? "Quitter le plein écran" : "Plein écran"}
            aria-pressed={expanded}
            data-tip={expanded ? "Quitter le plein écran" : "Plein écran"}
            onClick={onToggleExpanded}
          >
            <CameraIcon action={expanded ? "collapse" : "expand"} />
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
