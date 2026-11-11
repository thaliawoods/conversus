import { useState } from "react";
import { API, SERVER_DOWN } from "../api";
import { TEST_ACCOUNTS, TEST_PASSWORD, recentAccounts, rememberAccount } from "../accounts";

type AccountMenuProps = {
  username: string;
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
};

function AccountMenu({ username, onSwitch, onLogout }: AccountMenuProps) {
  const [error, setError] = useState("");
  const recent = recentAccounts();
  const accounts = [...new Set([...Object.keys(recent), ...TEST_ACCOUNTS])];

  async function handleSwitch(account: string) {
    setError("");
    // Already signed in on this browser: reuse its token, no password needed.
    if (recent[account]) {
      rememberAccount(account, recent[account]);
      onSwitch(recent[account]);
      return;
    }
    try {
      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account, password: TEST_PASSWORD }),
      });
      if (!response.ok) {
        setError("Impossible de passer sur ce compte.");
        return;
      }
      const newToken = await response.text();
      rememberAccount(account, newToken);
      onSwitch(newToken);
    } catch {
      setError(SERVER_DOWN);
    }
  }

  return (
    <div className="account-menu">
      <span className="account-name">{username}</span>
      <span className="avatar">{username[0]}</span>
      <div className="account-dropdown">
        <span className="account-label">utilisateurices</span>
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
        {error && <p className="login-error">{error}</p>}
        <button type="button" onClick={onLogout}>
          Déconnexion
        </button>
      </div>
    </div>
  );
}

export default AccountMenu;
