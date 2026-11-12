import { useEffect, useState } from "react";
import { API, SERVER_DOWN, request } from "../api";
import PronounsPicker from "./PronounsPicker";
import { TEST_ACCOUNTS, TEST_PASSWORD, recentAccounts, rememberAccount } from "../accounts";

type AccountMenuProps = {
  username: string;
  token: string;
  pronouns: string | null;
  onPronounsChange: (pronouns: string) => void;
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
};

type PronounsSettingProps = {
  token: string;
  saved: string;
  onSaved: (pronouns: string) => void;
};

function PronounsSetting({ token, saved, onSaved }: PronounsSettingProps) {
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = draft.trim();
    if (next === saved) return;
    const timer = setTimeout(async () => {
      const response = await request(token, "/user/edit?namespace=conversus", { metadata: { pronouns: next } });
      if (response?.ok) {
        setError("");
        onSaved(next);
      } else {
        setError(response ? "Pronoms non enregistrés. Réessaie." : SERVER_DOWN);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, saved, token, onSaved]);

  return (
    <>
      <span className="account-label">pronoms</span>
      <PronounsPicker value={draft} onChange={setDraft} />
      {error && <p className="login-error">{error}</p>}
    </>
  );
}

function AccountMenu({ token, username, pronouns, onPronounsChange, onSwitch, onLogout }: AccountMenuProps) {
  const [error, setError] = useState("");
  const recent = recentAccounts();
  const accounts = [...new Set([...Object.keys(recent), ...TEST_ACCOUNTS])];

  async function handleSwitch(account: string) {
    setError("");
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
        {pronouns !== null && (
          <PronounsSetting key={username} token={token} saved={pronouns} onSaved={onPronounsChange} />
        )}
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
