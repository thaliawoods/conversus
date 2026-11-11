// Address of the Go back end. Set VITE_API_URL in web/.env.local to point elsewhere.
export const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const SERVER_DOWN = "Le serveur ne répond pas. Réessaie dans un instant.";

// GET without a body, POST with a JSON body. Null when the server cannot be reached.
export async function request(token: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

// "14:32" today, "10 nov. 14:32" another day.
export function formatTime(date: string | undefined) {
  if (!date) return "";
  const time = new Date(date);
  if (Number.isNaN(time.getTime())) return "";
  const hour = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (time.toDateString() === new Date().toDateString()) return hour;
  return `${time.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${hour}`;
}
