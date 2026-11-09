import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as Pointeur } from 'react'
import { Etoile, EtoileMini } from './Etoile'
import { GENS } from './donnees'
import type { MsgConv } from './App'
import { EMOTIONS, compter, styleDe, teintes, type Emotion } from './emotions'
import Ambiance, { useCoup } from './Ambiance'
import { brinD, contourBranche, membre, onduler } from './contour'

type Props = {
  msgs: MsgConv[]
  audience: number
  moi: string
  question: { qui: string; dit: string } | null
  fige?: boolean
  peutRepondre?: boolean
  vise?: { id: number; n: number } | null
  onReagir?: (id: number, emotion: Emotion | null, anonyme: boolean) => void
  onEpingler?: (id: number) => void
  onRepondre?: (id: number) => void
  onDeplacer?: (id: number, vers?: number) => void
}

const FOND: Record<Emotion | 'repos', string> = {
  repos: '#f1f0fa', joie: '#e2cff7', colere: '#f2cbd3', tristesse: '#cfd6ea', surprise: '#f4d2cf',
}

// Parcours en profondeur : chaque réponse juste sous son message d'origine.
type Place = { m: MsgConv; cote: 'gauche' | 'droite'; parent: MsgConv | null }
function disposer(msgs: MsgConv[]): Place[] {
  const rang    = new Map(msgs.map((m, i) => [m.id, i]))
  const ids     = new Set(msgs.map(m => m.id))
  const enfants = new Map<number, MsgConv[]>()
  const racines: MsgConv[] = []
  for (const m of msgs) {
    if (m.repondA !== undefined && ids.has(m.repondA)) {
      enfants.set(m.repondA, [...(enfants.get(m.repondA) ?? []), m])
    } else {
      racines.push(m)
    }
  }
  const places: Place[] = []
  const descendre = (m: MsgConv, cote: Place['cote'], parent: MsgConv | null) => {
    places.push({ m, cote, parent })
    for (const e of enfants.get(m.id) ?? []) descendre(e, cote, m)
  }
  racines.forEach(m => descendre(m, rang.get(m.id)! % 2 ? 'gauche' : 'droite', null))
  return places
}

export function descendance(msgs: MsgConv[], id: number): Set<number> {
  const d = new Set<number>()
  let encore = true
  while (encore) {
    encore = false
    for (const m of msgs) {
      if (m.repondA !== undefined && (m.repondA === id || d.has(m.repondA)) && !d.has(m.id)) {
        d.add(m.id)
        encore = true
      }
    }
  }
  return d
}

export default function Arbre({
  msgs, audience, moi, question, fige = false, peutRepondre = false, vise = null, onReagir, onEpingler, onRepondre, onDeplacer,
}: Props) {
  const [ouvert, setOuvert] = useState<number | null>(null)

  const [deplace, setDeplace] = useState<{ id: number; glisse: boolean; x: number; y: number } | null>(null)
  const [survol, setSurvol]   = useState<number | 'tronc' | null>(null)
  const permis = (id: number, cible: number | 'tronc') => {
    const m = msgs.find(x => x.id === id)
    if (!m) return false
    if (cible === 'tronc') return m.repondA !== undefined
    return cible !== id && cible !== m.repondA && !descendance(msgs, id).has(cible)
  }
  const partent = deplace ? new Set([deplace.id, ...descendance(msgs, deplace.id)]) : null
  const annuler = () => { setDeplace(null); setSurvol(null) }
  const sousLePointeur = (x: number, y: number) => {
    const c = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cible]')?.dataset.cible
    return c === undefined ? null : c === 'tronc' ? 'tronc' : Number(c)
  }

  const places   = disposer(msgs)
  const sol      = places.length + 1
  const geos     = new Map(msgs.map(m => [m.id, geometrie(m, audience)]))
  const bases = new Map<number, number>()
  for (const p of places) {
    bases.set(p.m.id, p.parent ? bases.get(p.parent.id)! + geos.get(p.parent.id)!.pts[ATTACHE][0] : 0)
  }

  const tout     = compter(msgs.flatMap(m => m.reactions))
  const ambiance = EMOTIONS.reduce<Emotion | 'repos'>(
    (best, e) => (tout[e.id] > (best === 'repos' ? 0 : tout[best]) ? e.id : best), 'repos')
  const coup = useCoup(msgs, audience)

  const grille = useRef<HTMLDivElement>(null)
  const lignes = useRef(new Map<number, HTMLDivElement>())
  const [hauts, setHauts] = useState<Record<number, number>>({})
  const troncRef = useRef<HTMLDivElement>(null)
  const [tronc, setTronc] = useState({ haut: 0, h: 0 })
  const qRef = useRef<HTMLDivElement>(null)
  const [qH, setQH] = useState(0)
  const mesurer = useCallback(() => {
    if (qRef.current) setQH(qRef.current.offsetHeight)
    const tr = troncRef.current
    if (tr) setTronc(a => (a.haut === tr.offsetTop && a.h === tr.offsetHeight ? a : { haut: tr.offsetTop, h: tr.offsetHeight }))
    const h: Record<number, number> = {}
    lignes.current.forEach((el, id) => { h[id] = el.offsetTop })
    setHauts(avant => {
      const cles = Object.keys(h)
      const pareil = cles.length === Object.keys(avant).length && cles.every(k => avant[+k] === h[+k])
      return pareil ? avant : h
    })
  }, [])
  useLayoutEffect(mesurer)
  useEffect(() => {
    if (!grille.current) return
    const ro = new ResizeObserver(mesurer)
    ro.observe(grille.current)
    return () => ro.disconnect()
  }, [mesurer])

  const vue   = useRef<HTMLDivElement>(null)
  const toile = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  type Cam = { x: number; y: number; z: number; doux: boolean }
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, z: 1, doux: false })
  // Le cadre ne sort jamais du monde : la toile, la prairie de chaque côté, le bas de l'herbe.
  const borner = useCallback((c: Cam): Cam => {
    const v = vue.current, t = toile.current
    if (!v || !t) return c
    const tw = t.offsetWidth, bas = t.offsetHeight + 170
    const z = Math.max(c.z, Math.min(1, (v.clientWidth - 32) / tw, v.clientHeight / (t.offsetHeight + 40)))
    // Le cadre s'élargit pour inclure le menu de réaction ouvert.
    let gauche = 0, droite = tw, mg = 0, md = 0
    const menu = t.querySelector<HTMLElement>('.jd-reagir')
    if (menu) {
      let gx = 0
      for (let el: HTMLElement | null = menu; el && el !== t; el = el.offsetParent as HTMLElement | null) gx += el.offsetLeft
      mg = gx - 16
      md = gx + menu.offsetWidth + 16
      gauche = Math.min(0, mg)
      droite = Math.max(tw, md)
    }
    const a = v.clientWidth - droite * z, b = -gauche * z
    let x = a >= b ? Math.min(a, Math.max(b, (v.clientWidth - tw * z) / 2)) : Math.min(b, Math.max(a, c.x))
    if (menu) x = Math.max(-mg * z, Math.min(v.clientWidth - md * z, x))
    const y = bas * z <= v.clientHeight ? v.clientHeight - bas * z : Math.max(v.clientHeight - bas * z, Math.min(40, c.y))
    return { ...c, x, y, z }
  }, [])
  useLayoutEffect(() => setCam(c => borner({ ...c, doux: true })), [ouvert, borner])
  useLayoutEffect(() => {
    const b = borner(cam)
    if (b.x !== cam.x || b.y !== cam.y || b.z !== cam.z) setCam(b)
  }, [cam, borner])

  const recentrer = useCallback((doux = true) => {
    const v = vue.current, t = toile.current
    if (!v || !t) return
    const z = Math.min(1, (v.clientWidth - 32) / t.offsetWidth)
    setCam({ x: (v.clientWidth - t.offsetWidth * z) / 2, y: 12, z, doux })
  }, [])
  useLayoutEffect(() => recentrer(false), [recentrer])

  const zoomer = useCallback((f: number, px: number, py: number, doux = false) =>
    setCam(c => {
      const z = Math.min(2.5, Math.max(0.2, c.z * f))
      const k = z / c.z
      return { x: px - (px - c.x) * k, y: py - (py - c.y) * k, z, doux }
    }), [])
  const zoomerAuCentre = (f: number) => {
    const v = vue.current
    if (v) zoomer(f, v.clientWidth / 2, v.clientHeight / 2, true)
  }

  useEffect(() => {
    const v = vue.current
    if (!v) return
    const roue = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = v.getBoundingClientRect()
        const d = Math.max(-50, Math.min(50, e.deltaY))
        zoomer(Math.exp(-d * 0.01), e.clientX - r.left, e.clientY - r.top)
      } else {
        setCam(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY, doux: false }))
      }
    }
    v.addEventListener('wheel', roue, { passive: false })
    return () => v.removeEventListener('wheel', roue)
  }, [zoomer])

  const glisse = useRef<{ x: number; y: number; cx: number; cy: number; parti: boolean; porte: number | null } | null>(null)
  const aGlisse = useRef(false)
  const appuyer = (e: Pointeur) => {
    if (e.button !== 0) return
    const cible = e.target as Element
    const mien  = !fige && onDeplacer && !cible.closest('button') ? cible.closest<HTMLElement>('[data-mien]') : null
    glisse.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, parti: false, porte: mien ? Number(mien.dataset.mien) : null }
    aGlisse.current = false
  }
  const bouger = (e: Pointeur) => {
    const g = glisse.current
    if (!g) {
      if (deplace) setSurvol(sousLePointeur(e.clientX, e.clientY))
      return
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!g.parti && Math.hypot(dx, dy) < 5) return
    if (!g.parti) {
      g.parti = true
      aGlisse.current = true
      vue.current?.setPointerCapture(e.pointerId)
      if (g.porte !== null) setOuvert(null)
    }
    if (g.porte !== null) {
      const r = vue.current!.getBoundingClientRect()
      setDeplace({ id: g.porte, glisse: true, x: e.clientX - r.left, y: e.clientY - r.top })
      setSurvol(sousLePointeur(e.clientX, e.clientY))
      return
    }
    setCam(c => ({ ...c, x: g.cx + dx, y: g.cy + dy, doux: false }))
  }
  const lacher = (e: Pointeur) => {
    const g = glisse.current
    glisse.current = null
    if (g?.porte == null || !g.parti) return
    const c = sousLePointeur(e.clientX, e.clientY)
    if (c !== null && permis(g.porte, c)) bouturer(g.porte, c === 'tronc' ? undefined : c)
    else annuler()
  }
  const lacherTout = () => { if (glisse.current?.porte != null) annuler(); glisse.current = null }

  useEffect(() => {
    if (!deplace) return
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDeplace(null); setSurvol(null) } }
    addEventListener('keydown', touche)
    return () => removeEventListener('keydown', touche)
  }, [deplace])

  const connus   = useRef(new Set(msgs.map(m => m.id)))
  const aMontrer = useRef<number | null>(null)
  useEffect(() => {
    for (const m of msgs) {
      if (connus.current.has(m.id)) continue
      connus.current.add(m.id)
      if (m.qui === moi) aMontrer.current = m.id
    }
  }, [msgs, moi])
  useEffect(() => {
    const id = aMontrer.current, v = vue.current, g = grille.current
    if (id === null || hauts[id] === undefined || !v || !g) return
    aMontrer.current = null
    const y = g.offsetTop + hauts[id]
    setCam(c => {
      const ecran = c.y + y * c.z
      return ecran > 40 && ecran < v.clientHeight - 120 ? c : { ...c, y: v.clientHeight * 0.55 - y * c.z, doux: true }
    })
  }, [hauts])

  const [brille, setBrille] = useState<number | null>(null)
  useEffect(() => {
    if (!vise) return
    const el = lignes.current.get(vise.id), v = vue.current, g = grille.current
    if (!el || !v || !g) return
    const cx = g.offsetLeft + el.offsetLeft + el.offsetWidth / 2
    const cy = g.offsetTop + el.offsetTop + el.offsetHeight / 2
    setCam(c => {
      const z = Math.max(c.z, 0.9)
      return { x: v.clientWidth / 2 - cx * z, y: v.clientHeight / 2 - cy * z, z, doux: true }
    })
    setBrille(vise.id)
    const t = setTimeout(() => setBrille(null), 1800)
    return () => clearTimeout(t)
  }, [vise])

  // FLIP : position avant, position après, on inverse puis on anime.
  const avant = useRef<{ ou: Map<number, DOMRect>; partent: Set<number> } | null>(null)
  const bouturer = (id: number, vers?: number) => {
    const ou = new Map<number, DOMRect>()
    lignes.current.forEach((el, i) => ou.set(i, el.getBoundingClientRect()))
    avant.current = { ou, partent: new Set([id, ...descendance(msgs, id)]) }
    aMontrer.current = id
    annuler()
    onDeplacer?.(id, vers)
  }
  useLayoutEffect(() => {
    const a = avant.current
    if (!a) return
    avant.current = null
    const calme = matchMedia('(prefers-reduced-motion: reduce)').matches
    a.ou.forEach((r, id) => {
      const el = lignes.current.get(id)
      if (!el) return
      const n  = el.getBoundingClientRect()
      const dx = (r.left - n.left) / cam.z, dy = (r.top - n.top) / cam.z
      const part = a.partent.has(id)
      if (calme) {
        if (part) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 })
        return
      }
      if (!part) {
        if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
                                 { duration: 500, easing: 'cubic-bezier(.4,0,.2,1)' })
        return
      }
      el.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${dx}px, ${dy - 16}px) rotate(-2deg)`, offset: .2 },
        { transform: 'none' },
      ], { duration: 800, easing: 'cubic-bezier(.4,0,.2,1)' })
      el.querySelectorAll('.jd-pousse').forEach(p => p.animate(
        [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        { duration: 600, delay: 700, easing: 'ease-out', fill: 'backwards' }))
    })
  })

  // Le tronc s'incline doucement ; les branches suivent son axe à leur hauteur.
  const penche = (y: number) => {
    if (!tronc.h) return 0
    const t = Math.min(1, Math.max(0, (y - tronc.haut) / tronc.h))
    return 15 * Math.sin(2.4 * (1 - t)) + 1.4 * Math.sin(y / 17 + 1)
  }
  const formeTronc = (() => {
    if (!tronc.h) return ''
    const pas = Array.from({ length: 48 }, (_, k) => tronc.h * k / 47)
    const larg = (y: number) => {
      const t = y / tronc.h
      const pointe = .3 + .7 * Math.min(1, y / 110) ** .75
      return (8.5 + 6 * t + .9 * Math.sin(y / 23)) * pointe + 15 * Math.max(0, (t - .84) / .16) ** 2.2
    }
    const x = (y: number) => penche(y + tronc.haut)
    const cote = (s: number, ys: number[]) => ys.map(y => `${(x(y) + s * larg(y)).toFixed(1)} ${y.toFixed(1)}`)
    return 'M' + [...cote(-1, pas), ...cote(1, [...pas].reverse())].join(' L') + ' Z'
  })()

  return (
    <div className={'jardin' + (fige ? ' fige' : '') + (deplace ? ' deplace' : '') + (deplace?.glisse ? ' glisse' : '')}
         ref={vue} style={{ backgroundColor: FOND[ambiance], '--fond': FOND[ambiance] } as CSSProperties}
         onPointerDown={appuyer} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacherTout}
         onClickCapture={e => { if (aGlisse.current) { e.stopPropagation(); aGlisse.current = false } }}
         onClick={() => { setOuvert(null); if (deplace) annuler() }}>
      {!fige && <Ambiance coup={coup} scene={scene} />}

      {deplace?.glisse && (
        <div className="jd-fantome" style={{ left: deplace.x, top: deplace.y }}>
          {msgs.find(m => m.id === deplace.id)?.dit}
        </div>
      )}

      <div className="jd-scene" ref={scene}>
        <div className="jd-toile" ref={toile}
             style={{
               transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`,
               transition: cam.doux ? 'transform .45s cubic-bezier(.3,.7,.3,1)' : 'none',
             }}>
          <div className="jardin-grille" ref={grille} style={{ paddingTop: 200 + Math.max(0, qH - 160) }}>
            <div className={'jd-tronc' + (survol === 'tronc' ? ' survole' : '')} style={{ gridRow: `1 / ${sol}` }} ref={troncRef}
                 data-cible={deplace && permis(deplace.id, 'tronc') ? 'tronc' : undefined}
                 onClick={e => {
                   if (!deplace) return
                   e.stopPropagation()
                   if (permis(deplace.id, 'tronc')) bouturer(deplace.id)
                   else annuler()
                 }}>
              {tronc.h > 0 && (
                <svg className="jd-tronc-dessin" width={80} height={tronc.h} viewBox={`-40 0 80 ${tronc.h}`}>
                  <path d={formeTronc} fill="#4e5675" stroke="#4e5675" strokeWidth={3} strokeLinejoin="round" />
                  <path d={formeTronc} className="jd-fond" />
                </svg>
              )}
            </div>

            {places.map(({ m, cote, parent }, i) => (
              <Branche key={m.id} m={m} g={geos.get(m.id)!} audience={audience} moi={moi}
                       cote={cote} ligne={i + 1} base={bases.get(m.id)!}
                       parent={parent ? geos.get(parent.id)! : null}
                       remonte={parent && hauts[m.id] !== undefined && hauts[parent.id] !== undefined
                         ? hauts[m.id] - hauts[parent.id] : null}
                       decal={penche((hauts[m.id] ?? 0) + BASE)}
                       refLigne={el => { if (el) lignes.current.set(m.id, el); else lignes.current.delete(m.id) }}
                       ouvert={!fige && ouvert === m.id} brille={brille === m.id}
                       peutRepondre={peutRepondre}
                       mien={!fige && !!onDeplacer && m.qui === moi}
                       cible={!!deplace && permis(deplace.id, m.id)} survole={survol === m.id}
                       porte={!!partent?.has(m.id)}
                       onOuvrir={() => {
                         if (fige) return
                         if (deplace) {
                           if (permis(deplace.id, m.id)) bouturer(deplace.id, m.id)
                           else annuler()
                           return
                         }
                         setOuvert(o => (o === m.id ? null : m.id))
                       }}
                       onReagir={(e, anon) => onReagir?.(m.id, e, anon)}
                       onEpingler={() => onEpingler?.(m.id)}
                       onRepondre={() => { setOuvert(null); onRepondre?.(m.id) }}
                       onDeplacer={() => { setOuvert(null); setDeplace({ id: m.id, glisse: false, x: 0, y: 0 }) }} />
            ))}

            {tronc.h > 0 && (
              <svg className="jd-tronc-dessus" width={80} height={tronc.h} viewBox={`-40 0 80 ${tronc.h}`}
                   style={{ top: tronc.haut, left: 'calc(50% - 40px)' }}>
                <path d={formeTronc} className="jd-fond" />
              </svg>
            )}

            {tronc.h > 0 && (
              <span className="jd-bourgeon" style={{ top: tronc.haut - 62, left: `calc(50% - 46px + ${penche(tronc.haut)}px)` }}>
                <Etoile />
              </span>
            )}

            {question && (
              <div className="jd-question" ref={qRef}
                   style={{ top: tronc.haut - 96, left: `calc(50% + 84px + ${penche(tronc.haut)}px)` }}>
                <div className="question-dit">{question.dit}</div>
                <div className="question-qui">posée par <b>{question.qui}</b></div>
              </div>
            )}

            <div className="jd-sol" style={{ gridRow: sol }}>
              <div className="jd-terre" />
              {[
                { cls: 'jd-herbe', brins: HERBE },
                { cls: 'jd-herbe jd-flanc-g', brins: FLANC },
                { cls: 'jd-herbe jd-flanc-d', brins: FLANC },
              ].map(({ cls, brins }) => (
                <svg key={cls} className={cls} height="80">
                  {['jd-herbe-trait', 'jd-herbe-dedans'].map((couche, ci) => (
                    <g key={couche} className={couche}>
                      {ci === 1 && <rect x="0" y="77" width="100%" height="10" />}
                      {brins.map((b, k) => (
                        <svg key={k} x={`${b.x}%`} y={80} overflow="visible">
                          <g className="jd-brin" style={{ animationDelay: `${1 + b.retard}s, ${b.retard * 3}s` }}>
                            <path d={brinD(b)} />
                          </g>
                        </svg>
                      ))}
                    </g>
                  ))}
                </svg>
              ))}
              <svg className="jd-prairie" height={PRAIRIE_BAS + 80}>
                {PRAIRIE.map((r, ri) => (
                  <g key={ri}>
                    {['jd-herbe-trait', 'jd-herbe-dedans'].map((couche, ci) => (
                      <g key={couche} className={couche}>
                        {ci === 1 && <rect x="0" y={77 + r.y} width="100%" height="10" />}
                        {r.brins.map((b, k) => (
                          <svg key={k} x={`${b.x}%`} y={80 + r.y} overflow="visible">
                            <g className="jd-brin calme" style={{ animationDelay: `${1.1 + ri * .1 + b.retard}s` }}>
                              <path d={brinD(b)} />
                            </g>
                          </svg>
                        ))}
                      </g>
                    ))}
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="jd-cadre" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <button className="outil" title="Zoomer" aria-label="Zoomer" onClick={() => zoomerAuCentre(1.25)}>+</button>
        <button className="outil" title="Dézoomer" aria-label="Dézoomer" onClick={() => zoomerAuCentre(0.8)}>−</button>
        <button className="outil" title="Recentrer l'arbre" aria-label="Recentrer l'arbre" onClick={() => recentrer()}>⊙</button>
      </div>
    </div>
  )
}

// Seules les lettres qui changent s'animent, de gauche à droite.
function useVague(cibles: (Emotion | null)[]) {
  const repos = cibles.map(() => null)
  const [affiche, setAffiche] = useState<(Emotion | null)[]>(repos)
  const actuel = useRef<(Emotion | null)[]>(repos)
  const cle = cibles.map(c => c ?? '-').join(',')

  useEffect(() => {
    const depart   = actuel.current
    const changees = cibles.flatMap((c, i) => (c !== depart[i] ? [i] : []))
    if (!changees.length) return
    const duree = Math.min(900, changees.length * 40)
    const debut = performance.now()
    let id = 0
    const pas = (t: number) => {
      const k = Math.min((t - debut) / duree, 1)
      const front = Math.round(k * changees.length)
      const suite = [...depart]
      for (let j = 0; j < front; j++) suite[changees[j]] = cibles[changees[j]]
      actuel.current = suite
      setAffiche(suite)
      if (k < 1) id = requestAnimationFrame(pas)
    }
    id = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  return affiche
}

export const BASE    = 46
const ATTACHE = 14
// 21 points mélangeant la courbe (repos), la branche qui pend (tristesse) et l'éclair (surprise).
function pointsBranche(L: number, raideur: number, tristesse: number) {
  const monte = [[0, BASE], [.33 * L, BASE], [.6 * L, BASE - 16], [L, BASE - 30]]
  const pend  = [[0, BASE], [.28 * L, BASE - 8], [.5 * L, BASE + 30], [.55 * L, BASE + 1.15 * L]]
  const c = monte.map((p, j) => [0, 1].map(d => p[d] + (pend[j][d] - p[d]) * tristesse))
  const courbe = (t: number) => {
    const m = 1 - t, w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t]
    return [0, 1].map(d => c.reduce((acc, q, j) => acc + q[d] * w[j], 0))
  }
  const A = 6 + .16 * L
  const coudes = [0, 1, 2, 3, 4, 5].map(k => {
    const p = courbe(k / 5)
    if (k === 0 || k === 5) return p
    const [a, b] = [courbe(k / 5 - .01), courbe(k / 5 + .01)]
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1
    const s = k % 2 ? -A : A
    return [p[0] - dy / n * s, p[1] + dx / n * s]
  })
  return Array.from({ length: 21 }, (_, k) => {
    const t = k / 20
    const s = Math.min(Math.floor(t * 5), 4), f = t * 5 - s
    const lisse = courbe(t)
    return [0, 1].map(d => {
      const brisee = coudes[s][d] + (coudes[s + 1][d] - coudes[s][d]) * f
      return lisse[d] + (brisee - lisse[d]) * raideur
    })
  })
}

export const TEINTE_BRANCHE: Record<Emotion | 'repos', string> = {
  repos: '#4e5675', joie: '#7a5fb0', colere: '#7a2a3c', tristesse: '#aab1d6', surprise: '#1d2136',
}

// Herbe sur la ligne de sol : tirage stable, toujours au même endroit.
const hasard = (k: number) => { const x = Math.sin(k * 91.17) * 43758.5453; return x - Math.floor(x) }
const VERTS = ['#8db564', '#a3c477', '#b9d48c', '#cfe2a6', '#dcebb8']
const brin = (k: number, x: number) => {
  const r = hasard(k + 300)
  const h = r > .88 ? 34 + hasard(k + 400) * 20 : r < .1 ? 5 + hasard(k + 500) * 7 : 12 + hasard(k + 600) * 18
  return {
    x, h,
    pli: (hasard(k + 700) - .5) * h * .9,
    large: 1.8 + hasard(k + 800) * 1.6,
    vert: VERTS[Math.min(4, Math.floor(hasard(k + 900) * 4 + (h > 34 ? 1 : 0)))],
    retard: hasard(k + 1000) * .8,
  }
}
const HERBE_BASE = [
  ...Array.from({ length: 320 }, (_, k) => brin(k, (k + hasard(k)) / 320 * 100)),
  ...Array.from({ length: 60 }, (_, k) => brin(k + 2000, 46 + hasard(k + 3000) * 8)),
]

// La prairie : plus haute, et irrégulière par zones (deux ondes lentes qui se croisent).
export const HERBE = HERBE_BASE.map(h => {
  const zone = .55 + .45 * Math.sin(h.x * .31 + 1) + .3 * Math.sin(h.x * .83 + 4)
  return { ...h, h: h.h * 1.4 * Math.max(.35, zone), pli: h.pli * 1.5 }
})


// La prairie : des rangées de plus en plus grandes vers l'avant, plus larges que la toile.
const rangee = (n: number, graine: number, echelle: number) =>
  Array.from({ length: n }, (_, k) => {
    const b = brin(graine + k, (k + hasard(graine + k)) / n * 100)
    const zone = .55 + .45 * Math.sin(b.x * 1.1 + graine) + .3 * Math.sin(b.x * 2.9 + graine)
    return { ...b, h: b.h * 1.4 * echelle * Math.max(.35, zone), pli: b.pli * 1.5 * echelle, large: b.large * Math.sqrt(echelle) }
  })
const FLANC = rangee(240, 4000, 1)
// Devant le tronc, aucun brin ne monte au-dessus de la ligne d'herbe.
const PRAIRIE = ([[24, 380, 6000, .8], [52, 330, 7000, .95], [84, 280, 8000, 1.1],
                  [120, 240, 9000, 1.25], [160, 200, 10000, 1.4], [206, 170, 11000, 1.6]] as const)
  .map(([y, n, graine, echelle]) => ({
    y, brins: rangee(n, graine, echelle).filter(b => Math.abs(b.x - 50) > 2.2 || b.h < y - 4),
  }))
const PRAIRIE_BAS = 210

type Geo = ReturnType<typeof geometrie>
export function geometrie(m: MsgConv, audience: number) {
  const n    = compter(m.reactions)
  const part = (e: Emotion) => (audience ? Math.sqrt(n[e] / audience) : 0)
  const L0   = Math.min(170, 60 + [...m.dit].length * .9)
  const raideur = Math.min(1, part('surprise') * 1.6)
  const pts  = onduler(pointsBranche(L0, raideur, Math.min(1, part('tristesse') * 1.5)).map(([x, y]) => [x * 1.7, y]), m.id)
  const L    = L0 * 1.7
  const H    = Math.max(...pts.map(p => p[1])) + 12
  const d    = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const fleur = n.joie ? 0.6 + 0.9 * part('joie') : 0
  const couronne = Math.max(0, Math.min(1, (part('joie') - .45) / .35))
  const nbEpines = Math.ceil(10 * part('colere'))
  const epines = [4, 14, 9, 17, 6, 12, 3, 15, 8, 11].slice(0, nbEpines).map((k, j) => {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1]
    const deg = Math.atan2(by - ay, bx - ax) * 180 / Math.PI
    return { x: ax, y: ay, a: deg + (j % 2 ? 90 : -90) }
  })
  const dominante: Emotion | 'repos' = m.reactions.length
    ? EMOTIONS.reduce((best, e) => (n[e.id] > n[best] ? e.id : best), 'joie' as Emotion)
    : 'repos'
  return { n, part, L, pts, H, d, fleur, couronne, epines, dominante, raideur }
}

function Branche({
  m, g, audience, moi, cote, ligne, base, decal, parent, remonte, refLigne,
  ouvert, brille, peutRepondre, mien, cible, survole, porte, onOuvrir, onReagir, onEpingler, onRepondre, onDeplacer,
}: {
  m: MsgConv; g: Geo; audience: number; moi: string; cote: 'gauche' | 'droite'; ligne: number
  base: number
  decal: number
  parent: Geo | null
  remonte: number | null
  refLigne: (el: HTMLDivElement | null) => void
  ouvert: boolean; brille: boolean; peutRepondre: boolean
  mien: boolean
  cible: boolean
  survole: boolean
  porte: boolean
  onOuvrir: () => void; onReagir: (e: Emotion | null, anonyme: boolean) => void
  onEpingler: () => void; onRepondre: () => void; onDeplacer: () => void
}) {
  const [anonyme, setAnonyme] = useState(false)
  const lettres = [...m.dit]
  const affiche = useVague(teintes(lettres, m.reactions, audience))
  const { L, H, d, fleur, couronne, epines, dominante, part, raideur } = g
  const [fx, fy] = g.pts[20]
  const dessin = contourBranche(g.pts, L, m.id, { fleur, raideur, nbEpines: epines.length })
  const teinte = TEINTE_BRANCHE[dominante]

  const mienne = m.reactions.find(r => r.qui === moi)
  const reagir = (e: Emotion) => onReagir(mienne?.emotion === e ? null : e, anonyme)

  const ressenti = EMOTIONS
    .filter(e => g.n[e.id])
    .map(e => ({ e, qui: m.reactions.filter(r => r.emotion === e.id).map(r => (r.anonyme ? 'anonyme' : r.qui)) }))

  // La greffe : de la branche d'origine (plus haut) jusqu'au pied de cette branche, en contour elle aussi.
  let greffe = ''
  if (parent && remonte !== null) {
    const y0 = parent.pts[ATTACHE][1] - remonte
    const dy = BASE - y0
    const bez = (u: number) => {
      const v = 1 - u
      return [3 * v * v * u * 8 + 3 * v * u * u * -6, v * v * v * y0 + 3 * v * v * u * (y0 + dy * .35) + 3 * v * u * u * (BASE - dy * .35) + u * u * u * BASE]
    }
    greffe = membre(Array.from({ length: 13 }, (_, k) => bez(k / 12)), 3, 5.5)
  }
  const bord = cote === 'droite' ? 'left' : 'right'
  const sens = cote === 'droite' ? 1 : -1

  return (
    <div ref={refLigne}
         className={'jd-msg ' + cote + (ouvert ? ' ouvert' : '') + (brille ? ' brille' : '')
           + (cible ? ' cible' : '') + (survole ? ' survole' : '') + (porte ? ' porte' : '')}
         data-mien={mien ? m.id : undefined} data-cible={cible ? m.id : undefined}
         style={{ gridRow: ligne, minHeight: H, [cote === 'droite' ? 'paddingLeft' : 'paddingRight']: base + L + 8 + sens * decal + (fleur ? 14 * fleur : 0) }}
         onClick={ev => { ev.stopPropagation(); onOuvrir() }}>
      <svg className="jd-branche" width={L + 10} height={H} style={{ [bord]: base - 12 + sens * decal }}>
        <mask id={`pousse-${m.id}`} maskUnits="userSpaceOnUse" x={-60} y={-40} width={L + 140} height={H + 120}>
          <path d={d} pathLength={1} className="jd-pousse" fill="none" stroke="#fff" strokeWidth={L * .8}
                strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        {greffe && (
          <g className="jd-greffe" strokeLinejoin="round">
            <path d={greffe} fill={TEINTE_BRANCHE[parent!.dominante]} stroke={TEINTE_BRANCHE[parent!.dominante]} strokeWidth={3} />
          </g>
        )}
        <g mask={`url(#pousse-${m.id})`} strokeLinejoin="round">
          {dessin.epines.map((e, k) => <path key={k} d={e} fill={teinte} stroke={teinte} strokeWidth={3} className="jd-epine" />)}
          {dessin.epines.map((e, k) => <path key={k} d={e} className="jd-fond jd-epine" />)}
          {dessin.formes.map((f, k) => <path key={k} d={f} fill={teinte} stroke={teinte} strokeWidth={3} />)}
        </g>
        {greffe && <path d={greffe} className="jd-fond jd-greffe" />}
        <g mask={`url(#pousse-${m.id})`}>
          {dessin.formes.map((f, k) => <path key={k} d={f} className="jd-fond" />)}
        </g>
        <g transform={`translate(${fx} ${fy})`}>
          <g className="jd-fleur" style={{ transform: `scale(${fleur})` }}>
            <g className="jd-fleur" style={{ transform: `scale(${couronne})` }}>
              {[36, 108, 180, 252, 324].map(r => (
                <ellipse key={r} cx={0} cy={-9} rx={5} ry={9} transform={`rotate(${r})`}
                         className="jd-fond" stroke="#c9a6ee" strokeWidth={1.3} />
              ))}
            </g>
            {[0, 72, 144, 216, 288].map(r => (
              <ellipse key={r} cx={0} cy={-7} rx={4.5} ry={7.5} transform={`rotate(${r})`}
                       className="jd-fond" stroke="#8b5fd6" strokeWidth={1.3} />
            ))}
            <circle r={3.2} className="jd-fond" stroke="#8b5fd6" strokeWidth={1.3} />
          </g>
        </g>
      </svg>

      <div className="jd-texte" style={{ opacity: 1 - 0.5 * part('tristesse') }}>
        <div className="jd-qui">
          {m.anonyme
            ? <span className="qui">anonyme</span>
            : <><span className="qui">{m.qui}</span><span className="pronom">{GENS[m.qui]?.pronom ?? ''}</span></>}
          {m.epingle && <EtoileMini className="jd-etoile" couleur="#8b5fd6" />}
        </div>
        <div className={'jd-dit ' + m.effet}>
          {lettres.map((l, i) => {
            const s = styleDe(affiche[i], m.police)
            return <span key={i} className={affiche[i] === 'colere' ? 'jd-tremble' : undefined}
                         style={{ fontFamily: s.police, color: s.couleur, opacity: s.opacite }}>{l}</span>
          })}
        </div>

        {ressenti.length > 0 && (
          <div className="jd-ressenti">
            {ressenti.map(({ e, qui }) => (
              <div key={e.id}>
                <span style={{ fontFamily: e.style.police, color: e.style.couleur }}>{e.nom}</span> : {qui.join(', ')}
              </div>
            ))}
          </div>
        )}
      </div>

      {ouvert && (
        <div className="jd-reagir" onClick={ev => ev.stopPropagation()}>
          {EMOTIONS.map(e => (
            <button key={e.id}
                    className={'puce' + (mienne?.emotion === e.id ? ' active' : '')}
                    style={{ fontFamily: e.style.police, color: mienne?.emotion === e.id ? undefined : e.style.couleur }}
                    onClick={() => reagir(e.id)}>{e.nom}</button>
          ))}
          <button className={'outil' + (anonyme ? ' on' : '')}
                  title={anonyme ? 'Réaction anonyme' : 'Réagir sans révéler mon identité'}
                  aria-label="Réaction anonyme"
                  onClick={() => setAnonyme(a => !a)}>
            <img src="/anonyme.png" alt="" />
          </button>
          <button className={'puce' + (m.epingle ? ' active' : '')} onClick={onEpingler}>
            <EtoileMini className="jd-etoile" couleur={m.epingle ? "#fff" : "#8b5fd6"} /> {m.epingle ? 'retenu' : 'retenir'}
          </button>
          {peutRepondre && <button className="puce" onClick={onRepondre}>répondre</button>}
          {mien && <button className="puce" onClick={onDeplacer}>déplacer</button>}
        </div>
      )}
    </div>
  )
}
