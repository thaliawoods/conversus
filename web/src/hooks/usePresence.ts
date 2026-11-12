import { useEffect, useState } from "react";
import { request } from "../api";
import { listenToPresence } from "../live";

export type Member = { id: number; username: string; online: boolean };

type User = { id: number; username: string };

// The server announces connections but not departures: this poll is what turns
// someone "offline" after they close the site.
const ONLINE_POLL = 15000;
const USERS_POLL = 60000;

async function readUsers(response: Response | null): Promise<User[] | null> {
  if (!response?.ok) return null;
  try {
    return ((await response.json()) ?? []) as User[];
  } catch {
    return null;
  }
}

// Every account on the server, online first. Being online means having the site open:
// each visitor keeps a socket on the shared channel, and the server lists those sockets.
export function usePresence(token: string, channelId: number | undefined, me: string): Member[] {
  const [users, setUsers] = useState<User[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      const list = await readUsers(await request(token, "/users"));
      if (list && !cancelled) setUsers(list);
    }

    async function loadOnline() {
      if (channelId === undefined) return;
      const list = await readUsers(await request(token, `/channel/connected?channel=${channelId}`));
      if (list && !cancelled) setOnlineIds(new Set(list.map((user) => user.id)));
    }

    loadUsers();
    loadOnline();
    // A connection may come from a brand-new account, so the full list is reloaded too.
    const stopListening = listenToPresence(token, channelId, () => {
      loadOnline();
      loadUsers();
    });
    const onlineTimer = window.setInterval(loadOnline, ONLINE_POLL);
    const usersTimer = window.setInterval(loadUsers, USERS_POLL);
    return () => {
      cancelled = true;
      stopListening();
      window.clearInterval(onlineTimer);
      window.clearInterval(usersTimer);
    };
  }, [token, channelId]);

  return users
    // You are on the site even before the server has registered your socket.
    .map((user) => ({ ...user, online: onlineIds.has(user.id) || user.username === me }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username, "fr"));
}
