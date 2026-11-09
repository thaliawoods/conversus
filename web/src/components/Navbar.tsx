import { NavLink } from "react-router";

export type Channel = { id: number; name: string };

type NavbarProps = { channels: Channel[] };

function Navbar({ channels }: NavbarProps) {
  return (
    <nav className="nav">
      <h1 className="logo">ConVersus</h1>
      {channels.map((channel) => {
        const isDebate = /#\d+$/.test(channel.name);
        return (
          <NavLink
            className={isDebate ? "tab debate-tab" : "tab"}
            key={channel.id}
            to={`/${isDebate ? "debate" : "channel"}/${channel.id}`}
          >
            {channel.name.replace(/#\d+$/, "")}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default Navbar;