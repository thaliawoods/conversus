import { useState } from "react";
import { Link, useParams } from "react-router";
import Logo, { SmallFlower } from "./Logo";
import AccountMenu from "./AccountMenu";
import { HIDDEN_CHANNELS, isDebate, shownName, workspacePath, type Channel } from "../channels";

type SidebarProps = {
  token: string;
  channels: Channel[];
  username: string;
  pronouns: string | null;
  onPronounsChange: (pronouns: string) => void;
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
};

function Sidebar({ token, channels, username, pronouns, onPronounsChange, onSwitch, onLogout }: SidebarProps) {
  const { channelId, debateId } = useParams();
  const [search, setSearch] = useState("");
  const [folded, setFolded] = useState<string[]>([]);
  const found = channels.filter(
    (channel) =>
      !HIDDEN_CHANNELS.includes(channel.name) &&
      shownName(channel).toLowerCase().includes(search.trim().toLowerCase()),
  );
  const groups = [
    {
      title: "Canaux",
      items: found.filter((channel) => !isDebate(channel)),
      activeId: channelId,
      path: (channel: Channel) => workspacePath(channel.id, debateId),
    },
    {
      title: "ConVersus",
      items: found.filter(isDebate),
      activeId: debateId,
      path: (channel: Channel) => workspacePath(channelId, channel.id),
    },
  ];

  function toggleGroup(title: string) {
    setFolded(folded.includes(title) ? folded.filter((item) => item !== title) : [...folded, title]);
  }

  return (
    <aside className="sidebar">
      <Logo still className="nav-brand" />
      <label className="sidebar-search">
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15l5 5" />
        </svg>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" />
      </label>
      <div className="sidebar-groups">
        {groups.map((group) => (
          <section className="sidebar-group" key={group.title}>
            <button
              type="button"
              className="sidebar-group-title"
              aria-expanded={!folded.includes(group.title)}
              onClick={() => toggleGroup(group.title)}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
              {group.title}
            </button>
            {!folded.includes(group.title) && (
              <ul>
                {group.items.map((channel) => {
                  const active = String(channel.id) === group.activeId;
                  return (
                    <li key={channel.id}>
                      <Link className={active ? "active" : undefined} to={group.path(channel)} aria-current={active ? "page" : undefined}>
                        <span className="sidebar-mark">{active && <SmallFlower />}</span>
                        <span className="sidebar-name">{shownName(channel)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
      <AccountMenu
        token={token}
        username={username}
        pronouns={pronouns}
        onPronounsChange={onPronounsChange}
        onSwitch={onSwitch}
        onLogout={onLogout}
      />
    </aside>
  );
}

export default Sidebar;
