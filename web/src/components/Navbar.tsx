import Logo from "./Logo";
import AccountMenu from "./AccountMenu";

type NavbarProps = {
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
};

function Navbar({ onSwitch, onLogout }: NavbarProps) {
  return (
    <nav className="nav">
      <Logo still className="nav-brand" />
      <AccountMenu onSwitch={onSwitch} onLogout={onLogout} />
    </nav>
  );
}

export default Navbar;
