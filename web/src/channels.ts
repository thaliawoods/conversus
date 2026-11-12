import { request } from "./api";

export type Channel = { id: number; name: string };

// Label put on every ConVersus channel, in its "conversus" metadata. A ConVersus is a normal
// channel on the shared server, so other groups' apps list it too: they can recognise it
// (channel.metadata.conversus.type === "conversus") and hide it if they want.
export const CONVERSUS_METADATA = { type: "conversus" };

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

// Read-only channel: shared ConVersus syntheses land here, nobody writes in it.
// The server cannot forbid writing, so the app hides the composer and shows syntheses only.
export const SYNTHESIS_CHANNEL = "synthèses";

export function isSynthesis(message: { metadata?: { conversus?: { synthesisOf?: string } } }) {
  return message.metadata?.conversus?.synthesisOf !== undefined;
}

// Joins the synthesis channel, creating it first if nobody has yet (channel names are
// unique on the server, so two visitors creating it at once still end up in the same one).
export async function enterSynthesisChannel(token: string) {
  const entered = await request(token, "/channel/enter", { channel: SYNTHESIS_CHANNEL });
  if (entered?.ok || entered?.status === 401) return entered;
  await request(token, "/channel?namespace=conversus", { name: SYNTHESIS_CHANNEL, metadata: {} });
  return request(token, "/channel/enter", { channel: SYNTHESIS_CHANNEL });
}

// Messages posted by the server every 10 minutes.
export function isClockTick(message: { content: string }) {
  return message.content.startsWith("clock tick :");
}

export function workspacePath(channelId: number | string | undefined, debateId: number | string | undefined) {
  const channel = channelId === undefined ? "" : `/channel/${channelId}`;
  const debate = debateId === undefined ? "" : `/debate/${debateId}`;
  return channel + debate || "/";
}
