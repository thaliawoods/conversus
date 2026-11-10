// Appels au relais d'analyse du serveur Vite (voir web/ia/serveur.ts).
import type { Analyse, Debat, Synthese } from './conversus'

async function appel<T>(route: string, corps: unknown): Promise<T> {
  const rep = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const json = await rep.json().catch(() => ({}))
  if (!rep.ok) throw new Error(json.erreur ?? `analyse indisponible (${rep.status})`)
  return json as T
}

const versIA = (d: Debat, garder?: Set<number>) => d.msgs.filter(m => !garder || garder.has(m.id)).map(m => ({
  id: m.id,
  auteur: m.qui,
  texte: m.dit,
  repond_a: m.repondA ?? null,
  position: m.analyse?.position ?? null,
  pour: m.pour,
  contre: m.contre,
}))

const question = (d: Debat) => ({ auteur: d.question.qui, texte: d.question.dit })

export const analyser = (d: Debat, ids: number[]) =>
  appel<{ these: string; analyses: (Analyse & { id: number })[] }>('/ia/analyse', {
    sujet: d.sujet, question: question(d), these: d.these, messages: versIA(d), a_analyser: ids,
  })

export const synthetiser = (d: Debat, ids: number[], portee: string) =>
  appel<Synthese>('/ia/synthese', {
    sujet: d.sujet, question: question(d), these: d.these ?? '', portee, messages: versIA(d, new Set(ids)),
  })
