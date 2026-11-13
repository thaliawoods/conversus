import { useState } from "react";
import { Link, useParams } from "react-router";
import Logo from "./Logo";
import { PetalFlower } from "./PetalIcons";
import AccountMenu from "./AccountMenu";
import { HIDDEN_CHANNELS, isDebate, SHARED_CHANNEL, shownName, workspacePath, type Channel } from "../channels";
import type { Member } from "../hooks/usePresence";
import { userStyle } from "../userColor";
import { unreadLabel } from "../hooks/useUnread";

const ONLINE_TITLE = "En ligne";
const OFFLINE_TITLE = "Hors ligne";

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
  // The shared channel stays hidden from ConVersus lookups, but is listed here so it can be opened.
  const found = channels.filter(
    (channel) =>
      (channel.name === SHARED_CHANNEL || !HIDDEN_CHANNELS.includes(channel.name)) &&
      shownName(channel).toLowerCase().includes(query),
  );
  // Everyone is listed, in two folders: who is online, then who is not.
  const foundMembers = members.filter((member) => member.username.toLowerCase().includes(query));
  const memberGroups = [
    { title: ONLINE_TITLE, items: foundMembers.filter((member) => member.online) },
    { title: OFFLINE_TITLE, items: foundMembers.filter((member) => !member.online) },
  ];
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
        {memberGroups.map((group) => (
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
              <span className="sidebar-count">{group.items.length}</span>
            </button>
            {!folded.includes(group.title) && (
              <ul>
                {group.items.map((member) => (
                  <li key={member.id} className={member.online ? "sidebar-member online" : "sidebar-member"}>
                    <span className="sidebar-mark">
                      <span className="presence-dot" />
                    </span>
                    <span className="sidebar-name" style={userStyle(member.username)}>
                      {member.username}
                      {member.username === username && <span className="sidebar-me"> (toi)</span>}
                    </span>
                    <span className="visually-hidden">{member.online ? "en ligne" : "hors ligne"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
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
