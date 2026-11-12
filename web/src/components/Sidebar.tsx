import { useState } from "react";
import { Link, useParams } from "react-router";
import Logo from "./Logo";
import { PetalFlower } from "./PetalIcons";
import AccountMenu from "./AccountMenu";
import { HIDDEN_CHANNELS, isDebate, shownName, workspacePath, type Channel } from "../channels";
import type { Member } from "../hooks/usePresence";
import { unreadLabel } from "../hooks/useUnread";

const MEMBERS_TITLE = "Membres";

type SidebarProps = {
  channels: Channel[];
  // Unread messages per channel id.
  unread: Map<number, number>;
  members: Member[];
  username: string;
  pronouns: string | null;
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
  onTutorial: () => void;
};

function Sidebar({ channels, unread, members, username, pronouns, onSwitch, onLogout, onTutorial }: SidebarProps) {
  const { channelId, debateId } = useParams();
  const [search, setSearch] = useState("");
  const [folded, setFolded] = useState<string[]>([]);
  const query = search.trim().toLowerCase();
  const found = channels.filter(
    (channel) => !HIDDEN_CHANNELS.includes(channel.name) && shownName(channel).toLowerCase().includes(query),
  );
  const foundMembers = members.filter((member) => member.online && member.username.toLowerCase().includes(query));
  const onlineCount = members.filter((member) => member.online).length;
  const groups = [
    {
      title: "Canaux",
      tour: "channels",
      items: found.filter((channel) => !isDebate(channel)),
      activeId: channelId,
      path: (channel: Channel) => workspacePath(channel.id, debateId),
    },
    {
      title: "ConVersus",
      tour: "debates",
      items: found.filter(isDebate),
      activeId: debateId,
      path: (channel: Channel) => workspacePath(channelId, channel.id),
    },
  ];
  // While searching, empty sections disappear; nothing left = "Aucun résultat".
  const searching = query !== "";
  const shownGroups = searching ? groups.filter((group) => group.items.length > 0) : groups;
  const showMembers = !searching || foundMembers.length > 0;
  const nothingFound = searching && shownGroups.length === 0 && !showMembers;

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
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" aria-label="Rechercher" />
      </label>
      <div className="sidebar-groups">
        {nothingFound && <p className="sidebar-empty">Aucun résultat</p>}
        {shownGroups.map((group) => (
          <section className="sidebar-group" key={group.title} data-tour={group.tour}>
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
                  const count = unread.get(channel.id) ?? 0;
                  const className = [active && "active", count > 0 && "has-unread"].filter(Boolean).join(" ") || undefined;
                  return (
                    <li key={channel.id}>
                      <Link className={className} to={group.path(channel)} aria-current={active ? "page" : undefined}>
                        <span className="sidebar-mark">{active && <PetalFlower flat />}</span>
                        <span className="sidebar-name">{shownName(channel)}</span>
                        {count > 0 && (
                          <span className="sidebar-unread" aria-label={`${unreadLabel(count)} non lus`}>
                            {unreadLabel(count)}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
        {showMembers && (
        <section className="sidebar-group">
          <button
            type="button"
            className="sidebar-group-title"
            aria-expanded={!folded.includes(MEMBERS_TITLE)}
            onClick={() => toggleGroup(MEMBERS_TITLE)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
            {MEMBERS_TITLE}
            <span className="sidebar-count">
              {onlineCount} en ligne · {members.length}
            </span>
          </button>
          {!folded.includes(MEMBERS_TITLE) && (
            <ul>
              {foundMembers.map((member) => (
                <li key={member.id} className={member.online ? "sidebar-member online" : "sidebar-member"}>
                  <span className="sidebar-mark">
                    <span className="presence-dot" />
                  </span>
                  <span className="sidebar-name">
                    {member.username}
                    {member.username === username && <span className="sidebar-me"> (toi)</span>}
                  </span>
                  <span className="visually-hidden">{member.online ? "en ligne" : "hors ligne"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </div>
      <AccountMenu
        username={username}
        pronouns={pronouns}
        onSwitch={onSwitch}
        onLogout={onLogout}
        onTutorial={onTutorial}
      />
    </aside>
  );
}

export default Sidebar;
