import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { API } from "../api";
import Navbar from "../components/Navbar";
import DebatePicker, { type DebateEntry } from "../components/DebatePicker";
import ChannelPanel from "./ChannelPanel";
import Debate from "./Debate";
import { isDebate, type Channel } from "../types";
import { useResizableWidth } from "../hooks/useResizableWidth";

type WorkspaceProps = { token: string; onTokenExpired: () => void; onSwitch: (newToken: string) => void };

const timestampOf = (name: string) => Number(name.match(/#(\d+)$/)?.[1] ?? 0);

// Largeur du bloc des messages (px) et place minimale gardée pour le ConVersus.
const CHANNEL_WIDTH = { initial: 400, min: 280, max: 760 };
const DEBATE_MIN = 360;
// Liste des channels (14rem) + deux espaces (0.8rem) + marges (2 × 1rem), en px.
const FIXED_PARTS = 14 * 16 + 2 * 0.8 * 16 + 2 * 16;

// Trois colonnes : liste des channels · messages du channel choisi · ConVersus choisi.
function Workspace({ token, onTokenExpired, onSwitch }: WorkspaceProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [me, setMe] = useState<string | null>(null);
  // ConVersus annoncés dans les channels consultés, même ceux qu'on n'a pas encore rejoints.
  const [announced, setAnnounced] = useState<string[]>([]);
  const [params, setParams] = useSearchParams();
  const columnsRef = useRef<HTMLDivElement>(null);
  const resizer = useResizableWidth({
    storageKey: "conversus-largeur-messages",
    ...CHANNEL_WIDTH,
    room: () => {
      const total = columnsRef.current?.clientWidth;
      return total ? total - FIXED_PARTS - DEBATE_MIN : CHANNEL_WIDTH.max;
    },
  });

  const loadProfile = useCallback(async () => {
    const response = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      onTokenExpired();
      return [];
    }
    if (!response.ok) return [];
    const profile = await response.json();
    const list: Channel[] = profile.channels ?? [];
    setChannels(list);
    setMe(profile.username ?? null);
    return list;
  }, [token, onTokenExpired]);

  useEffect(() => {
    loadProfile();
    const intervalId = setInterval(loadProfile, 15000);
    return () => clearInterval(intervalId);
  }, [loadProfile]);

  const rooms = channels.filter((channel) => !isDebate(channel));
  const channelParam = Number(params.get("channel"));
  const debateParam = Number(params.get("debate"));
  const currentChannel =
    rooms.find((channel) => channel.id === channelParam) ??
    rooms.find((channel) => channel.name === "general") ??
    rooms[0];
  const currentDebate = channels.find((channel) => channel.id === debateParam && isDebate(channel)) ?? null;

  const debates = useMemo(() => {
    const byName = new Map<string, DebateEntry>();
    for (const name of announced) byName.set(name, { name });
    for (const channel of channels) if (isDebate(channel)) byName.set(channel.name, { name: channel.name, id: channel.id });
    return [...byName.values()].sort((a, b) => timestampOf(b.name) - timestampOf(a.name));
  }, [announced, channels]);

  function select(key: "channel" | "debate", id: number) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set(key, String(id));
      return next;
    });
  }

  const handleDebatesSeen = useCallback((names: string[]) => {
    setAnnounced((current) => {
      const fresh = names.filter((name) => !current.includes(name));
      return fresh.length === 0 ? current : [...current, ...fresh];
    });
  }, []);

  async function openDebate(name: string) {
    const joined = channels.find((channel) => channel.name === name);
    if (joined) {
      select("debate", joined.id);
      return;
    }
    const response = await fetch(`${API}/channel/enter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: name }),
    });
    if (!response.ok) {
      console.log("entrée refusée", response.status);
      return;
    }
    const debate: Channel = await response.json();
    await loadProfile();
    select("debate", debate.id);
  }

  async function handleDebateLaunched(debate: Channel) {
    await loadProfile();
    select("debate", debate.id);
  }

  return (
    <main className="workspace">
      <Navbar onSwitch={onSwitch} onLogout={onTokenExpired} />
      <div
        className={resizer.dragging ? "workspace-columns resizing" : "workspace-columns"}
        ref={columnsRef}
        style={{ "--channel-width": `${resizer.width}px` } as React.CSSProperties}
      >
        <aside className="channel-list">
          <h2 className="column-label">Channels</h2>
          <ul>
            {rooms.map((channel) => (
              <li key={channel.id}>
                <button
                  type="button"
                  className={channel.id === currentChannel?.id ? "active" : undefined}
                  onClick={() => select("channel", channel.id)}
                >
                  <span className="hash">#</span>
                  {channel.name}
                </button>
              </li>
            ))}
            {rooms.length === 0 && <li className="column-empty">Aucun channel</li>}
          </ul>
        </aside>

        {currentChannel ? (
          <ChannelPanel
            key={currentChannel.id}
            token={token}
            channel={currentChannel}
            me={me}
            onDebatesSeen={handleDebatesSeen}
            onOpenDebate={openDebate}
            onDebateLaunched={handleDebateLaunched}
          />
        ) : (
          <section className="channel-panel channel-panel-empty">Aucun channel à afficher</section>
        )}

        <div
          className="column-resizer"
          aria-label="Largeur du bloc des messages (double-clic pour réinitialiser)"
          title="Glisser pour changer la largeur · double-clic pour réinitialiser"
          {...resizer.handleProps}
        />

        <section className="debate-panel">
          <header className="panel-header">
            <DebatePicker
              current={currentDebate}
              debates={debates}
              onSelect={(debate) => (debate.id === undefined ? openDebate(debate.name) : select("debate", debate.id))}
            />
          </header>
          {currentDebate ? (
            <Debate key={currentDebate.id} token={token} debate={currentDebate} me={me} />
          ) : (
            <p className="debate-panel-empty">
              Choisis un ConVersus en cliquant sur le titre, ou lance-en un depuis un channel.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

export default Workspace;
