import { useEffect, useMemo, useState } from "react";
import { request } from "../api";
import { isClockTick, isDebate, isSynthesis, SYNTHESIS_CHANNEL, type Channel } from "../channels";
import { listenToChannel } from "../live";
import type { Message } from "../pages/Chat";

// Backup in case a socket is down.
const UNREAD_POLL = 30000;
const READ_KEY = "conversus-read:";

// Per channel: ids of the messages that can count as unread, and the newest id seen.
type Seen = { countable: number[]; newest: number };
// Per channel id: id of the last message read.
type ReadMarks = Record<string, number>;

// Read marks belong to the account, not to the browser: logging in as someone else
// brings back that person's own unread counts.
function loadMarks(username: string): ReadMarks {
  if (!username) return {};
  try {
    return JSON.parse(localStorage.getItem(READ_KEY + username) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function saveMarks(username: string, marks: ReadMarks) {
  if (!username) return;
  try {
    localStorage.setItem(READ_KEY + username, JSON.stringify(marks));
  } catch {
  }
}

// What the channel panel shows, minus your own messages.
function countable(channel: Channel, message: Message, me: string) {
  if (isClockTick(message)) return false;
  if (channel.name === SYNTHESIS_CHANNEL && !isSynthesis(message)) return false;
  return message.anonymous || message.user !== me;
}

// Number of unread messages in each channel (ConVersus excluded). The open channel
// counts as read. The server returns the last 100 messages, enough to show "99+".
export function useUnread(token: string, username: string, channels: Channel[], openId: number | undefined) {
  const [seen, setSeen] = useState<Record<string, Seen>>({});
  const [marks, setMarks] = useState<{ user: string; read: ReadMarks }>(() => ({ user: username, read: loadMarks(username) }));
  if (marks.user !== username) setMarks({ user: username, read: loadMarks(username) });

  const rooms = useMemo(() => channels.filter((channel) => !isDebate(channel)), [channels]);
  // Re-subscribe only when the list of rooms really changes.
  const roomsKey = rooms.map((room) => `${room.id}:${room.name}`).join(",");

  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    async function load(room: Channel) {
      const response = await request(token, `/channel/message?channel=${room.id}&namespace=conversus`);
      if (!response?.ok) return;
      let messages: Message[];
      try {
        messages = (await response.json()) ?? [];
      } catch {
        return;
      }
      if (cancelled) return;
      const entry: Seen = {
        countable: messages.filter((message) => countable(room, message, username)).map((message) => message.id),
        newest: Math.max(0, ...messages.map((message) => message.id)),
      };
      setSeen((current) => ({ ...current, [room.id]: entry }));
    }

    const loadAll = () => rooms.forEach(load);
    loadAll();
    const stops = rooms.map((room) => listenToChannel(token, room.id, () => load(room)));
    const timer = window.setInterval(loadAll, UNREAD_POLL);
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
      window.clearInterval(timer);
    };
    // roomsKey stands for rooms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, username, roomsKey]);

  // The open channel is read up to its newest message, including ones arriving while it is open.
  const openNewest = openId === undefined ? undefined : seen[openId]?.newest;
  useEffect(() => {
    if (openId === undefined || openNewest === undefined || !username) return;
    setMarks((current) => {
      if (current.user !== username || (current.read[openId] ?? -1) >= openNewest) return current;
      const read = { ...current.read, [openId]: openNewest };
      saveMarks(username, read);
      return { user: username, read };
    });
  }, [openId, openNewest, username]);

  // A channel never seen on this account starts from zero: only messages arriving afterwards count
  // (otherwise a new account would see "99+" on every channel already filled).
  useEffect(() => {
    if (!username) return;
    setMarks((current) => {
      if (current.user !== username) return current;
      const fresh = Object.entries(seen).filter(([id]) => current.read[id] === undefined);
      if (fresh.length === 0) return current;
      const read = { ...current.read };
      for (const [id, entry] of fresh) read[id] = entry.newest;
      saveMarks(username, read);
      return { user: username, read };
    });
  }, [seen, username]);

  return useMemo(() => {
    const unread = new Map<number, number>();
    for (const room of rooms) {
      const entry = seen[room.id];
      if (!entry || room.id === openId) continue;
      const lastRead = marks.read[room.id];
      // No mark yet: the effect above is about to start this channel from zero.
      if (lastRead === undefined) continue;
      const count = entry.countable.filter((id) => id > lastRead).length;
      if (count > 0) unread.set(room.id, count);
    }
    return unread;
  }, [rooms, seen, marks, openId]);
}

// "99+" past 99, as the server only returns the last 100 messages anyway.
export function unreadLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}
