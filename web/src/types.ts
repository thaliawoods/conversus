export type ReactionValue = "leaf" | "thorn" | "wilt";

export type Channel = { id: number; name: string };

export type Message = {
  id: number;
  content: string;
  user: string;
  anonymous?: boolean;
  creation_date?: string;
  posted_at?: string;
  metadata?: {
    conversus?: {
      channelName?: string;
      author?: string;
      replyTo?: number;
      font?: string;
      effect?: ReactionValue;
      reactTo?: number;
      value?: ReactionValue;
    };
  } | null;
};

// Un ConVersus est un channel dont le nom finit par « #horodatage ».
export function isDebate(channel: { name: string }) {
  return /#\d+$/.test(channel.name);
}

export function debateLabel(name: string) {
  return name.replace(/#\d+$/, "");
}
