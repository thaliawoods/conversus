// Le fond de toute l'appli (hors connexion, qui a son glaïeul) : la nuit de la page d'accueil
// et une poussière d'étoiles qui scintille, sans constellations (aucune étoile n'est reliée à une autre).
// Canvas 2D léger, en pause quand l'onglet est caché.
import { useEffect, useRef } from 'react'

const POUSSIERE = ['#7CFFB2', '#FF8FB1', '#FFE27A', '#AEB3FF']

type Etoile = { x: number; y: number; r: number; phase: number; vitesse: number; couleur: string; profondeur: number }

export default function Cosmos() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const calme = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ratio = Math.min(1.5, devicePixelRatio || 1)

    const m = { L: 0, H: 0, etoiles: [] as Etoile[], temps: 0, image: 0 }

    const peupler = () => {
      m.L = innerWidth; m.H = innerHeight
      cv.width = Math.round(m.L * ratio); cv.height = Math.round(m.H * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      m.etoiles = Array.from({ length: Math.round(m.L * m.H / 5200) }, () => ({
        x: Math.random() * m.L, y: Math.random() * m.H, r: .35 + Math.random() * .9,
        phase: Math.random() * 6.3, vitesse: .4 + Math.random() * 1.4,
        couleur: Math.random() < .22 ? POUSSIERE[Math.floor(Math.random() * POUSSIERE.length)] : '#dfeaff',
        profondeur: .2 + Math.random() * .8,
      }))
    }

    // Les étoiles : un scintillement lent, une dérive à peine perceptible (plus lente au loin).
    const dessiner = (dt: number) => {
      m.temps += dt
      ctx.clearRect(0, 0, m.L, m.H)
      for (const e of m.etoiles) {
        e.y -= dt * 2.2 * e.profondeur
        if (e.y < -2) e.y = m.H + 2
        const a = .25 + .55 * (.5 + .5 * Math.sin(m.temps * e.vitesse + e.phase))
        ctx.globalAlpha = a * (.45 + .55 * e.profondeur)
        ctx.fillStyle = e.couleur
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.283); ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    let avant = performance.now()
    const boucle = (maintenant: number) => {
      const dt = Math.min(.05, (maintenant - avant) / 1000)
      avant = maintenant
      if (!document.hidden) dessiner(dt)
      m.image = requestAnimationFrame(boucle)
    }

    const redimensionner = () => { peupler(); if (calme) dessiner(0) }

    peupler()
    addEventListener('resize', redimensionner)
    if (calme) dessiner(0)
    else m.image = requestAnimationFrame(boucle)
    return () => {
      cancelAnimationFrame(m.image)
      removeEventListener('resize', redimensionner)
    }
  }, [])

  return <canvas ref={canvas} className="cosmos" aria-hidden />
}
