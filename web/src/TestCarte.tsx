// Page de test (#test-carte) : un faux débat sans backend, pour voir le board, les fleurs et la synthèse.
// ?fane : débat ancien (fleur fanée) · ?vide : débat qui vient de commencer.
import { useState } from 'react'
import Jardin from './ecrans/Jardin'
import type { Avis, Debat, MsgConv, Position, SyntheseFaite } from './conversus'

type Ligne = [string, string, number | null, Position, number, number, string[], string[]]
// auteur, texte, répond à (index), position, énergie, il y a (minutes), likes, dislikes
const LIGNES: Ligne[] = [
  ['killian', 'non, si personne n’assume ce qu’il dit, ça va vite partir en vrille', null, 'desaccord', .6, 30, ['enzo'], ['thalia', 'maya']],
  ['thalia', 'moi je pense que oui, beaucoup de gens n’osent pas parler sinon', null, 'daccord', .7, 28, ['maya', 'clara', 'enzo'], []],
  ['maya', 'pareil que Thalia, en amphi personne ne lève la main', 1, 'daccord', .6, 25, ['thalia'], []],
  ['enzo', 'ça dépend du sujet, pour des retours sur les cours oui, pour le reste bof', null, 'neutre', .5, 22, [], []],
  ['clara', 'on pourrait laisser le choix à chaque message, comme ça tout le monde est content', 0, 'plutot_desaccord', .8, 20, ['thalia', 'maya', 'enzo', 'killian'], []],
  ['thalia', 'mais Killian, les messages méchants il y en a déjà avec les noms…', 0, 'desaccord', .7, 9, ['maya'], ['killian']],
  ['maya', 'et une modération ? genre on peut signaler un message anonyme', 4, 'plutot_daccord', .6, 3, [], []],
  ['killian', 'ok le choix par message, je peux vivre avec', 4, 'daccord', .5, .3, [], []],
]

function faux(depuis: number): Debat {
  const now = Date.now()
  const msgs: MsgConv[] = LIGNES.map(([qui, dit, parent, position, force, min, aime, rejete], i) => {
    const t = new Date(now - (min + depuis) * 60_000).toISOString()
    const avis: Avis = {}
    aime.forEach(n => { avis[n] = { v: 1, t } })
    rejete.forEach(n => { avis[n] = { v: -1, t } })
    return {
      id: i + 1, qui, dit, anonyme: false, mien: qui === 'killian',
      repondA: parent === null ? undefined : parent + 1,
      analyse: min < .5 ? undefined : { position, force },
      avis, pour: aime.length, contre: rejete.length, date: t,
    }
  })
  return {
    canalId: 1, canalNom: 'test', ouvertureId: 0, sujet: 'Anonymat par défaut',
    question: { qui: 'clara', dit: 'est-ce qu’on devrait rendre les messages anonymes par défaut ?' },
    these: 'Les messages devraient être anonymes par défaut.',
    source: { id: 2, nom: 'general' }, lanceur: 'clara', debut: now - 40 * 60_000,
    msgs, syntheses: [], brut: new Map(),
  }
}

export default function TestCarte() {
  const vide = location.search.includes('vide')
  const [debat, setDebat] = useState<Debat>(() => {
    const d = faux(location.search.includes('fane') ? 240 : 0)
    return vide ? { ...d, msgs: d.msgs.slice(0, 1) } : d
  })
  const [plein, setPlein] = useState(false)
  const synthese = async (ids: number[], portee: string): Promise<SyntheseFaite> => {
    await new Promise(r => setTimeout(r, 1200))
    const s: SyntheseFaite = {
      id: Date.now(), par: 'killian', date: new Date().toISOString(), ids, portee,
      synthese: {
        issue: 'partage',
        resume: 'Le groupe hésite entre l’anonymat pour libérer la parole et la responsabilité de signer ses messages. Un compromis émerge : laisser le choix à chaque message.',
        camps: [
          { titre: 'Libérer la parole', idee: 'L’anonymat aide les personnes qui n’osent pas parler.', auteurs: ['thalia', 'maya'],
            exemples: [{ id: 3, pourquoi: 'Un exemple vécu : personne ne lève la main en amphi.' }] },
          { titre: 'Assumer ses mots', idee: 'Sans nom, les messages risquent de devenir méchants.', auteurs: ['killian'],
            exemples: [{ id: 1, pourquoi: 'L’argument de départ : l’anonymat déresponsabilise.' },
                       { id: 6, pourquoi: 'L’objection : les messages méchants existent déjà avec les noms.' }] },
        ],
      },
    }
    setDebat(d => ({ ...d, syntheses: [...d.syntheses, s] }))
    return s
  }
  return (
    <div className="app" style={{ padding: '1rem' }}>
      <Jardin debat={debat} moi="killian" iaErreur={null} pleinEcran={plein} setPleinEcran={setPlein}
              onEcrire={() => null} onAvis={() => null} onSynthese={synthese} />
    </div>
  )
}
