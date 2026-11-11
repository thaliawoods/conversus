// Accounts already signed in on this browser: username -> token.
const KEY = "accounts";

// Test accounts only, to remove once the tests are over.
export const TEST_ACCOUNTS = ["thalia", "clara"];
export const TEST_PASSWORD = "motdepasse";

export function recentAccounts(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberAccount(username: string, token: string) {
  localStorage.setItem(KEY, JSON.stringify({ ...recentAccounts(), [username]: token }));
  localStorage.setItem("token", token);
}

export function forgetToken(token: string) {
  const accounts = recentAccounts();
  for (const name of Object.keys(accounts)) {
    if (accounts[name] === token) delete accounts[name];
  }
  localStorage.setItem(KEY, JSON.stringify(accounts));
  localStorage.removeItem("token");
}
