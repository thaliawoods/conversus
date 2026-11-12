import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Sidebar from "../components/Sidebar";
import ResizeHandle from "../components/ResizeHandle";
import { BigFlower } from "../components/Logo";
import ChannelPanel from "./ChannelPanel";
import Debate from "./Debate";
import { SERVER_DOWN, request } from "../api";
import { workspacePath, type Channel } from "../channels";

type WorkspaceProps = { token: string; onTokenExpired: () => void; onSwitch: (newToken: string) => void };

type Layout = { side: number; channel: number; closed: { side: boolean; channel: boolean; debate: boolean } };

const LAYOUT_KEY = "conversus-layout";
const DEFAULT_LAYOUT: Layout = { side: 176, channel: 360, closed: { side: false, channel: false, debate: false } };
const SIDE_MIN = 140;
const SIDE_MAX = 320;
const CHANNEL_MIN = 260;
const DEBATE_MIN = 320;

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
  const workspaceRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef(layout);
  const [total, setTotal] = useState(window.innerWidth);
  const { closed } = layout;

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
    setChannels(profile.channels);
    setUsername(profile.username);
    setPronouns(profile.metadata?.conversus?.pronouns ?? "");
  }, [token, onTokenExpired]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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

  const currentChannel = channels.find((channel) => channel.id === Number(channelId));

  async function openDebate(name: string) {
    const joined = channels.find((channel) => channel.name === name);
    if (joined) {
      navigate(workspacePath(channelId, joined.id));
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
    navigate(workspacePath(channelId, debate.id));
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
    setLayout((current) => ({ ...current, side: Math.min(SIDE_MAX, Math.max(SIDE_MIN, width)) }));
  }

  function handleChannelDrag(dx: number) {
    const side = closed.side ? 0 : layout.side;
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
    const largest = closed.debate ? total - side : total - side - DEBATE_MIN;
    setLayout((current) => ({ ...current, channel: Math.max(CHANNEL_MIN, Math.min(largest, width)) }));
  }

  const channelFills = closed.debate;
  const channelWidth = Math.max(CHANNEL_MIN, Math.min(layout.channel, total - (closed.side ? 0 : layout.side) - DEBATE_MIN));
  const debateFills = !closed.debate;

  return (
    <div className="workspace" ref={workspaceRef}>
      {!closed.side && (
        <div className="column" style={{ width: layout.side }}>
          <Sidebar
            token={token}
            channels={channels}
            username={username}
            pronouns={pronouns}
            onPronounsChange={setPronouns}
            onSwitch={onSwitch}
            onLogout={onTokenExpired}
          />
        </div>
      )}
      <ResizeHandle
        closed={closed.side ? "left" : null}
        label="Ouvrir les canaux"
        onDragStart={() => (dragStart.current = layout)}
        onDrag={handleSideDrag}
        onReopen={() => setClosed("side", false)}
      />
      {!closed.channel && (
        <div className={channelFills ? "column fill" : "column"} style={channelFills ? undefined : { width: channelWidth }}>
          {currentChannel && (
            <ChannelPanel
              key={currentChannel.id}
              token={token}
              channel={currentChannel}
              me={username}
              pronouns={pronouns ?? ""}
              onOpenDebate={openDebate}
              onDebateLaunched={handleDebateLaunched}
              onTokenExpired={onTokenExpired}
              selecting={selecting}
              onSelectingChange={setSelecting}
            />
          )}
          {profileError && <p className="login-error send-error" role="alert">{profileError}</p>}
        </div>
      )}
      <ResizeHandle
        closed={closed.channel ? "left" : closed.debate ? "right" : null}
        label={closed.channel ? "Ouvrir le canal" : "Ouvrir le ConVersus"}
        onDragStart={() => (dragStart.current = { ...layout, channel: channelWidth })}
        onDrag={handleChannelDrag}
        onReopen={() => setClosed(closed.channel ? "channel" : "debate", false)}
      />
      {!closed.debate && (
        <div className={debateFills ? "column fill" : "column"}>
          {debateId ? (
            <Debate
              key={debateId}
              token={token}
              channels={channels}
              pronouns={pronouns ?? ""}
              onTokenExpired={onTokenExpired}
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
