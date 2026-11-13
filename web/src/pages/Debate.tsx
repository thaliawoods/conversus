import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { enterSynthesisChannel, HIDDEN_CHANNELS, isDebate, reactionsChannelId, shownName, SYNTHESIS_CHANNEL, workspacePath, type Channel } from "../channels";
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
const FIT_MARGIN = 32; // px kept free around the plant when it is framed
const CONTROLS_SPACE = 64; // px kept free at the bottom for the zoom buttons
const MIN_FRAME_ZOOM = 0.55; // framing never zooms out further, so the text stays readable
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

// Sons des réactions, coupés pour l'instant. Pour les remettre : décommenter ces trois lignes
// et les trois appels dans handleReact.
// Son des feuilles (freesound « crunching leaves »), joué quand on réagit Content.
// const LEAF_SOUND = new Audio("/sounds/feuilles.mp3");
// Pluie (dragon-studio « calming rain ») : 2 s du milieu, fondus calés sur Rain.tsx.
// const RAIN_SOUND = new Audio("/sounds/pluie.mp3");
// Orage (evanaeva « thunderstorm ») : de 2 à 4 s, joué quand on réagit En colère.
// const THUNDER_SOUND = new Audio("/sounds/orage.mp3");

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

// Every vote counts, as many as anyone wants: nothing replaces an earlier one. Oldest vote first.
function currentVotes(reactions: Message[], message: Message): ReactionValue[] {
  return reactions
    .filter((reaction) => reaction.metadata?.conversus?.reactTo === message.id && isReactionValue(reaction.metadata.conversus.value))
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

// Leaves ("content") and thorns ("en colère") on the branch, in the order they came: the effect
// chosen when posting, then each current vote, oldest first. Each "triste" takes away the newest
// leaf. Placement ignores the marks, so nothing moves when one grows or goes.
function marksOf(reactions: Message[], message: Message): Mark[] {
  const effect = message.metadata?.conversus?.effect;
  const marks: Mark[] = [];
  for (const value of [...(effect ? [effect] : []), ...currentVotes(reactions, message)]) {
    if (value !== "wilt") marks.push(value);
    else if (marks.includes("leaf")) marks.splice(marks.lastIndexOf("leaf"), 1);
  }
  return marks;
}

// Every font a message can be shown in, loaded up front so its size is known before placing it.
const MESSAGE_FONTS = ["Josafronde", "LigaSans", "LoveAndRage", "Nudles", "Tremplin", "PicNic"];

// Every reaction plays its animation: each one grows a new leaf or thorn (or takes a leaf away).
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
  const [subject, setSubject] = useState<Message | null>(null);
  // A real ConVersus always has at least its subject: no message at all = it doesn't exist.
  const [missing, setMissing] = useState(false);
  const [pendingReactions, setPendingReactions] = useState<string[]>([]);
  const [replies, setReplies] = useState<Message[]>([]);
  const pronounsOf = useMemo(() => pronounsByName(replies, me, pronouns), [replies, me, pronouns]);
  const [reactions, setReactions] = useState<Message[]>([]);
  const [positions, setPositions] = useState<Placement[]>([]);
  const [textSizes, setTextSizes] = useState<Size[]>([]);
  // Size each message is placed with, measured once. A vote changes the font of a message, so
  // its size: placing it again would move the whole plant and could swallow a short branch.
  const placedSizes = useRef(new Map<number, Size>());
  const placedWith = useRef<string | null>(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const messageRefs = useRef<HTMLDivElement[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const { special: specialFonts } = useSpecialFonts();
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [thornArrival, setThornArrival] = useState<Arrival | null>(null);
  const [leafArrival, setLeafArrival] = useState<Arrival | null>(null);
  const [wiltArrival, setWiltArrival] = useState<Arrival | null>(null);
  const seenReactions = useRef<Set<number> | null>(null);
  // Targets of our own reactions, already played on click: their echo from the server plays nothing.
  const ownWilts = useRef<number[]>([]);
  const ownLeaves = useRef<number[]>([]);
  const ownThorns = useRef<number[]>([]);
  const reactionsChannel = useRef<{ id: number | null; checked: number }>({ id: null, checked: 0 });
  const subjectRef = useRef<Message | null>(null);
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
      // Votes colour the branch (moods) and grow leaves or thorns on it, without moving anything.
      return [{ from, to, sag: 0, id: message.id, marks: marksOf(reactions, message), text }];
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
      // Reactions live in their own hidden channel (see reactionsChannelId): looked up again
      // every 10 s while nobody has created it yet.
      const lookup = reactionsChannel.current;
      if (lookup.id === null && Date.now() - lookup.checked > 10_000) {
        lookup.checked = Date.now();
        lookup.id = await reactionsChannelId(token, Number(channelId), false);
      }
      const [response, reactionsResponse] = await Promise.all([
        request(token, `/channel/message?channel=${channelId}&namespace=conversus`),
        lookup.id === null ? null : request(token, `/channel/message?channel=${lookup.id}&namespace=conversus`),
      ]);
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
      setMissing(all.length === 0);
      // The subject is the first message of the debate, kept once seen: if it ever leaves the
      // server's window of 100 messages, a reply must not take its place (the plant would rebuild).
      const oldest = all[0] ?? null;
      if (!subjectRef.current || (oldest && oldest.id < subjectRef.current.id)) subjectRef.current = oldest;
      const subjectId = subjectRef.current?.id ?? -1;
      setSubject(subjectRef.current);
      // Reactions from both channels: the old ones were posted in the debate itself.
      const ownChannel: Message[] = reactionsResponse?.ok ? ((await reactionsResponse.json()) ?? []) : [];
      const messages = [
        ...all.filter((message) => message.id > subjectId),
        ...ownChannel.filter((message) => message.metadata?.conversus?.reactTo !== undefined),
      ].sort((a, b) => a.id - b.id);
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
      const othersOnly = (arrivals: Arrival[], own: number[]) =>
        arrivals.filter((arrival) => {
          const index = own.indexOf(arrival.target);
          if (index === -1) return true;
          own.splice(index, 1);
          return false;
        });
      const thornsToPlay = othersOnly(freshThorns, ownThorns.current);
      if (thornsToPlay.length > 0) setThornArrival(thornsToPlay[thornsToPlay.length - 1]);
      const leavesToPlay = othersOnly(freshLeaves, ownLeaves.current);
      if (leavesToPlay.length > 0) setLeafArrival(leavesToPlay[leavesToPlay.length - 1]);
      const toPlay = othersOnly(freshWilts, ownWilts.current);
      if (toPlay.length > 0) setWiltArrival(toPlay[toPlay.length - 1]);
    }

    seenReactions.current = null;
    reactionsChannel.current = { id: null, checked: 0 };
    subjectRef.current = null;
    loadMessages();
    const stopListening = listenToChannel(token, channelId, loadMessages);
    const intervalId = setInterval(loadMessages, FALLBACK_POLL);
    return () => {
      stopListening();
      clearInterval(intervalId);
    };
  }, [token, channelId, onTokenExpired]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(MESSAGE_FONTS.map((font) => document.fonts.load(`1rem "${font}"`)))
      .catch(() => {})
      .finally(() => !cancelled && setFontsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    // Measured again only when the fonts arrive or the plain font is switched on or off.
    const fontState = `${fontsLoaded}-${specialFonts}`;
    if (placedWith.current !== fontState) {
      placedWith.current = fontState;
      placedSizes.current.clear();
    }
    const sizes = replies.map((message, index) => {
      let size = placedSizes.current.get(message.id);
      if (!size) {
        const element = messageRefs.current[index];
        size = { width: element.offsetWidth, height: element.offsetHeight };
        placedSizes.current.set(message.id, size);
      }
      return size;
    });
    const parents = findParents(replies);
    const ids = replies.map((message) => message.id);
    // Placement ignores votes, so a message stays where it is when someone reacts to it.
    const none = replies.map(() => 0);
    setPositions(placeMessages(sizes, parents, ids, none, none));
    // The branch still reaches the text as it is shown now (font of the vote, opened or not).
    setTextSizes(messageRefs.current.slice(0, replies.length).map(textSize));
  }, [replies, reactions, specialFonts, fontsLoaded]);

  // Camera that shows the whole plant in the panel: at opening and on "Recentrer".
  function frameOf() {
    const view = viewportRef.current;
    if (!view || positions.length === 0) return { x: 0, y: 0, zoom: 1 };
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    for (const spot of positions) {
      left = Math.min(left, spot.x);
      right = Math.max(right, spot.x + spot.width);
      top = Math.min(top, spot.y);
      bottom = Math.max(bottom, spot.y + spot.height);
    }
    const fit = Math.min(
      1,
      (view.clientWidth - 2 * FIT_MARGIN) / (right - left),
      (view.clientHeight - 2 * FIT_MARGIN - CONTROLS_SPACE) / (bottom - top),
    );
    const zoom = Math.max(MIN_FRAME_ZOOM, fit);
    return { x: (-(left + right) / 2) * zoom, y: (-(top + bottom) / 2) * zoom - CONTROLS_SPACE / 2, zoom };
  }

  // Frames the plant once per ConVersus, when every message has its place.
  const framedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (framedFor.current === channelId || positions.length === 0 || positions.length < replies.length) return;
    framedFor.current = channelId;
    recenter(frameOf());
  });

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
    // Noted now, so the echo of this vote in the polling plays nothing.
    const own = { leaf: ownLeaves, thorn: ownThorns, wilt: ownWilts }[value].current;
    own.push(message.id);
    // Posted in the hidden reactions channel of the debate, created by the first reaction.
    const lookup = reactionsChannel.current;
    if (lookup.id === null) lookup.id = await reactionsChannelId(token, Number(channelId), true);
    const response = lookup.id === null ? null : await request(token, MESSAGES, {
      content: "",
      channel: lookup.id,
      metadata: { reactTo: message.id, value },
      anonymous: false,
    });
    if (checkResponse(response, "Réaction non envoyée. Réessaie.")) {
      const created: Message = await response!.json();
      // The server leaves "user" empty in its answer: without your name, this vote would count as
      // someone else's (your previous vote would stay) until the next reload corrects the plant.
      setReactions((current) => [...current, { ...created, user: created.user || (me ?? "") }]);
      // Played only now, in the same render as the new leaf or thorn: started at the click, the
      // growth was over before a slow server answered, and the mark popped up already grown.
      const arrival = { key: -Date.now(), target: message.id };
      if (value === "thorn") setThornArrival(arrival);
      if (value === "leaf") setLeafArrival(arrival);
      if (value === "wilt") setWiltArrival(arrival);
      // Sons coupés (voir LEAF_SOUND en haut du fichier) : THUNDER_SOUND, RAIN_SOUND, LEAF_SOUND.
    } else {
      const index = own.indexOf(message.id);
      if (index !== -1) own.splice(index, 1);
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
    const shared = {
      content: synthesis.text,
      metadata: { synthesisOf: debate.name, upTo: synthesis.upTo, retained: synthesis.retained, pronouns },
    };
    const response = await request(token, MESSAGES, { ...shared, channel: origin });
    if (response?.status === 401) {
      setSharing(false);
      onTokenExpired();
      return;
    }
    if (!response?.ok) {
      setSharing(false);
      setSynthesis({ ...synthesis, error: response ? "La synthèse n'a pas pu être partagée. Réessaie." : SERVER_DOWN });
      return;
    }
    // Also in the synthesis channel. Already shared in the origin channel, so a failure here
    // shows no error: retrying would post the synthesis twice in the origin channel.
    let target = channels.find((channel) => channel.name === SYNTHESIS_CHANNEL)?.id;
    if (target === undefined) {
      const entered = await enterSynthesisChannel(token);
      if (entered?.ok) target = ((await entered.json()) as Channel).id;
    }
    if (target !== undefined) await request(token, MESSAGES, { ...shared, channel: target });
    setSharing(false);
    setSynthesis(null);
    navigate(workspacePath(origin, channelId));
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
      {/* Outside the viewport, so the fade at the top of the plant does not hide it. */}
      <div className="font-anchor">
        <div className="camera-controls font-controls">
          <FontToggle />
        </div>
      </div>
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
        <Leaves wilt={wiltArrival} stems={stems} camera={camera} />
        <div
          className="board"
          // --zoom lets the reaction row keep a usable size when zoomed out (App.css, .message-actions).
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, "--zoom": camera.zoom } as CSSProperties}
        >
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
                      // Lit in its colour once anyone has given this reaction to the message.
                      className={currentVotes(reactions, message).includes(reaction.value) ? "given" : undefined}
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
          <button type="button" aria-label="Recentrer" data-tip="Recentrer" onClick={() => recenter(frameOf())}>
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
      {missing ? (
        <p className="login-error send-error debate-missing" role="alert">Ce ConVersus est introuvable.</p>
      ) : (
        <MessageForm
          onSend={handleSendMessage}
          placeholder={replyingTo ? `Réponds à ${displayName(replyingTo)}…` : "Réponds au sujet…"}
          error={error || connectionError}
        />
      )}
    </section>
  );
}

export default Debate;
