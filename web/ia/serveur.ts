// Server side only (Vite dev server): the OpenAI key never reaches the browser.
// The front calls POST /ia/synthese, this module relays to OpenAI. On Vercel, api/synthese.ts does the same job.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { configDepuis, synthetiser, type DemandeSynthese } from "../api/_synthese.ts";

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
  const config = configDepuis(env);
  return {
    name: "conversus-ia",
    configureServer(server) {
      server.middlewares.use(async (req, res, suite) => {
        if (req.url?.split("?")[0] !== "/ia/synthese") return suite();
        if (req.method !== "POST") return repondre(res, 405, { erreur: "POST attendu" });
        const debut = Date.now();
        let demande: Partial<DemandeSynthese>;
        try {
          demande = await lireCorps(req);
        } catch (e) {
          return repondre(res, 400, { erreur: (e as Error).message });
        }
        const { code, corps } = await synthetiser(config, demande, req.headers.authorization);
        if (code === 200) server.config.logger.info(`[ia] synthèse (${config.modele}, ${Date.now() - debut} ms)`);
        else server.config.logger.error(`[ia] synthèse : ${corps.erreur}`);
        repondre(res, code, corps);
      });
    },
  };
}
