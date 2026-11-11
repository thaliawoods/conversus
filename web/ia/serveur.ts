// Server side only (Vite dev server): the OpenAI key never reaches the browser.
// The front calls POST /ia/synthese, this module relays to OpenAI. Taken from Kilian's branch (killian-11-11).
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

type MessageDebat = { id: number; auteur: string; texte: string; repond_a: number | null; retenu: boolean };
type DemandeSynthese = { sujet: string; messages: MessageDebat[] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["synthese"],
  properties: { synthese: { type: "string" } },
};

const CONSIGNES = `Tu lis un ConVersus : un débat écrit entre étudiant·es, affiché comme une plante qui pousse depuis le sujet.
On te donne le sujet et les messages (id, auteur, texte, id du message auquel il répond, null s'il répond au sujet).
Si certains messages sont marqués retenu: true, la synthèse porte sur ceux-là ; les autres servent seulement de contexte.

Écris une synthèse neutre en français, de 3 à 6 phrases :
- les positions en présence et leurs arguments principaux ;
- les points d'accord, s'il y en a, et ce qui reste ouvert.
Le débat n'est pas fini : ne tranche pas, ne conclus pas à la place des participant·es.
Pas de liste, pas de titre, pas de tiret long. Cite un prénom seulement s'il aide à suivre.`;

type Config = { cle: string; modele: string; effort: string };

async function appelerOpenAI(config: Config, donnees: DemandeSynthese): Promise<string> {
  const corps: Record<string, unknown> = {
    model: config.modele,
    messages: [
      { role: "developer", content: CONSIGNES },
      { role: "user", content: JSON.stringify(donnees) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "synthese_debat", strict: true, schema: SCHEMA } },
  };
  if (/^(gpt-5|o\d)/.test(config.modele)) corps.reasoning_effort = config.effort;

  const rep = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.cle}` },
    body: JSON.stringify(corps),
  });
  const json = (await rep.json()) as {
    error?: { message: string };
    choices?: { message: { content: string; refusal?: string } }[];
  };
  if (!rep.ok || !json.choices) throw new Error(json.error?.message ?? `OpenAI a répondu ${rep.status}`);
  const msg = json.choices[0].message;
  if (msg.refusal) throw new Error(`Refus du modèle : ${msg.refusal}`);
  return String(JSON.parse(msg.content).synthese ?? "");
}

function lireCorps(req: IncomingMessage): Promise<Partial<DemandeSynthese>> {
  return new Promise((ok, ko) => {
    let s = "";
    req.on("data", (c) => {
      s += c;
      // A debate is at most 100 messages: 200 kB is plenty.
      if (s.length > 2e5) ko(new Error("Requête trop grosse"));
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(s || "{}"));
      } catch (e) {
        ko(e);
      }
    });
    req.on("error", ko);
  });
}

function repondre(res: ServerResponse, code: number, corps: unknown) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corps));
}

export function pluginIA(env: Record<string, string>): Plugin {
  const config: Config = {
    cle: env.OPENAI_API_KEY ?? "",
    modele: env.OPENAI_MODEL || "gpt-5.4-mini",
    effort: env.OPENAI_EFFORT || "low",
  };
  return {
    name: "conversus-ia",
    configureServer(server) {
      server.middlewares.use(async (req, res, suite) => {
        if (req.url?.split("?")[0] !== "/ia/synthese") return suite();
        if (req.method !== "POST") return repondre(res, 405, { erreur: "POST attendu" });
        if (!config.cle) return repondre(res, 503, { erreur: "OPENAI_API_KEY manquante dans web/.env.local" });
        const debut = Date.now();
        try {
          const d = await lireCorps(req);
          const messages = Array.isArray(d.messages) ? d.messages : [];
          if (messages.length === 0) return repondre(res, 400, { erreur: "Aucun message à synthétiser" });
          const synthese = await appelerOpenAI(config, { sujet: String(d.sujet ?? ""), messages });
          server.config.logger.info(`[ia] synthèse de ${messages.length} messages (${config.modele}, ${Date.now() - debut} ms)`);
          repondre(res, 200, { synthese });
        } catch (e) {
          server.config.logger.error(`[ia] synthèse : ${(e as Error).message}`);
          repondre(res, 502, { erreur: (e as Error).message });
        }
      });
    },
  };
}
