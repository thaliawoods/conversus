import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Sidebar from "../components/Sidebar";
import ResizeHandle from "../components/ResizeHandle";
import { BigFlower } from "../components/Logo";
import ChannelPanel from "./ChannelPanel";
import Debate from "./Debate";
import { SERVER_DOWN, request } from "../api";
import { usePresence } from "../hooks/usePresence";
import { isDebate, SHARED_CHANNEL, workspacePath, type Channel } from "../channels";
import type { Message } from "./Chat";

type WorkspaceProps = { token: string; onTokenExpired: () => void; onSwitch: (newToken: string) => void };

type Layout = { side: number; channel: number; closed: { side: boolean; channel: boolean; debate: boolean } };

const LAYOUT_KEY = "conversus-layout";
const DEFAULT_LAYOUT: Layout = { side: 166, channel: 320, closed: { side: false, channel: false, debate: false } };
const SIDE_MIN = 140;
const SIDE_MAX = 320;
const CHANNEL_MIN = 260;
const CHANNEL_MAX = 560;
const DEBATE_MIN = 320;
const HOME_CHANNEL = "m1-ecni";
// Every account joins it, so a socket kept open on it tells the server who is on the site.
const PRESENCE_CHANNEL = "general";
// Every account joins these, plus each ConVersus announced in them, so a new visitor sees everything.
const DEMO_CHANNELS = ["general", "m1-ecni", "projet-conversus", "random"];
const ARRIVAL_SIDE = 0.14;
const ARRIVAL_CHANNEL = 0.28;

function arrivalLayout(): Layout {
  const width = window.innerWidth;
  const side = Math.round(Math.min(240, Math.max(180, width * ARRIVAL_SIDE)));
  const channel = Math.round(Math.min(440, Math.max(320, width * ARRIVAL_CHANNEL)));
  return { side, channel, closed: DEFAULT_LAYOUT.closed };
}

function readLayout(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null");
    if (saved?.closed) return { ...DEFAULT_LAYOUT, ...saved, closed: { ...DEFAULT_LAYOUT.closed, ...saved.closed } };
  } catch {
  }
  return DEFAULT_LAYOUT;
}

function Workspace({ token, onTokenExpired, onSwitch }: WorkspaceProps) {
  const { channelId, debateId } = useParams();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [username, setUsername] = useState("");
  const [pronouns, setPronouns] = useState<string | null>(null);
  const [profileError, setProfileError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [expanded, setExpanded] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef(layout);
  const [total, setTotal] = useState(window.innerWidth);
  const { closed } = layout;
  const presenceChannel = channels.find((channel) => channel.name === PRESENCE_CHANNEL)?.id;
  const members = usePresence(token, presenceChannel, username);

  const loadProfile = useCallback(async () => {
    const response = await request(token, "/me");
    if (response?.status === 401) {
      onTokenExpired();
      return;
    }
    if (!response?.ok) {
      setProfileError(SERVER_DOWN);
      return;
    }
    setProfileError("");
    const profile = await response.json();
    // The server can list a channel twice when someone entered it twice.
    const unique: Channel[] = [...new Map((profile.channels as Channel[]).map((channel) => [channel.id, channel])).values()];
    setChannels(unique);
    setUsername(profile.username);
    setPronouns(profile.metadata?.conversus?.pronouns ?? "");
  }, [token, onTokenExpired]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Names already joined (or being joined), so nothing is entered twice.
  const joined = useRef(new Set<string>());
  useEffect(() => {
    for (const channel of channels) joined.current.add(channel.name);
  }, [channels]);

  const joinMissing = useCallback(
    async (names: string[]) => {
      const missing = names.filter((name) => !joined.current.has(name));
      if (missing.length === 0) return;
      missing.forEach((name) => joined.current.add(name));
      for (const name of missing) await request(token, "/channel/enter", { channel: name });
      loadProfile();
    },
    [token, loadProfile],
  );

  useEffect(() => {
    async function joinEverything() {
      const before = await request(token, "/me");
      if (!before?.ok) return;
      for (const channel of (await before.json()).channels as Channel[]) joined.current.add(channel.name);
      await joinMissing(DEMO_CHANNELS);
      const after = await request(token, "/me");
      if (!after?.ok) return;
      const rooms = ((await after.json()).channels as Channel[]).filter((channel) => !isDebate(channel) && channel.name !== SHARED_CHANNEL);
      const debates = new Set<string>();
      for (const room of rooms) {
        const response = await request(token, `/channel/message?channel=${room.id}&namespace=conversus`);
        if (!response?.ok) continue;
        for (const message of ((await response.json()) ?? []) as Message[]) {
          const name = message.metadata?.conversus?.channelName ?? message.metadata?.conversus?.synthesisOf;
          if (name) debates.add(name);
        }
      }
      await joinMissing([...debates]);
    }
    joinEverything();
  }, [token, joinMissing]);

  useEffect(() => {
    setSelecting(false);
  }, [channelId]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setTotal(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
    }
  }, [layout]);

  useEffect(() => {
    if (channelId || debateId) return;
    setLayout(arrivalLayout());
    const home = channels.find((channel) => channel.name === HOME_CHANNEL);
    if (!home) return;
    navigate(workspacePath(home.id, undefined), { replace: true });
  }, [channelId, debateId, channels, navigate]);

  const currentChannel = channels.find((channel) => channel.id === Number(channelId));

  // synthesis: a synthesis shared in the channel, shown over the debate when it opens.
  async function openDebate(name: string, synthesis?: { text: string; sharedAt: string }) {
    const state = synthesis === undefined ? undefined : { synthesis };
    const joined = channels.find((channel) => channel.name === name);
    if (joined) {
      navigate(workspacePath(channelId, joined.id), { state });
      return;
    }
    const response = await request(token, "/channel/enter", { channel: name });
    if (response?.status === 401) {
      onTokenExpired();
      return;
    }
    if (!response?.ok) {
      setProfileError(response ? "Ce ConVersus n'a pas pu être rejoint. Réessaie." : SERVER_DOWN);
      return;
    }
    const debate: Channel = await response.json();
    await loadProfile();
    navigate(workspacePath(channelId, debate.id), { state });
  }

  async function handleDebateLaunched(debate: Channel) {
    await loadProfile();
    navigate(workspacePath(channelId, debate.id));
  }

  function setClosed(column: keyof Layout["closed"], value: boolean) {
    setLayout((current) => ({ ...current, closed: { ...current.closed, [column]: value } }));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "b" && key !== "j") return;
      event.preventDefault();
      const column = key === "b" ? "side" : "debate";
      setLayout((current) => ({ ...current, closed: { ...current.closed, [column]: !current.closed[column] } }));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSideDrag(dx: number) {
    const width = dragStart.current.side + dx;
    if (width < SIDE_MIN / 2) {
      setLayout((current) => ({ ...current, side: dragStart.current.side, closed: { ...current.closed, side: true } }));
      return;
    }
    const others = (closed.channel ? 0 : closed.debate ? CHANNEL_MIN : channelWidth) + (closed.debate ? 0 : DEBATE_MIN);
    const largest = Math.min(SIDE_MAX, total - others);
    setLayout((current) => ({ ...current, side: Math.max(SIDE_MIN, Math.min(largest, width)) }));
  }

  function handleChannelDrag(dx: number) {
    const side = closed.side ? 0 : sideWidth;
    const width = dragStart.current.channel + dx;
    const debateWidth = total - side - width;
    const before = dragStart.current.channel;
    if (width < CHANNEL_MIN / 2) {
      setLayout((current) => ({ ...current, channel: before, closed: { ...current.closed, channel: true } }));
      return;
    }
    if (!closed.debate && debateWidth < DEBATE_MIN / 2) {
      setLayout((current) => ({ ...current, channel: before, closed: { ...current.closed, debate: true } }));
      return;
    }
    const largest = Math.min(CHANNEL_MAX, closed.debate ? total - side : total - side - DEBATE_MIN);
    setLayout((current) => ({ ...current, channel: Math.max(CHANNEL_MIN, Math.min(largest, width)) }));
  }

  const sideFills = closed.channel && closed.debate;
  const channelFills = closed.debate;
  const sideWidth = Math.max(SIDE_MIN, Math.min(SIDE_MAX, layout.side));
  const channelWidth = Math.max(
    CHANNEL_MIN,
    Math.min(layout.channel, CHANNEL_MAX, total - (closed.side ? 0 : sideWidth) - DEBATE_MIN),
  );
  const fullScreen = expanded && debateId !== undefined && !closed.debate;
  const debateFills = !closed.debate;

  return (
    <div className="workspace" ref={workspaceRef}>
      {!fullScreen && !closed.side && (
        <div className={sideFills ? "column fill" : "column"} style={sideFills ? undefined : { width: sideWidth }}>
          <Sidebar
            channels={channels}
            members={members}
            username={username}
            pronouns={pronouns}
            onSwitch={onSwitch}
            onLogout={onTokenExpired}
          />
        </div>
      )}
      {!fullScreen && (
        <ResizeHandle
          closed={closed.side ? "left" : null}
          label="Ouvrir les canaux"
          onDragStart={() => (dragStart.current = layout)}
          onDrag={handleSideDrag}
          onReopen={() => setClosed("side", false)}
          closeLeft={{ label: "Fermer les canaux", onClose: () => setClosed("side", true) }}
        />
      )}
      {!fullScreen && !closed.channel && (
        <div className={channelFills ? "column fill" : "column"} style={channelFills ? undefined : { width: channelWidth }}>
          {currentChannel && (
            <ChannelPanel
              key={currentChannel.id}
              token={token}
              channel={currentChannel}
              me={username}
              pronouns={pronouns ?? ""}
              onOpenDebate={openDebate}
              onDebatesSeen={joinMissing}
              onDebateLaunched={handleDebateLaunched}
              onTokenExpired={onTokenExpired}
              selecting={selecting}
              onSelectingChange={setSelecting}
            />
          )}
          {profileError && <p className="login-error send-error" role="alert">{profileError}</p>}
        </div>
      )}
      {!fullScreen && (
        <ResizeHandle
          closed={closed.channel ? "left" : closed.debate ? "right" : null}
          label={closed.channel ? "Ouvrir le canal" : "Ouvrir le ConVersus"}
          onDragStart={() => (dragStart.current = { ...layout, channel: channelWidth })}
          onDrag={handleChannelDrag}
          onReopen={() => setClosed(closed.channel ? "channel" : "debate", false)}
          closeLeft={{ label: "Fermer le canal", onClose: () => setClosed("channel", true) }}
          closeRight={{ label: "Fermer le ConVersus", onClose: () => setClosed("debate", true) }}
        />
      )}
      {!closed.debate && (
        <div className={debateFills ? "column fill" : "column"}>
          {debateId ? (
            <Debate
              key={debateId}
              token={token}
              channels={channels}
              me={username}
              pronouns={pronouns ?? ""}
              onTokenExpired={onTokenExpired}
              expanded={fullScreen}
              onToggleExpanded={() => setExpanded(!fullScreen)}
            />
          ) : (
            <section className="debate-empty">
              <BigFlower />
              {channelId && !selecting && (
                <button type="button" className="login-button" onClick={() => {
                  setClosed("channel", false);
                  setSelecting(true);
                }}>
                  Lancer un ConVersus
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default Workspace;
