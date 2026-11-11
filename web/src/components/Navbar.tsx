import { useEffect, useRef, useState } from "react";
import { NavLink, useParams } from "react-router";
import Logo from "./Logo";
import AccountMenu from "./AccountMenu";

export type Channel = { id: number; name: string };

type NavbarProps = {
  channels: Channel[];
  username: string;
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
};

export function isDebate(channel: Channel) {
  return /#\d+$/.test(channel.name);
}

// "general" can't be read: the back's clock posts metadata "[]" in it, and the back fails on them.
// Hidden until the back is fixed (we don't touch it).
export const HIDDEN_CHANNELS = ["general"];

function Navbar({ channels, username, onSwitch, onLogout }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const { channelId } = useParams();
  const debates = channels.filter(isDebate);
  const current = debates.find((debate) => debate.id === Number(channelId));
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <nav className="nav">
      <Logo still className="nav-brand" />
      {channels.filter((channel) => !isDebate(channel) && !HIDDEN_CHANNELS.includes(channel.name)).map((channel) => (
        <NavLink className="tab" key={channel.id} to={`/channel/${channel.id}`}>
          {channel.name}
        </NavLink>
      ))}
      <div className="nav-debates" ref={menuRef}>
        <button type="button" className={current ? "tab active" : "tab"} aria-expanded={open} onClick={() => setOpen(!open)}>
          Les ConVersus{current && ` · ${current.name.replace(/#\d+$/, "")}`}
        </button>
        {open && (
          <ul className="nav-debate-list">
            {debates.map((debate) => (
              <li key={debate.id}>
                <NavLink to={`/debate/${debate.id}`} onClick={() => setOpen(false)}>
                  {debate.name.replace(/#\d+$/, "")}
                </NavLink>
              </li>
            ))}
            {debates.length === 0 && <li className="nav-empty">Lance un débat depuis un canal</li>}
          </ul>
        )}
      </div>
      <AccountMenu username={username} onSwitch={onSwitch} onLogout={onLogout} />
    </nav>
  );
}

export default Navbar;
