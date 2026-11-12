import type { Message } from "./pages/Chat";

export const PRONOUN_CHOICES = ["elle", "il", "iel"];

export function pronounsByName(messages: Message[], me?: string | null, mine?: string) {
  const found = new Map<string, string>();
  for (const message of [...messages].sort((a, b) => a.id - b.id)) {
    const conversus = message.metadata?.conversus;
    if (message.anonymous || conversus?.author || conversus?.pronouns === undefined) continue;
    found.set(message.user, conversus.pronouns);
  }
  if (me && mine) found.set(me, mine);
  return found;
}
