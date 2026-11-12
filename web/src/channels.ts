export type Channel = { id: number; name: string };

export function isDebate(channel: Channel) {
  return /#\d+$/.test(channel.name);
}

// Name as shown on screen: without the "#<time>" of a ConVersus, first letter in capitals.
export function channelLabel(name: string) {
  const shown = name.replace(/#\d+$/, "");
  return shown.charAt(0).toUpperCase() + shown.slice(1);
}

export function shownName(channel: Channel) {
  return channelLabel(channel.name);
}

// "general" is shared by every group on the public server; the others are test ConVersus
// left there (names carry their creation time, so they are unique).
export const HIDDEN_CHANNELS: string[] = [
  "general",
  "heyy !#1794500233817",
  "Qui déteste Laïa ici ?#1794500886492",
  "test#1794476394832",
  "test#1794476395535",
  "clock tick : Thu Nov 12 09:33:28 UTC 2026#1794476407747",
];

// Channel where every group talks: its announced ConVersus are not joined automatically.
export const SHARED_CHANNEL = "general";

// Messages posted by the server every 10 minutes.
export function isClockTick(message: { content: string }) {
  return message.content.startsWith("clock tick :");
}

export function workspacePath(channelId: number | string | undefined, debateId: number | string | undefined) {
  const channel = channelId === undefined ? "" : `/channel/${channelId}`;
  const debate = debateId === undefined ? "" : `/debate/${debateId}`;
  return channel + debate || "/";
}
