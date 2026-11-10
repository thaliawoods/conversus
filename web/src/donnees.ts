
import type { Reaction } from './emotions'
export type Personne = {
  nom: string
  pronom: string
  couleur: string
  enLigne: boolean
}

export const GENS: Record<string, Personne> = {
  Clara:   { nom: 'Clara',   pronom: 'elle',       couleur: '#8b5fd6', enLigne: true  },
  Killian: { nom: 'Killian', pronom: 'il',         couleur: '#5f8bd6', enLigne: true  },
  Thalia:  { nom: 'Thalia',  pronom: 'elle',       couleur: '#b06ae0', enLigne: true  },
  Maya:    { nom: 'Maya',    pronom: 'iel',        couleur: '#6ad6b0', enLigne: true  },
  Enzo:    { nom: 'Enzo',    pronom: 'il',         couleur: '#d6a05f', enLigne: false },
  Adrien:  { nom: 'Adrien',  pronom: 'il',         couleur: '#d65f8b', enLigne: true  },
  Sacha:   { nom: 'Sacha',   pronom: 'iel · ellui', couleur: '#5fd6c4', enLigne: false },
}

// Les vrais comptes du backend n'ont ni pronom ni couleur : couleur stable tirée du nom.
const TEINTES = ['#8b5fd6', '#5f8bd6', '#b06ae0', '#6ad6b0', '#d6a05f', '#d65f8b', '#5fd6c4', '#9d7be0', '#e0846a']
export function personne(nom: string): Personne {
  if (GENS[nom]) return GENS[nom]
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { nom, pronom: '', couleur: nom === 'anonyme' ? '#9aa0b8' : TEINTES[h % TEINTES.length], enLigne: true }
}

export type Message = { id:number; qui:string; dit:string; heure:string; anonyme?:boolean }
export type Canal   = { id:string; nom:string; messages:Message[] }

export type Role = 'debat' | 'spectacle'
export const ROLES: { id:Role; nom:string; aide:string }[] = [
  { id:'debat',     nom:'Débattant·e',    aide:'Tu prends position et tu écris.' },
  { id:'spectacle', nom:'Spectateur·ice', aide:'Tu regardes les racines pousser sans écrire.' },
]

export const DUREES = [3, 5, 10, 20]

export const CANAUX: Canal[] = [
  {
    id:'general', nom:'Général',
    messages:[
      { id:1, qui:'Clara',   dit:'bon, question sérieuse',           heure:'11:02' },
      { id:2, qui:'Clara',   dit:'pain au choc ou chocolatine ?',    heure:'11:02' },
      { id:3, qui:'Killian', dit:'pain au choc, évidemment',         heure:'11:03' },
      { id:4, qui:'Thalia',  dit:"chocolatine, et j'assume",         heure:'11:03' },
      { id:5, qui:'Maya',    dit:'chocolatine aussi, désolée',       heure:'11:04' },
      { id:6, qui:'Killian', dit:"c'est le nom correct, c'est tout", heure:'11:04' },
      { id:7, qui:'Enzo',    dit:"ça dépend d'où tu viens, non ?",   heure:'11:05' },
      { id:8, qui:'Clara',   dit:"on se calme, c'est juste du pain", heure:'11:05' },
    ],
  },
  {
    id:'lead-crea', nom:'Lead créa',
    messages:[
      { id:20, qui:'Maya',   dit:'les logos avancent',       heure:'09:40' },
      { id:21, qui:'Thalia', dit:'les ronces sont parfaites', heure:'09:42' },
      { id:22, qui:'Adrien', dit:'on garde le dégradé ?',     heure:'09:44' },
    ],
  },
  {
    id:'lead-tech', nom:'Lead tech',
    messages:[
      { id:30, qui:'Killian', dit:"l'API ne gère que les channels", heure:'10:10' },
      { id:31, qui:'Thalia',  dit:'on simule le reste côté front',  heure:'10:12' },
    ],
  },
]

export const POLICE_NEUTRE = 'Tremplin'

export const POLICES_LISIBLES = [
  { id:'Tremplin',  nom:'Tremplin' },
  { id:'OpenSans',  nom:'BBB Open Sans' },
  { id:'PoppinsTN', nom:'BBB Poppins TN' },
  { id:'LigaSans',  nom:'Liga Sans' },
  { id:'Coxinelle', nom:'Coxinelle' },
]

export const PROFIL = {
  pseudo:'thalia_woods',
  pronom:'elle',
  ligne:'Promo 2026 · lead chocolatine',
  bio:"Étudiante en design, je teste des polices toute la journée.",
  stats:[
    { n:12, quoi:'ConVersus' },
    { n:8,  quoi:'messages retenus' },
    { n:5,  quoi:'changements d’avis' },
  ],
}

export const EMOJIS = ['🥐','🍫','🔥','😭','😤','✨','👀','💜','🙃','🤝','🌹','⭐']

export const EFFETS = [
  { id:'',        nom:'Aucun'       },
  { id:'tremble', nom:'Tremblement' },
  { id:'ondule',  nom:'Ondulation'  },
  { id:'respire', nom:'Respiration' },
]

export const SPECTATEURS_DEMO = ['Adrien', 'Sacha']

const r = (qui: string, emotion: Reaction['emotion'], anonyme = false): Reaction => ({ qui, emotion, anonyme })

export const REACTIONS_DEMO: Record<number, Reaction[]> = {
  2: [r('Enzo', 'surprise'), r('Maya', 'joie')],
  3: [r('Thalia', 'colere'), r('Maya', 'colere'), r('Clara', 'joie')],
  4: [r('Maya', 'joie'), r('Enzo', 'joie'), r('Adrien', 'joie', true), r('Killian', 'colere')],
  6: [r('Maya', 'colere'), r('Thalia', 'colere'), r('Enzo', 'colere'), r('Clara', 'tristesse'), r('Sacha', 'surprise', true)],
  7: [r('Killian', 'tristesse'), r('Clara', 'joie')],
  8: [r('Thalia', 'joie'), r('Maya', 'joie'), r('Enzo', 'joie'), r('Killian', 'joie'), r('Adrien', 'joie'), r('Sacha', 'joie')],
}

export const REPONSES_DEMO: { id: number; qui: string; dit: string; repondA: number }[] = [
  { id: 101, qui: 'Killian', dit: 'non, ça dépend de qui a raison', repondA: 7 },
  { id: 102, qui: 'Maya',    dit: 'donc de moi',                     repondA: 101 },
  { id: 103, qui: 'Clara',   dit: "assumer, c'est déjà beaucoup",    repondA: 4 },
]

export const REACTIONS_REPONSES_DEMO: Record<number, Reaction[]> = {
  101: [r('Enzo', 'colere'), r('Clara', 'surprise')],
  102: [r('Killian', 'tristesse'), r('Enzo', 'joie'), r('Sacha', 'joie', true)],
  103: [r('Maya', 'joie')],
}
