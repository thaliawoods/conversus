// Client du backend commun (api Go). Toutes nos métadonnées vivent sous le namespace « conversus ».
export const API = (import.meta.env?.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'
export const NAMESPACE = 'conversus'

export type CanalApi = { id: number; name: string; creation_date: string }
export type MoiApi   = { id: number; username: string; channels: CanalApi[] | null }
export type MessageApi = {
  id: number
  content: string
  user_id: number
  user: string
  anonymous: boolean
  creation_date: string
  posted_at: string
  metadata: Record<string, unknown> | null
}

export class ErreurApi extends Error {
  statut: number
  constructor(statut: number, message: string) { super(message); this.statut = statut }
}

async function appel<T>(chemin: string, options: { methode?: string; jeton?: string | null; corps?: unknown; texte?: boolean } = {}): Promise<T> {
  // Namespace en paramètre d'URL et pas en en-tête : le CORS du backend n'autorise que Content-Type et Authorization.
  const url = API + chemin + (chemin.includes('?') ? '&' : '?') + 'namespace=' + NAMESPACE
  const rep = await fetch(url, {
    method: options.methode ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
    },
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
  })
  if (!rep.ok) throw new ErreurApi(rep.status, `${options.methode ?? 'GET'} ${chemin} → ${rep.status}`)
  return (options.texte ? rep.text() : rep.json()) as Promise<T>
}

export const connexion  = (username: string, password: string) =>
  appel<string>('/login', { methode: 'POST', corps: { username, password }, texte: true })

export const inscription = (username: string, password: string) =>
  appel<unknown>('/user', { methode: 'POST', corps: { username, password } })

export const moi = (jeton: string) => appel<MoiApi>('/me', { jeton })

// Le backend renvoie les 100 derniers, du plus récent au plus ancien : on remet dans l'ordre.
export const messages = async (jeton: string, canal: number) =>
  ((await appel<MessageApi[] | null>(`/channel/message?channel=${canal}`, { jeton })) ?? []).reverse()

// Toujours envoyer des métadonnées : sans elles le backend refuse le message (colonne NOT NULL).
export const poster = (jeton: string, canal: number, contenu: string, meta: object, anonyme = false) =>
  appel<MessageApi>('/channel/message', { methode: 'POST', jeton, corps: { content: contenu, channel: canal, metadata: meta, anonymous: anonyme } })

// Contenu vide = seules les métadonnées changent (elles remplacent tout notre namespace).
export const editerMeta = (jeton: string, id: number, meta: object) =>
  appel<MessageApi>('/channel/message', { methode: 'PUT', jeton, corps: { id, content: '', metadata: meta } })

export const creerCanal = (jeton: string, nom: string, meta: object) =>
  appel<CanalApi>('/channel', { methode: 'POST', jeton, corps: { name: nom, metadata: meta } })

export const entrer = (jeton: string, nom: string) =>
  appel<CanalApi>('/channel/enter', { methode: 'POST', jeton, corps: { channel: nom } })

export const metaDe = <T extends object>(m: MessageApi): Partial<T> =>
  ((m.metadata?.[NAMESPACE] ?? {}) as Partial<T>)
