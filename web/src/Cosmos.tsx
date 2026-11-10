// Le fond de toute l'appli (hors connexion, qui a son glaïeul) : la nuit de la page d'accueil,
// une poussière d'étoiles qui scintille, et un réseau de neurones qui dérive lentement.
// Les neurones proches se relient par des filaments ; de temps en temps une impulsion court d'un neurone
// à l'autre et se propage de proche en proche. Le pointeur attire un peu le réseau et l'allume.
// Canvas 2D léger : une centaine de points au plus, en pause quand l'onglet est caché.
import { useEffect, useRef } from 'react'

const GLACIER = [196, 230, 255]
const BLEU = [47, 98, 255]
const POUSSIERE = ['#7CFFB2', '#FF8FB1', '#FFE27A', '#AEB3FF']
const PORTEE = 170          // distance (px) sous laquelle deux neurones se relient
const DUREE_IMPULSION = 1.1 // secondes pour traverser un filament

type Neurone = { x: number; y: number; vx: number; vy: number; cap: number; r: number; eclat: number }
type Etoile = { x: number; y: number; r: number; phase: number; vitesse: number; couleur: string; profondeur: number }
type Impulsion = { de: number; vers: number; t: number; elan: number }

const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

export default function Cosmos() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const calme = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ratio = Math.min(1.5, devicePixelRatio || 1)

    // L'état de la scène, dans un objet : la boucle d'animation le modifie à chaque image.
    const m = { L: 0, H: 0, neurones: [] as Neurone[], etoiles: [] as Etoile[], prochaine: 0, temps: 0, image: 0 }
    const impulsions: Impulsion[] = []
    const pointeur = { x: -1e4, y: -1e4 }

    const peupler = () => {
      m.L = innerWidth; m.H = innerHeight
      cv.width = Math.round(m.L * ratio); cv.height = Math.round(m.H * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      const n = Math.round(Math.min(95, Math.max(36, m.L * m.H / 19000)))
      m.neurones = Array.from({ length: n }, () => ({
        x: Math.random() * m.L, y: Math.random() * m.H, vx: 0, vy: 0,
        cap: Math.random() * Math.PI * 2, r: 1 + Math.random() * 1.3, eclat: 0,
      }))
      m.etoiles = Array.from({ length: Math.round(m.L * m.H / 5200) }, () => ({
        x: Math.random() * m.L, y: Math.random() * m.H, r: .35 + Math.random() * .9,
        phase: Math.random() * 6.3, vitesse: .4 + Math.random() * 1.4,
        couleur: Math.random() < .22 ? POUSSIERE[Math.floor(Math.random() * POUSSIERE.length)] : '#dfeaff',
        profondeur: .2 + Math.random() * .8,
      }))
    }

    // Les voisins d'un neurone (pour qu'une impulsion choisisse où continuer).
    const voisins = (i: number) => {
      const a = m.neurones[i], out: number[] = []
      m.neurones.forEach((b, j) => { if (j !== i && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < PORTEE * PORTEE) out.push(j) })
      return out
    }
    const tirer = (de: number, elan: number) => {
      const v = voisins(de)
      if (v.length) impulsions.push({ de, vers: v[Math.floor(Math.random() * v.length)], t: 0, elan })
    }

    const horloge = { avant: performance.now() }
    const dessiner = (dt: number) => {
      m.temps += dt
      ctx.clearRect(0, 0, m.L, m.H)

      // Les étoiles : un scintillement lent, une dérive à peine perceptible (plus lente au loin).
      for (const e of m.etoiles) {
        e.y -= dt * 2.2 * e.profondeur
        if (e.y < -2) e.y = m.H + 2
        const a = .25 + .55 * (.5 + .5 * Math.sin(m.temps * e.vitesse + e.phase))
        ctx.globalAlpha = a * (.45 + .55 * e.profondeur)
        ctx.fillStyle = e.couleur
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.283); ctx.fill()
      }
      ctx.globalAlpha = 1

      // Les neurones dérivent : un cap qui tourne doucement, attirés un peu par le pointeur.
      for (const nr of m.neurones) {
        nr.cap += (Math.random() - .5) * dt * 1.4
        const dx = pointeur.x - nr.x, dy = pointeur.y - nr.y, d2 = dx * dx + dy * dy
        const attire = d2 < 220 * 220 ? 14 * (1 - Math.sqrt(d2) / 220) : 0
        const d = Math.sqrt(d2) || 1
        nr.vx += (Math.cos(nr.cap) * 7 - nr.vx) * dt * .8 + dx / d * attire * dt
        nr.vy += (Math.sin(nr.cap) * 7 - nr.vy) * dt * .8 + dy / d * attire * dt
        nr.x += nr.vx * dt; nr.y += nr.vy * dt
        if (nr.x < -20) nr.x = m.L + 20; else if (nr.x > m.L + 20) nr.x = -20
        if (nr.y < -20) nr.y = m.H + 20; else if (nr.y > m.H + 20) nr.y = -20
        nr.eclat = Math.max(0, nr.eclat - dt * 1.6)
      }

      // Les filaments entre neurones proches, plus vifs près du pointeur et des neurones qui viennent de s'allumer.
      ctx.lineWidth = .7
      for (let i = 0; i < m.neurones.length; i++) {
        const a = m.neurones[i]
        for (let j = i + 1; j < m.neurones.length; j++) {
          const b = m.neurones[j]
          const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
          if (d2 > PORTEE * PORTEE) continue
          const k = 1 - Math.sqrt(d2) / PORTEE
          const mx = (a.x + b.x) / 2 - pointeur.x, my = (a.y + b.y) / 2 - pointeur.y
          const pres = Math.max(0, 1 - Math.sqrt(mx * mx + my * my) / 260)
          ctx.strokeStyle = rgba(GLACIER, k * k * (.2 + .35 * pres) + .35 * Math.max(a.eclat, b.eclat) * k)
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
      }

      // Les corps des neurones, avec un halo quand ils s'allument.
      for (const nr of m.neurones) {
        if (nr.eclat > .02) {
          const g = ctx.createRadialGradient(nr.x, nr.y, 0, nr.x, nr.y, 16 * nr.eclat + 4)
          g.addColorStop(0, rgba(GLACIER, .55 * nr.eclat)); g.addColorStop(1, rgba(BLEU, 0))
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(nr.x, nr.y, 16 * nr.eclat + 4, 0, 6.283); ctx.fill()
        }
        ctx.fillStyle = rgba(GLACIER, .65 + .35 * nr.eclat)
        ctx.beginPath(); ctx.arc(nr.x, nr.y, nr.r + nr.eclat * 1.2, 0, 6.283); ctx.fill()
      }

      // Les impulsions : une goutte de lumière qui file le long d'un filament, et parfois continue plus loin.
      m.prochaine -= dt
      if (m.prochaine <= 0 && m.neurones.length) {
        tirer(Math.floor(Math.random() * m.neurones.length), 3 + Math.floor(Math.random() * 3))
        m.prochaine = .6 + Math.random() * 1.2
      }
      for (let k = impulsions.length - 1; k >= 0; k--) {
        const p = impulsions[k]
        p.t += dt / DUREE_IMPULSION
        const a = m.neurones[p.de], b = m.neurones[p.vers]
        if (p.t >= 1 || (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > (PORTEE * 1.3) ** 2) {
          impulsions.splice(k, 1)
          if (p.t >= 1) {
            b.eclat = 1
            if (p.elan > 1 && impulsions.length < 24) { tirer(p.vers, p.elan - 1); if (Math.random() < .3) tirer(p.vers, p.elan - 1) }
          }
          continue
        }
        const e = p.t * p.t * (3 - 2 * p.t)
        const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7)
        g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.35, rgba(GLACIER, .6)); g.addColorStop(1, rgba(BLEU, 0))
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill()
      }
    }

    const boucle = (maintenant: number) => {
      const dt = Math.min(.05, (maintenant - horloge.avant) / 1000)
      horloge.avant = maintenant
      if (!document.hidden) dessiner(dt)
      m.image = requestAnimationFrame(boucle)
    }

    const redimensionner = () => { peupler(); if (calme) dessiner(0) }
    const bouge = (e: PointerEvent) => { pointeur.x = e.clientX; pointeur.y = e.clientY }
    const sort = () => { pointeur.x = pointeur.y = -1e4 }

    peupler()
    addEventListener('resize', redimensionner)
    if (calme) dessiner(0)
    else {
      addEventListener('pointermove', bouge)
      document.addEventListener('pointerleave', sort)
      m.image = requestAnimationFrame(boucle)
    }
    return () => {
      cancelAnimationFrame(m.image)
      removeEventListener('resize', redimensionner)
      removeEventListener('pointermove', bouge)
      document.removeEventListener('pointerleave', sort)
    }
  }, [])

  return <canvas ref={canvas} className="cosmos" aria-hidden />
}
