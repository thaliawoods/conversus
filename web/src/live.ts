import { API } from "./api";

// Server events that change what a channel shows.
const LIVE_OPERATIONS = ["message.created", "message.edited"];
// Server events that change who is on the site.
const PRESENCE_OPERATIONS = ["user.connected", "user.disconnected"];
const RECONNECT_DELAY = 3000;
// Backup in case the socket is down: slower than the old 2 s polling.
export const FALLBACK_POLL = 10000;

// Opens the server's WebSocket for one channel and calls onChange each time a message
// is created or edited in it. Returns a function that closes everything.
export function listenToChannel(token: string, channelId: string | number | undefined, onChange: () => void) {
  return listen(token, channelId, LIVE_OPERATIONS, onChange);
}

// Keeps a socket open on one channel for as long as the site is open: the server counts
// this connection as "online". Calls onChange each time someone connects.
export function listenToPresence(token: string, channelId: string | number | undefined, onChange: () => void) {
  return listen(token, channelId, PRESENCE_OPERATIONS, onChange);
}

function listen(token: string, channelId: string | number | undefined, operations: string[], onChange: () => void) {
  if (channelId === undefined) return () => {};
  const url = `${API.replace(/^http/, "ws")}/channel/socket?channel=${channelId}&authorization=${encodeURIComponent(token)}&namespace=conversus`;
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  let stopped = false;
  let reconnecting = false;

  function open() {
    socket = new WebSocket(url);
    socket.onopen = () => {
      // Messages may have arrived while the socket was down.
      if (reconnecting) onChange();
    };
    socket.onmessage = (event) => {
      // The server can send several events in one frame, one per line.
      const changed = String(event.data)
        .split("\n")
        .some((line) => {
          try {
            return operations.includes(JSON.parse(line).operation);
          } catch {
            return false;
          }
        });
      if (changed) onChange();
    };
    socket.onclose = () => {
      if (stopped) return;
      reconnecting = true;
      retry = window.setTimeout(open, RECONNECT_DELAY);
    };
  }

  open();
  return () => {
    stopped = true;
    window.clearTimeout(retry);
    socket?.close();
  };
}
