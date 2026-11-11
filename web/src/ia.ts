// Appel au relais IA du serveur Vite (voir web/ia/serveur.ts).
import type { ReactionValue } from "./types";

const DELAI_MAX = 6000;

// Style de branche déduit du message ; undefined si neutre ou si l'IA ne répond pas.
export async function devinerStyle(
  sujet: string,
  message: string,
  repondA: string | null,
): Promise<ReactionValue | undefined> {
  try {
    const rep = await fetch("/ia/style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sujet, message, repond_a: repondA }),
      signal: AbortSignal.timeout(DELAI_MAX),
    });
    const json = await rep.json().catch(() => ({}));
    if (!rep.ok) {
      console.log("style IA indisponible :", json.erreur ?? rep.status);
      return undefined;
    }
    return json.style === "none" ? undefined : json.style;
  } catch (erreur) {
    console.log("style IA indisponible :", (erreur as Error).message);
    return undefined;
  }
}
