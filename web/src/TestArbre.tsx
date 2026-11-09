import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MsgConv } from './App'
import { CANAUX, GENS, REACTIONS_DEMO } from './donnees'
import { styleDe, teintes } from './emotions'
import { Etoile } from './Etoile'
import { BASE, HERBE, TEINTE_BRANCHE, geometrie } from './Arbre'
import { brinD, chemin, contourBranche } from './contour'

const AUDIENCE = 7
const LARGEUR = 1000
const CX = LARGEUR / 2
const HAUT = 70
const PAS = 92

const MSGS: MsgConv[] = CANAUX[0].messages.slice(2).map(m => ({
  id: m.id, qui: m.qui, dit: m.dit, police: 'Tremplin', effet: '',
  anonyme: false, epingle: false, reactions: REACTIONS_DEMO[m.id] ?? [],
}))

type Options = { contour: boolean; fourches: boolean; evase: boolean; interieur: 'blanc' | 'fond' }

function formesBranche(m: MsgConv, o: Options) {
  const g = geometrie(m, AUDIENCE)
  const pts = g.pts.map(([x, y]) => [x, y - BASE])
  const c = contourBranche(pts, g.L, m.id, { fleur: g.fleur, raideur: g.raideur, nbEpines: g.epines.length })
  return { g, pts, formes: o.fourches ? c.formes : c.formes.slice(0, 1), epines: c.epines }
}

export default function TestArbre() {
  const [o, setO] = useState<Options>({ contour: true, fourches: true, evase: true, interieur: 'fond' })
  const [cle, setCle] = useState(0)
  const regler = (r: Partial<Options>) => { setO(x => ({ ...x, ...r })); setCle(c => c + 1) }

  const sol = HAUT + MSGS.length * PAS + 145
  const hauteur = sol + 70
  const centre = (y: number) => {
    const t = (y - HAUT) / (sol - HAUT)
    return CX + 15 * Math.sin(2.4 * (1 - t)) + 1.4 * Math.sin(y / 17 + 1)
  }
  const ligne = (i: number) => HAUT + 95 + i * PAS
  const branches = MSGS.map((m, i) => ({ m, i, s: i % 2 ? -1 : 1, y: ligne(i), ...formesBranche(m, o) }))

  const tronc = (() => {
    const pas = Array.from({ length: 40 }, (_, k) => HAUT + (sol - HAUT) * k / 39)
    const larg = (y: number) => {
      const t = (y - HAUT) / (sol - HAUT)
      const pointe = .3 + .7 * Math.min(1, (y - HAUT) / 110) ** .75
      return (8.5 + 6 * t + .9 * Math.sin(y / 23)) * pointe + (o.evase ? 15 * Math.max(0, (t - .84) / .16) ** 2.2 : 0)
    }
    return chemin([...pas.map(y => [centre(y) - larg(y), y]), ...[...pas].reverse().map(y => [centre(y) + larg(y), y])], true)
  })()

  const vue = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 })
  const toile = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const v = vue.current, c = toile.current
    if (!v || !c) return
    const cadrer = () => {
      const l = c.offsetWidth, h = c.offsetHeight
      const z = Math.min(1, (v.clientWidth - 20) / l, (v.clientHeight - 20) / h)
      setCam({ x: (v.clientWidth - l * z) / 2, y: (v.clientHeight - h * z) / 2, z })
    }
    cadrer()
    document.fonts.ready.then(cadrer)
    const tard = setTimeout(cadrer, 400)
    const ro = new ResizeObserver(cadrer)
    ro.observe(v)
    ro.observe(c)
    return () => { ro.disconnect(); clearTimeout(tard) }
  }, [hauteur])
  useEffect(() => {
    const v = vue.current
    if (!v) return
    const roue = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = v.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
        setCam(c => {
          const z = Math.min(2.5, Math.max(.2, c.z * Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * .01)))
          return { x: px - (px - c.x) * z / c.z, y: py - (py - c.y) * z / c.z, z }
        })
      } else setCam(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    v.addEventListener('wheel', roue, { passive: false })
    return () => v.removeEventListener('wheel', roue)
  }, [])
  const glisse = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const clair = o.interieur === 'blanc' ? '#fff' : '#f1f0fa'
  const encre = '#4e5675'

  return (
    <div className="ta">
      <div className="ta-barre">
        <b>Test de l'arbre</b>
        <button className={'puce' + (!o.contour ? ' active' : '')} onClick={() => regler({ contour: false })}>Actuel</button>
        <button className={'puce' + (o.contour ? ' active' : '')} onClick={() => regler({ contour: true })}>Contour</button>
        <span className="ta-sep" />
        <button className={'puce' + (o.fourches ? ' active' : '')} onClick={() => regler({ fourches: !o.fourches })}>fourches</button>
        <button className={'puce' + (o.evase ? ' active' : '')} onClick={() => regler({ evase: !o.evase })}>tronc évasé</button>
        {o.contour && (
          <button className="puce" onClick={() => regler({ interieur: o.interieur === 'blanc' ? 'fond' : 'blanc' })}>
            intérieur : {o.interieur}
          </button>
        )}
        <span className="ta-sep" />
        <button className="puce" onClick={() => setCle(c => c + 1)}>rejouer la pousse</button>
      </div>

      <div className="ta-feuille" ref={vue}
           onPointerDown={e => { glisse.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; vue.current?.setPointerCapture(e.pointerId) }}
           onPointerMove={e => { const g = glisse.current; if (g) setCam(c => ({ ...c, x: g.cx + e.clientX - g.x, y: g.cy + e.clientY - g.y })) }}
           onPointerUp={() => { glisse.current = null }}>
       <div className="ta-toile" ref={toile} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
        <div className="question">
          <div className="question-dit">pain au choc ou chocolatine ?</div>
          <div className="question-qui">posée par <b>Clara</b></div>
        </div>

        <svg key={cle} className="ta-svg" viewBox={`0 0 ${LARGEUR} ${hauteur}`} width={LARGEUR} height={hauteur}>
          <line x1={20} x2={LARGEUR - 20} y1={sol} y2={sol} stroke="#c9cde0" strokeWidth={2} />

          {o.contour ? (
            <>
              {branches.map(b => (
                <g key={b.m.id} transform={`translate(${centre(b.y)} ${b.y}) scale(${b.s} 1)`}>
                  <g className="ta-pousse" style={{ animationDelay: `${.9 + b.i * .12}s` }} strokeLinejoin="round">
                    {b.epines.map((d, k) => <path key={k} d={d} fill={TEINTE_BRANCHE[b.g.dominante]} stroke={TEINTE_BRANCHE[b.g.dominante]} strokeWidth={3} />)}
                    {b.epines.map((d, k) => <path key={k} d={d} fill={clair} />)}
                  </g>
                </g>
              ))}
              <g stroke={encre} strokeWidth={3} strokeLinejoin="round">
                <g className="ta-tronc" style={{ transformOrigin: `${CX}px ${sol}px` }}>
                  <path d={tronc} fill={encre} />
                </g>
                {branches.map(b => (
                  <g key={b.m.id} transform={`translate(${centre(b.y)} ${b.y}) scale(${b.s} 1)`}>
                    <g className="ta-pousse" style={{ animationDelay: `${.9 + b.i * .12}s` }}>
                      {b.formes.map((d, k) => <path key={k} d={d} fill={TEINTE_BRANCHE[b.g.dominante]} stroke={TEINTE_BRANCHE[b.g.dominante]} />)}
                    </g>
                  </g>
                ))}
              </g>
              <g fill={clair}>
                <g className="ta-tronc" style={{ transformOrigin: `${CX}px ${sol}px` }}>
                  <path d={tronc} />
                </g>
                {branches.map(b => (
                  <g key={b.m.id} transform={`translate(${centre(b.y)} ${b.y}) scale(${b.s} 1)`}>
                    <g className="ta-pousse" style={{ animationDelay: `${.9 + b.i * .12}s` }}>
                      {b.formes.map((d, k) => <path key={k} d={d} />)}
                    </g>
                  </g>
                ))}
              </g>
            </>
          ) : (
            <>
              <g className="ta-tronc" style={{ transformOrigin: `${CX}px ${sol}px` }}>
                <path d={`M${CX} ${sol} C ${CX - 6} ${sol - 120}, ${CX + 6} ${HAUT + 200}, ${CX} ${HAUT}`}
                      fill="none" stroke={encre} strokeWidth={4} strokeLinecap="round" />
              </g>
              {branches.map(b => (
                <g key={b.m.id} transform={`translate(${centre(b.y)} ${b.y}) scale(${b.s} 1)`}>
                  <g className="ta-pousse" style={{ animationDelay: `${.9 + b.i * .12}s` }}>
                    <path d={chemin(b.pts)} fill="none" stroke={TEINTE_BRANCHE[b.g.dominante]} strokeWidth={3} strokeLinecap="round" />
                    {o.fourches && b.formes.slice(1).map((d, k) => (
                      <path key={k} d={d} fill={TEINTE_BRANCHE[b.g.dominante]} />
                    ))}
                  </g>
                </g>
              ))}
            </>
          )}

          {branches.map(b => {
            const [fx, fy] = b.pts[20]
            return (
              <g key={b.m.id} transform={`translate(${centre(b.y)} ${b.y}) scale(${b.s} 1)`}>
                <g className="ta-pousse" style={{ animationDelay: `${.9 + b.i * .12}s` }}>
                  {!o.contour && b.g.epines.map((e, k) => (
                    <path key={k} d="M0 -2.6 L10 0 L0 2.6 Z" fill="#3a2f48"
                          transform={`translate(${e.x} ${e.y - BASE}) rotate(${e.a}) translate(${o.contour ? 5 : 0} 0)`} />
                  ))}
                  <g transform={`translate(${fx} ${fy}) scale(${b.g.fleur})`}>
                    <g transform={`scale(${b.g.couronne})`} strokeWidth={1.3}>
                      {[36, 108, 180, 252, 324].map(r => (
                        <ellipse key={r} cx={0} cy={-9} rx={5} ry={9} transform={`rotate(${r})`}
                                 fill={o.contour ? clair : '#ecd9fa'} stroke={o.contour ? '#c9a6ee' : 'none'} />
                      ))}
                    </g>
                    {[0, 72, 144, 216, 288].map(r => (
                      <ellipse key={r} cx={0} cy={-7} rx={4.5} ry={7.5} transform={`rotate(${r})`}
                               fill={o.contour ? clair : '#d9b8f2'} stroke={o.contour ? '#8b5fd6' : 'none'} strokeWidth={1.3} />
                    ))}
                    <circle r={3.2} fill={o.contour ? clair : '#b06ae0'} stroke={o.contour ? '#8b5fd6' : 'none'} strokeWidth={1.3} />
                  </g>
                </g>
              </g>
            )
          })}

          {branches.map(b => {
            const bout = centre(b.y) + b.s * (b.pts[20][0] + (b.g.fleur ? 16 + 16 * b.g.fleur : 16))
            const lettres = [...b.m.dit]
            const etat = teintes(lettres, b.m.reactions, AUDIENCE)
            return (
              <foreignObject key={b.m.id} x={b.s > 0 ? bout : bout - 380} y={b.y + b.pts[20][1] - 30}
                             width={380} height={70} className="ta-texte" style={{ animationDelay: `${1.3 + b.i * .12}s` }}>
                <div style={{ textAlign: b.s > 0 ? 'left' : 'right' }}>
                  <div className="jd-qui" style={{ justifyContent: b.s > 0 ? 'flex-start' : 'flex-end' }}>
                    <span className="qui">{b.m.qui}</span><span className="pronom">{GENS[b.m.qui]?.pronom}</span>
                  </div>
                  <div className="jd-dit">
                    {lettres.map((l, i) => {
                      const s = styleDe(etat[i])
                      return <span key={i} style={{ fontFamily: s.police, color: s.couleur, opacity: s.opacite }}>{l}</span>
                    })}
                  </div>
                </div>
              </foreignObject>
            )
          })}

          <foreignObject x={centre(HAUT) - 46} y={HAUT - 62} width={92} height={92} className="ta-etoile">
            <Etoile />
          </foreignObject>

          <g fill="#8db564" stroke="#8db564" strokeWidth={2} strokeLinejoin="round">
            {HERBE.map((h, k) => <path key={k} d={brinD(h)} transform={`translate(${h.x * 10} ${sol})`} />)}
          </g>
          <g fill={clair}>
            {HERBE.map((h, k) => <path key={k} d={brinD(h)} transform={`translate(${h.x * 10} ${sol})`} />)}
          </g>
        </svg>
       </div>
      </div>
    </div>
  )
}
