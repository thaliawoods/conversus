import { recentAccounts, rememberAccount } from "../accounts";

type AccountMenuProps = {
  username: string;
  pronouns: string | null;
  onSwitch: (newToken: string) => void;
  onLogout: () => void;
};

function AccountMenu({ username, pronouns, onSwitch, onLogout }: AccountMenuProps) {
  const recent = recentAccounts();
  const accounts = Object.keys(recent);

  function handleSwitch(account: string) {
    rememberAccount(account, recent[account]);
    onSwitch(recent[account]);
  }

  return (
    <div className="account-menu">
      <span className="account-name">
        {username}
        {pronouns && <span className="pronouns"> · {pronouns}</span>}
      </span>
      <span className="avatar">{username[0]}</span>
      <div className="account-dropdown">
        {accounts.length > 0 && <span className="account-label">utilisateurices</span>}
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
        <button type="button" onClick={onLogout}>
          Déconnexion
        </button>
      </div>
    </div>
  );
}

export default AccountMenu;
