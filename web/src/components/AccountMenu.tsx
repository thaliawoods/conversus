import { API } from "../api";
import { useState } from "react";

const accounts = ["thalia", "clara"];
const password = "motdepasse";

type AccountMenuProps = {
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
};

function AccountMenu({ onSwitch, onLogout }: AccountMenuProps) {
  const [current, setCurrent] = useState(localStorage.getItem("account") ?? "");

  async function handleSwitch(username: string) {
    const response = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      console.log("changement refusé", response.status);
      return;
    }
    const newToken = await response.text();
    localStorage.setItem("token", newToken);
    localStorage.setItem("account", username);
    setCurrent(username);
    onSwitch(newToken);
  }

  function handleLogout() {
    localStorage.removeItem("account");
    onLogout();
  }

  return (
    <div className="account-menu">
      <span className="account-name">{current}</span>
      <span className="avatar">{current[0]}</span>
      <div className="account-dropdown">
        <span className="account-label">utilisateurices</span>
        {accounts.map((account) => (
          <button
            className={account === current ? "active" : ""}
            key={account}
            type="button"
            onClick={() => handleSwitch(account)}
          >
            <span className="avatar">{account[0]}</span>
            {account}
          </button>
        ))}
        <button type="button" onClick={handleLogout}>
          Déconnexion
        </button>
      </div>
    </div>
  );
}

export default AccountMenu;
