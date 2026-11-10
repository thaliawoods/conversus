// Côté serveur uniquement (serveur de dev Vite) : la clé OpenAI ne part jamais dans le navigateur.
// Le front appelle POST /ia/analyse et POST /ia/synthese, ce module relaie vers OpenAI.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

export const POSITIONS = ['daccord', 'plutot_daccord', 'neutre', 'plutot_desaccord', 'desaccord'] as const
export const ISSUES = ['consensus', 'majorite_pour', 'majorite_contre', 'partage', 'sans_conclusion'] as const

export type MessageIA = {
  id: number
  auteur: string
  texte: string
  // Le message auquel il répond (fil de la carte), null = idée posée directement sur la question.
  repond_a: number | null
  // Lecture déjà faite, pour le contexte.
  position?: string | null
  // Likes / dislikes reçus.
  pour?: number
  contre?: number
}

export type DemandeAnalyse = {
  sujet: string
  question: { auteur: string; texte: string }
  these?: string
  messages: MessageIA[]
  a_analyser: number[]
}

export type DemandeSynthese = {
  sujet: string
  question: { auteur: string; texte: string }
  these: string
  portee: string
  messages: MessageIA[]
}

const nombre = { type: 'number' } as const

const SCHEMA_ANALYSE = {
  type: 'object',
  additionalProperties: false,
  required: ['these', 'analyses'],
  properties: {
    these: { type: 'string' },
    analyses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'position', 'force'],
        properties: {
          id: { type: 'integer' },
          position: { type: 'string', enum: POSITIONS },
          force: nombre,
        },
      },
    },
  },
}

const SCHEMA_SYNTHESE = {
  type: 'object',
  additionalProperties: false,
  required: ['raison', 'issue', 'resume', 'camps'],
  properties: {
    raison: { type: 'string' },
    issue: { type: 'string', enum: ISSUES },
    resume: { type: 'string' },
    camps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titre', 'idee', 'auteurs', 'exemples'],
        properties: {
          titre: { type: 'string' },
          idee: { type: 'string' },
          auteurs: { type: 'array', items: { type: 'string' } },
          exemples: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'pourquoi'],
              properties: { id: { type: 'integer' }, pourquoi: { type: 'string' } },
            },
          },
        },
      },
    },
  },
}

const CONSIGNES_ANALYSE = `Tu lis un ConVersus : un débat écrit entre étudiant·es, affiché comme une carte mentale.
Au centre, la question. Chaque message est soit une idée posée directement sur la question (repond_a = null), soit une réponse à un autre message (repond_a = son id).
Lis le registre familier, l'ironie, le second degré, les emojis et les fautes comme une personne attentive.

1. these : si aucune thèse n'est fournie, formule en une phrase courte une affirmation claire et discutable tirée de la question : pour une question fermée (« faut-il X ? », « est-ce qu'on devrait X ? »), la thèse est toujours la réponse oui (« Il faut X ») ; pour « A ou B ? », c'est « C'est A ». Sinon recopie-la telle quelle.

Pour chaque id de « a_analyser » :
2. position : son accord avec sa cible (le message repond_a, ou la thèse si repond_a est null).
   daccord = soutient clairement · plutot_daccord = soutient avec nuance · neutre = ni l'un ni l'autre, question, blague, apaisement · plutot_desaccord = conteste avec nuance · desaccord = s'oppose clairement.
   Attention aux doubles négations et à l'ironie (« ouais génial… » est souvent un désaccord).
3. force : 0 à 1, l'énergie du message. 0.1 = réaction vide (« lol », « ok »), 0.4 = avis sans justification, 0.7 = avis argumenté ou exemple concret, 0.9+ = argument décisif.`

const CONSIGNES_SYNTHESE = `Tu fais la synthèse d'une partie d'un ConVersus : un débat écrit entre étudiant·es, en carte mentale.
On te donne la question, la thèse, et les messages retenus pour la synthèse (« portee » dit lesquels : tout le débat ou un fil). Chaque message a son auteur, le message auquel il répond (repond_a), sa position lue par rapport à sa cible, et ses likes (pour) et dislikes (contre) reçus des autres participant·es.
Écris une synthèse juste, sans prendre parti, qui rend compte de ce qui a vraiment été dit. Un message très aimé pèse davantage, un message très rejeté moins.

- raison : 2 à 3 phrases sur l'équilibre réel des échanges.
- issue : consensus · majorite_pour (la majorité soutient la thèse) · majorite_contre · partage · sans_conclusion (trop peu d'échanges ou hors sujet).
- resume : 2 à 4 phrases, au présent, qui racontent les échanges.
- camps : 1 à 3 camps, avec un titre court (3 à 5 mots), l'idée principale en une phrase, et les auteurs (noms exacts, « anonyme » si besoin).
  Pour chaque camp, exemples : 1 ou 2 messages (leur id) qui illustrent le mieux cette idée, pour que le lecteur comprenne concrètement ce qui a été dit ; avec « pourquoi » : en 15 mots maximum, ce que ce message apporte au camp (un argument, un exemple vécu, une objection…). Choisis des messages différents d'un camp à l'autre, de préférence argumentés ou appréciés.

Réponds en français.`

type Config = { cle: string; modele: string; effort: string }

async function appelerOpenAI(config: Config, consignes: string, donnees: unknown, nom: string, schema: object) {
  const corps: Record<string, unknown> = {
    model: config.modele,
    messages: [
      { role: 'developer', content: consignes },
      { role: 'user', content: JSON.stringify(donnees) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: nom, strict: true, schema } },
  }
  if (/^(gpt-5|o\d)/.test(config.modele)) corps.reasoning_effort = config.effort

  const rep = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.cle}` },
    body: JSON.stringify(corps),
  })
  const json = await rep.json() as { error?: { message: string }; choices?: { message: { content: string; refusal?: string } }[] }
  if (!rep.ok || !json.choices) throw new Error(json.error?.message ?? `OpenAI a répondu ${rep.status}`)
  const msg = json.choices[0].message
  if (msg.refusal) throw new Error(`Refus du modèle : ${msg.refusal}`)
  return JSON.parse(msg.content)
}

const borne = (x: unknown) => Math.max(0, Math.min(1, Number(x) || 0))

export async function analyser(config: Config, d: DemandeAnalyse) {
  const r = await appelerOpenAI(config, CONSIGNES_ANALYSE, d, 'analyse_conversus', SCHEMA_ANALYSE)
  const demandes = new Set(d.a_analyser)
  const analyses = (r.analyses as Record<string, any>[])
    .filter(a => demandes.has(a.id))
    .map(a => ({
      id: a.id as number,
      position: POSITIONS.includes(a.position) ? a.position : 'neutre',
      force: borne(a.force),
    }))
  return { these: d.these || String(r.these ?? ''), analyses }
}

export async function synthetiser(config: Config, d: DemandeSynthese) {
  const r = await appelerOpenAI(config, CONSIGNES_SYNTHESE, d, 'synthese_conversus', SCHEMA_SYNTHESE)
  const ids = new Set(d.messages.map(m => m.id)), cites = new Set<number>()
  return {
    issue: ISSUES.includes(r.issue) ? r.issue : 'sans_conclusion',
    resume: String(r.resume ?? ''),
    camps: (r.camps ?? []).slice(0, 3).map((c: any) => ({
      titre: String(c.titre ?? ''),
      idee: String(c.idee ?? ''),
      auteurs: (c.auteurs ?? []).map(String),
      // Seulement des messages qui font partie de la synthèse, chacun une seule fois.
      exemples: (c.exemples ?? []).filter((e: any) => ids.has(e.id) && !cites.has(e.id) && cites.add(e.id))
        .slice(0, 2).map((e: any) => ({ id: e.id as number, pourquoi: String(e.pourquoi ?? '') })),
    })),
  }
}

function lireCorps(req: IncomingMessage): Promise<any> {
  return new Promise((ok, ko) => {
    let s = ''
    req.on('data', c => { s += c; if (s.length > 2e6) ko(new Error('Requête trop grosse')) })
    req.on('end', () => { try { ok(JSON.parse(s || '{}')) } catch (e) { ko(e) } })
    req.on('error', ko)
  })
}

function repondre(res: ServerResponse, code: number, corps: unknown) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(corps))
}

export function pluginIA(env: Record<string, string>): Plugin {
  const config: Config = {
    cle: env.OPENAI_API_KEY ?? '',
    modele: env.OPENAI_MODEL || 'gpt-5.4-mini',
    effort: env.OPENAI_EFFORT || 'low',
  }
  const routes: Record<string, (c: Config, d: any) => Promise<unknown>> = {
    '/ia/analyse': analyser,
    '/ia/synthese': synthetiser,
  }
  return {
    name: 'conversus-ia',
    configureServer(server) {
      server.middlewares.use(async (req, res, suite) => {
        const route = routes[req.url?.split('?')[0] ?? '']
        if (!route) return suite()
        if (req.method !== 'POST') return repondre(res, 405, { erreur: 'POST attendu' })
        if (!config.cle) return repondre(res, 503, { erreur: 'OPENAI_API_KEY manquante dans web/.env.local' })
        const debut = Date.now()
        try {
          const r = await route(config, await lireCorps(req))
          server.config.logger.info(`[ia] ${req.url} ${config.modele} ${Date.now() - debut} ms`)
          repondre(res, 200, r)
        } catch (e) {
          server.config.logger.error(`[ia] ${req.url} : ${(e as Error).message}`)
          repondre(res, 502, { erreur: (e as Error).message })
        }
      })
    },
  }
}
