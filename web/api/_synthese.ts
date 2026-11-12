// Synthesis by OpenAI, shared by the Vite dev server (ia/serveur.ts) and the Vercel function (api/synthese.ts).
// Runs only on a server: the OpenAI key never reaches the browser.
// The underscore keeps Vercel from deploying this file as its own route.
import http from "node:http";
import https from "node:https";
import { rootCertificates } from "node:tls";

export type MessageDebat = { id: number; auteur: string; texte: string; repond_a: number | null; retenu: boolean };
export type DemandeSynthese = { sujet: string; messages: MessageDebat[] };

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

// autorises: usernames allowed to ask for a synthesis (each one costs OpenAI credits).
export type Config = { cle: string; modele: string; effort: string; api: string; autorises: string[] };

// Who may use the synthesis, unless SYNTHESE_AUTORISES says otherwise (comma-separated usernames).
// Keep in step with src/synthesis.ts, which only greys out the button.
const AUTORISES_PAR_DEFAUT = "thalia";
const API_PAR_DEFAUT = "https://gobelins-chat-api.leomouraire.com:4000";

function listeAutorises(valeur: string | undefined) {
  return (valeur || AUTORISES_PAR_DEFAUT)
    .split(",")
    .map((nom) => nom.trim().toLowerCase())
    .filter(Boolean);
}

export async function appelerOpenAI(config: Config, donnees: DemandeSynthese): Promise<string> {
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

export function configDepuis(env: Record<string, string | undefined>): Config {
  return {
    cle: env.OPENAI_API_KEY ?? "",
    modele: env.OPENAI_MODEL || "gpt-5.4-mini",
    effort: env.OPENAI_EFFORT || "low",
    api: env.CONVERSUS_API_URL || env.VITE_API_URL || API_PAR_DEFAUT,
    autorises: listeAutorises(env.SYNTHESE_AUTORISES || env.VITE_SYNTHESE_AUTORISES),
  };
}

// The chat server only sends its own certificate, without Let's Encrypt's intermediate one.
// Browsers fetch the missing link themselves, Node does not and refuses the connection
// (UNABLE_TO_VERIFY_LEAF_SIGNATURE). These two public certificates complete the chain:
// server → YE1 → Root YE (cross-signed by ISRG Root X2, which Node trusts).
// Downloaded from http://ye1.i.lencr.org/ (valid until 2028-09-02) and http://ye.i.lencr.org/ (until 2032-09-02).
// They can go once the server sends its full chain.
const LETS_ENCRYPT_YE1 = `-----BEGIN CERTIFICATE-----
MIICizCCAhGgAwIBAgIQXd1w3TH4AchcGGp6BLgK/jAKBggqhkjOPQQDAzAuMQsw
CQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZRTAeFw0y
NTA5MDMwMDAwMDBaFw0yODA5MDIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYwFAYD
VQQKEw1MZXQncyBFbmNyeXB0MQwwCgYDVQQDEwNZRTEwdjAQBgcqhkjOPQIBBgUr
gQQAIgNiAAQHZVB1/mimla2hfSurylScjPMZaOJXLz/NnAc2sylm8WDyhU9Ccp+z
ASQi5vSwGGJjSGklkD9fdPR8GpyDIOIjCEfrnbt/v+ZSEPLLEGbaM6EccDbN7p9x
teIm2Avf+ryjge4wgeswDgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUF
BwMBMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0OBBYEFLsgykcL/tflnPmPCSqj
jDdFsbzYMB8GA1UdIwQYMBaAFKPIJlqOoUzQNWP8myPIOq5W809WMDIGCCsGAQUF
BwEBBCYwJDAiBggrBgEFBQcwAoYWaHR0cDovL3llLmkubGVuY3Iub3JnLzATBgNV
HSAEDDAKMAgGBmeBDAECATAnBgNVHR8EIDAeMBygGqAYhhZodHRwOi8veWUuYy5s
ZW5jci5vcmcvMAoGCCqGSM49BAMDA2gAMGUCMQDgjUEahFT/h3DRakqiPZpLvPgf
Zwkt6K2EOMmh1nvEzl83eMLYcod4GCl3b0J1Nn0CMBNYmEQJb4CEG5WoOe7aRn/L
VKu6saHmHEynI7ysIPd8zQsK1HdmhlHKlw9Z5GpGvA==
-----END CERTIFICATE-----`;
const LETS_ENCRYPT_ROOT_YE = `-----BEGIN CERTIFICATE-----
MIICpjCCAiugAwIBAgIRAIchZfw0tuX7qK3Vs3BftTowCgYIKoZIzj0EAwMwTzEL
MAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2VhcmNo
IEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDIwHhcNMjYwNTEzMDAwMDAwWhcN
MzIwOTAyMjM1OTU5WjAuMQswCQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4G
A1UEAxMHUm9vdCBZRTB2MBAGByqGSM49AgEGBSuBBAAiA2IABDwS/6vhrcVqcbBo
+wgdI3fwn9x7DNJJOY/lTOti0vkwuRN87RhEhTH17E7XyFjWsPYhIPt/wzOqxTd2
b+4ZJNy9ID04YywF9U5zasDVyGSNErVNtz8uSGh5izW87j77GaOB6zCB6DAOBgNV
HQ8BAf8EBAMCAQYwEwYDVR0lBAwwCgYIKwYBBQUHAwEwDwYDVR0TAQH/BAUwAwEB
/zAdBgNVHQ4EFgQUo8gmWo6hTNA1Y/ybI8g6rlbzT1YwHwYDVR0jBBgwFoAUfEKW
rt5LSDv6kviejM9ti6lyN5UwMgYIKwYBBQUHAQEEJjAkMCIGCCsGAQUFBzAChhZo
dHRwOi8veDIuaS5sZW5jci5vcmcvMBMGA1UdIAQMMAowCAYGZ4EMAQIBMCcGA1Ud
HwQgMB4wHKAaoBiGFmh0dHA6Ly94Mi5jLmxlbmNyLm9yZy8wCgYIKoZIzj0EAwMD
aQAwZgIxAMU19WCtmxVND8UHBZRoma49Z7jPs64Dma0eTu1OChVbB/2J7GV3nvYK
Ax54uk1G9QIxAO0miLVJu8PLNiXXXkiE/gsK3CTRTF/aeo4bMX42Zw40csRU6AC2
6hSW1/IWaas6dg==
-----END CERTIFICATE-----`;
const agent = new https.Agent({ ca: [...rootCertificates, LETS_ENCRYPT_YE1, LETS_ENCRYPT_ROOT_YE] });

function lireProfil(url: string, autorisation: string): Promise<{ username?: string } | null> {
  return new Promise((ok) => {
    // A local API (http://localhost:4000) needs no certificate.
    const options = { headers: { Authorization: autorisation }, timeout: 8000 };
    const lire = (rep: http.IncomingMessage) => {
      let texte = "";
      rep.setEncoding("utf8");
      rep.on("data", (morceau) => (texte += morceau));
      rep.on("end", () => {
        if (rep.statusCode !== 200) return ok(null);
        try {
          ok(JSON.parse(texte));
        } catch {
          ok(null);
        }
      });
    };
    const req = url.startsWith("https:") ? https.get(url, { ...options, agent }, lire) : http.get(url, options, lire);
    req.on("timeout", () => req.destroy());
    req.on("error", (e) => {
      console.error(`[ia] /me injoignable : ${(e as NodeJS.ErrnoException).code ?? e.message}`);
      ok(null);
    });
  });
}

// Asks the chat server who owns this login token. The browser could lie about its name, the server cannot.
async function nomDe(config: Config, autorisation: string | null | undefined) {
  if (!autorisation?.startsWith("Bearer ")) return null;
  const profil = await lireProfil(`${config.api}/me`, autorisation);
  return profil?.username?.toLowerCase() ?? null;
}

// Checks who is asking and the request, asks OpenAI, and says which HTTP answer to give.
// autorisation: the "Authorization" header sent by the site (the chat server login token).
export async function synthetiser(config: Config, d: Partial<DemandeSynthese>, autorisation: string | null | undefined) {
  const nom = await nomDe(config, autorisation);
  if (nom === null) return { code: 401, corps: { erreur: "Connecte-toi pour faire une synthèse." } };
  if (!config.autorises.includes(nom)) {
    return { code: 403, corps: { erreur: `La synthèse est réservée à ${config.autorises.join(", ")}.` } };
  }
  if (!config.cle) return { code: 503, corps: { erreur: "OPENAI_API_KEY manquante" } };
  const messages = Array.isArray(d.messages) ? d.messages : [];
  if (messages.length === 0) return { code: 400, corps: { erreur: "Aucun message à synthétiser" } };
  try {
    const synthese = await appelerOpenAI(config, { sujet: String(d.sujet ?? ""), messages });
    return { code: 200, corps: { synthese } };
  } catch (e) {
    return { code: 502, corps: { erreur: (e as Error).message } };
  }
}
