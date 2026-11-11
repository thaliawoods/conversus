// Côté serveur uniquement (serveur de dev Vite) : la clé OpenAI ne part jamais dans le navigateur.
// Le front appelle POST /ia/style, ce module relaie vers OpenAI.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export const STYLES = ["leaf", "thorn", "wilt", "none"] as const;
export type Style = (typeof STYLES)[number];

type DemandeStyle = {
  sujet: string;
  message: string;
  repond_a: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["style"],
  properties: { style: { type: "string", enum: STYLES } },
};

const CONSIGNES = `Tu lis un message d'un ConVersus : un débat écrit entre étudiant·es, affiché comme une plante.
Chaque message fait pousser une branche. Tu choisis l'allure de cette branche selon ce que dit le message.
On te donne le sujet du débat, le message, et le message auquel il répond (null s'il répond directement au sujet).
Lis le registre familier, l'ironie, le second degré, les emojis et les fautes comme une personne attentive.

- leaf (feuille) : le message nourrit le débat. Il soutient, approuve, complète, apporte un argument, un exemple ou une idée constructive.
- thorn (épine) : le message pique. Il conteste, objecte, contredit, critique ou attaque.
- wilt (faner) : le message affaiblit l'échange. Il est résigné, défaitiste, méprisant, dévalorisant, hors sujet ou vide de sens.
- none : le message est neutre. Question simple, information factuelle, blague sans parti pris, apaisement.

Attention à l'ironie (« ouais génial… » est souvent une épine).`;

type Config = { cle: string; modele: string; effort: string };

async function appelerOpenAI(config: Config, donnees: DemandeStyle): Promise<Style> {
  const corps: Record<string, unknown> = {
    model: config.modele,
    messages: [
      { role: "developer", content: CONSIGNES },
      { role: "user", content: JSON.stringify(donnees) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "style_branche", strict: true, schema: SCHEMA } },
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
  const style = JSON.parse(msg.content).style;
  return STYLES.includes(style) ? style : "none";
}

function lireCorps(req: IncomingMessage): Promise<Partial<DemandeStyle>> {
  return new Promise((ok, ko) => {
    let s = "";
    req.on("data", (c) => {
      s += c;
      if (s.length > 1e5) ko(new Error("Requête trop grosse"));
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
        if (req.url?.split("?")[0] !== "/ia/style") return suite();
        if (req.method !== "POST") return repondre(res, 405, { erreur: "POST attendu" });
        if (!config.cle) return repondre(res, 503, { erreur: "OPENAI_API_KEY manquante dans web/.env.local" });
        const debut = Date.now();
        try {
          const d = await lireCorps(req);
          const style = await appelerOpenAI(config, {
            sujet: String(d.sujet ?? ""),
            message: String(d.message ?? ""),
            repond_a: d.repond_a ? String(d.repond_a) : null,
          });
          server.config.logger.info(`[ia] style ${style} (${config.modele}, ${Date.now() - debut} ms)`);
          repondre(res, 200, { style });
        } catch (e) {
          server.config.logger.error(`[ia] style : ${(e as Error).message}`);
          repondre(res, 502, { erreur: (e as Error).message });
        }
      });
    },
  };
}
