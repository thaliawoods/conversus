import { NavLink } from "react-router";

export type Channel = { id: number; name: string };

type NavbarProps = { channels: Channel[] };

function Navbar({ channels }: NavbarProps) {
  return (
    <nav className="nav">
      <h1 className="logo">ConVersus</h1>
      {channels.map((channel) => (
        <NavLink className="tab" key={channel.id} to={`/channel/${channel.id}`}>
          {channel.name}
        </NavLink>
      ))}
    </nav>
  );
}

export default Navbar;