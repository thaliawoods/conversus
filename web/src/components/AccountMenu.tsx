import { useEffect, useRef, useState } from "react";
import { recentAccounts, rememberAccount } from "../accounts";

type AccountMenuProps = {
  username: string;
  pronouns: string | null;
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
  onTutorial: () => void;
};

function AccountMenu({ username, pronouns, onSwitch, onLogout, onTutorial }: AccountMenuProps) {
  const recent = recentAccounts();
  const accounts = Object.keys(recent);
  // Agreed with the connected account's pronoun; iel or no pronoun keeps the inclusive form.
  const userLabel = pronouns === "elle" ? "utilisatrice" : pronouns === "il" ? "utilisateur" : "utilisateurice";

  // Opens on hover (mouse) or on tap (tablet, phone: no hover there).
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function handleSwitch(account: string) {
    rememberAccount(account, recent[account]);
    onSwitch(recent[account]);
  }

  return (
    <div className={open ? "account-menu open" : "account-menu"} ref={menuRef}>
      <button type="button" className="account-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="account-name">
          {username}
          {pronouns && <span className="pronouns"> · {pronouns}</span>}
        </span>
        <span className="avatar">{username[0]}</span>
      </button>
      <div className="account-dropdown">
        {accounts.length > 0 && <span className="account-label">{userLabel}</span>}
        {accounts.map((account) => (
          <button
            className={account === username ? "active" : ""}
            key={account}
            type="button"
            onClick={() => handleSwitch(account)}
          >
            <span className="avatar">{account[0]}</span>
            {account}
          </button>
        ))}
        <button type="button" onClick={onTutorial}>
          Revoir le tuto
        </button>
        <button type="button" onClick={onLogout}>
          Déconnexion
        </button>
      </div>
    </div>
  );
}

export default AccountMenu;
