// The shared class server: every group's accounts, channels and messages live there.
// To use a local API instead (docker compose), set VITE_API_URL=http://localhost:4000 in web/.env.local.
export const API = import.meta.env.VITE_API_URL || "https://gobelins-chat-api.leomouraire.com:4000";

export const SERVER_DOWN = "Le serveur ne répond pas. Réessaie dans un instant.";

export async function request(token: string, path: string, body?: unknown, method?: "PUT") {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${API}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export function formatTime(date: string | undefined) {
  if (!date) return "";
  const time = new Date(date);
  if (Number.isNaN(time.getTime())) return "";
  const hour = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (time.toDateString() === new Date().toDateString()) return hour;
  return `${time.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${hour}`;
}
