export type Channel = { id: number; name: string };

export function isDebate(channel: Channel) {
  return /#\d+$/.test(channel.name);
}

export function shownName(channel: Channel) {
  return channel.name.replace(/#\d+$/, "");
}

export const HIDDEN_CHANNELS: string[] = [];

export function workspacePath(channelId: number | string | undefined, debateId: number | string | undefined) {
  const channel = channelId === undefined ? "" : `/channel/${channelId}`;
  const debate = debateId === undefined ? "" : `/debate/${debateId}`;
  return channel + debate || "/";
}
