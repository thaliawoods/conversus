// L'espace 3D d'un ConVersus : la fleur au centre, les racines de lumière, la poussière, et la caméra
// qui tourne toujours autour de la fleur (glisser pour tourner, molette ou pincement pour zoomer).
// Les messages restent du HTML (polices, effets, clics) : à chaque image, la scène projette leur position 3D
// sur l'écran et place chaque élément enregistré (étiquette) au bon endroit, à la bonne taille,
// plus ou moins voilé selon sa profondeur. Chaque message flotte un peu ; sa racine le suit.
import * as THREE from 'three'
import { creerRendu, mouvementReduit, type Rendu } from './rendu'
import { Faisceaux, type Def, type Reglage } from './faisceaux'
import { creerPoussiere } from './poussiere'
import { PETALES, allure, couleursFleur, petale } from './liens'
import { courbe3, departFleur, derive, plus, unitaire, type Noeud, type V3 } from './espace'
import { BRIN, FLEUR_TAILLE, type Place } from '../plan'
import type { Mode } from '../Carte'

export const FOND_DEBAT = '#080a18'

export type Brin = { cle: string; id: number; tombe: boolean }
export type Regard = number | 'fleur' | null

export type Donnees = {
  places: Map<number, Place>
  noeuds: Map<number, Noeud>
  vie: number
  mode: Mode
  selection: Set<number>
  survol: number | null
  brins: Brin[]              // les tiges des messages sans réponse (et celles qui retombent)
  fleurPrise: boolean        // tout le débat est sélectionné
  regard: Regard             // ce que la caméra regarde (un message, la fleur, ou rien de particulier)
}

const CHAMP = 45                       // ouverture verticale de la caméra (degrés)
const NET_FOCUS = 1.2                  // échelle d'un message regardé (1 = sa taille « normale » à l'écran)
const DIST_MIN = 160, DIST_MAX = 5200
const PHI_MAX = 1.35                   // on ne passe pas tout à fait au-dessus de la fleur
const FLOTTEMENT = 9                   // amplitude du flottement des messages (unités de la scène)
const VUE_DEPART = { theta: -.38, phi: .2 }
const TOUR_LENT = .022                 // rad/s : la scène tourne doucement quand personne n'y touche
const REPOS = 9000                     // ms sans interaction avant que la scène se remette à tourner

type Cam = { theta: number; phi: number; dist: number; cible: THREE.Vector3 }

export class Espace {
  private rendu: Rendu
  private camera = new THREE.PerspectiveCamera(CHAMP, 1, 5, 12000)
  private faisceaux: Faisceaux
  private poussiere: ReturnType<typeof creerPoussiere>
  private horloge = new THREE.Timer()
  private mouvement = mouvementReduit() ? .25 : 1
  private taille = { l: 1, h: 1 }
  private obs: ResizeObserver
  private d: Donnees | null = null
  private dejaVus = new Set<number>()
  private premier = true
  private conteneur: HTMLElement

  // la caméra : où elle est (cam) et où elle va (but) ; elle glisse de l'une à l'autre
  private cam: Cam = { ...VUE_DEPART, dist: 2400, cible: new THREE.Vector3() }
  private but: Cam = { ...VUE_DEPART, dist: 1300, cible: new THREE.Vector3() }
  private cadre = 1400               // distance « lisible » : la fleur et ses idées à une taille où on lit
  private toutVoir = 2400            // distance pour embrasser tout l'arbre
  private derniereAction = performance.now()
  private regardPrecedent: Regard = null
  private distAvantFocus: number | null = null   // pour revenir où l'on était en quittant le focus

  private etiquettes = new Map<string, HTMLElement>()
  private prises = new Map<number, SVGPathElement>()
  private ancres = new Map<number, V3>()          // position du moment de chaque message
  private traces = new Map<number, V3[]>()        // tracé du moment de chaque racine
  private pointeurEcran: { x: number; y: number } | null = null
  private glisse: { x: number; y: number; parti: boolean; id: number } | null = null
  private aGlisse = false

  static creer(canvas: HTMLCanvasElement, conteneur: HTMLElement) {
    const rendu = creerRendu(canvas, { fond: FOND_DEBAT, bloom: { force: .9, rayon: .45, seuil: .04 } })
    return rendu ? new Espace(rendu, conteneur) : null
  }

  private constructor(rendu: Rendu, conteneur: HTMLElement) {
    this.rendu = rendu
    this.conteneur = conteneur
    this.faisceaux = new Faisceaux({ taillePoint: 2.4 * rendu.ratio, portee: 80, mouvement: this.mouvement, intensite: .32 })
    this.poussiere = creerPoussiere({
      nombre: 1600, etendue: { x: 2600, y: 2600, z: 2600 }, taille: 2.6 * rendu.ratio, mouvement: this.mouvement,
      couleurs: ['#7CFFB2', '#AEB3FF', '#FF9AA8', '#FFE27A', '#6FE3D2', '#c4e6ff'],
    })
    rendu.scene.add(this.poussiere.objet, this.faisceaux.groupe)

    this.obs = new ResizeObserver(() => {
      this.taille = { l: Math.max(1, conteneur.clientWidth), h: Math.max(1, conteneur.clientHeight) }
      rendu.dimensionner(this.taille.l, this.taille.h)
      this.camera.aspect = this.taille.l / this.taille.h
      this.camera.updateProjectionMatrix()
      this.cadrer()
    })
    this.obs.observe(conteneur)
    conteneur.addEventListener('pointerdown', this.appuie)
    conteneur.addEventListener('pointermove', this.bouge)
    conteneur.addEventListener('pointerup', this.lache)
    conteneur.addEventListener('pointercancel', this.lache)
    conteneur.addEventListener('pointerleave', this.sort)
    conteneur.addEventListener('wheel', this.roule, { passive: false })
    rendu.renderer.setAnimationLoop(this.image)
  }

  // ------------------------------------------------------------ ce que le HTML enregistre
  etiquette(cle: string, el: HTMLElement | null) {
    if (el) this.etiquettes.set(cle, el)
    else this.etiquettes.delete(cle)
  }
  prise(id: number, el: SVGPathElement | null) {
    if (el) this.prises.set(id, el)
    else this.prises.delete(id)
  }
  // Un glissement vient de se terminer : le clic qui suit ne doit rien sélectionner.
  vientDeGlisser() { const g = this.aGlisse; this.aGlisse = false; return g }

  // ------------------------------------------------------------ la caméra
  private agir() { this.derniereAction = performance.now() }
  zoomer(f: number) { this.agir(); this.but.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, this.but.dist * f)) }
  recentrer() { this.agir(); Object.assign(this.but, VUE_DEPART, { dist: this.cadre }); this.but.cible.set(0, 0, 0) }
  ensemble() { this.agir(); this.but.dist = this.toutVoir; this.but.cible.set(0, 0, 0) }

  // La distance de départ : à la fleur, une unité de la scène vaut ~0,8 pixel (un peu moins que l'ancien board,
  // pour que les idées tiennent dans le cadre même quand le panneau du canal est ouvert).
  private cadrer() {
    const focale = this.taille.h / (2 * Math.tan(THREE.MathUtils.degToRad(CHAMP / 2)))
    const cadre = Math.max(500, focale / .8)
    if (Math.abs(this.but.dist - this.cadre) < 1) this.but.dist = cadre
    this.cadre = cadre
  }

  private appuie = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('textarea, select, input, .bd-compose, .bd-zoom')) return
    this.glisse = { x: e.clientX, y: e.clientY, parti: false, id: e.pointerId }
    this.aGlisse = false
  }
  private bouge = (e: PointerEvent) => {
    const r = this.conteneur.getBoundingClientRect()
    this.pointeurEcran = { x: e.clientX - r.left, y: e.clientY - r.top }
    const g = this.glisse
    if (!g) return
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!g.parti && Math.hypot(dx, dy) < 5) return
    if (!g.parti) { g.parti = true; this.aGlisse = true; this.conteneur.setPointerCapture(g.id); this.conteneur.classList.add('tourne') }
    g.x = e.clientX; g.y = e.clientY
    this.agir()
    this.but.theta -= dx * .0055
    this.but.phi = Math.max(-PHI_MAX, Math.min(PHI_MAX, this.but.phi + dy * .0055))
  }
  private lache = () => {
    if (this.glisse?.parti) this.conteneur.classList.remove('tourne')
    this.glisse = null
  }
  private sort = () => { this.pointeurEcran = null }
  private roule = (e: WheelEvent) => {
    if ((e.target as Element).closest('.bd-compose, .bd-volet')) return
    e.preventDefault()
    this.agir()
    const dy = Math.max(-120, Math.min(120, e.deltaY))
    // pincement (trackpad) : zoom fin ; molette : zoom ; glissement horizontal à deux doigts : tourner
    this.zoomer(Math.exp(dy * (e.ctrlKey ? .012 : .0028)))
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.but.theta -= e.deltaX * .003
  }

  // Regarder un message : la caméra le vise, s'en approche, et se place du côté d'où on le voit
  // devant la fleur (sans tourner plus que nécessaire).
  private viser(regard: Regard) {
    this.agir()
    if (regard === null) {
      this.but.cible.set(0, 0, 0)
      if (this.distAvantFocus !== null) this.but.dist = this.distAvantFocus
      this.distAvantFocus = null
      return
    }
    this.distAvantFocus ??= this.but.dist
    if (regard === 'fleur') { this.but.cible.set(0, 0, 0); this.but.dist = Math.min(this.distAvantFocus, this.cadre * .8); return }
    const n = this.d?.noeuds.get(regard)
    if (!n) return
    const actuelle: V3 = [Math.cos(this.cam.phi) * Math.sin(this.cam.theta), Math.sin(this.cam.phi), Math.cos(this.cam.phi) * Math.cos(this.cam.theta)]
    const v = unitaire(plus(plus([0, 0, 0], unitaire(n.base), .6), actuelle, .4))
    let theta = Math.atan2(v[0], v[2])
    while (theta - this.cam.theta > Math.PI) theta -= 2 * Math.PI
    while (theta - this.cam.theta < -Math.PI) theta += 2 * Math.PI
    this.but.theta = theta
    this.but.phi = Math.max(-PHI_MAX, Math.min(PHI_MAX, Math.asin(Math.max(-1, Math.min(1, v[1])))))
    this.but.dist = this.cadre * .9 / NET_FOCUS
  }

  // ------------------------------------------------------------ les données
  maj(d: Donnees) {
    const avant = this.d
    this.d = d
    // « tout voir » : assez loin pour embrasser tout l'arbre
    let R = FLEUR_TAILLE
    for (const n of d.noeuds.values()) R = Math.max(R, Math.hypot(...n.base) + 160)
    this.toutVoir = Math.min(DIST_MAX, Math.max(this.cadre, R * 2.1))
    if (!avant) { this.but.dist = this.cadre; this.cam.dist = this.cadre * 1.8 }
    if (d.regard !== this.regardPrecedent) { this.regardPrecedent = d.regard; this.viser(d.regard) }

    const f = this.faisceaux
    const defs: Def[] = []
    for (let i = 0; i < PETALES; i++) {
      defs.push({ cle: 'p' + i, brins: 16, etincelles: 12, torsion: 3, pinceDebut: true, pinceFin: true, graine: 101 + i * 17, symetrique: true })
    }
    let rang = 0
    for (const p of d.places.values()) {
      const force = p.m.analyse?.force ?? .4
      const nouveau = !this.dejaVus.has(p.m.id)
      this.dejaVus.add(p.m.id)
      defs.push({
        cle: 'm' + p.m.id, brins: 10 + Math.round(8 * force), etincelles: 5 + Math.round(9 * force),
        torsion: allure(p.m).torsion, pinceDebut: true, pinceFin: true, graine: p.m.id,
        // au premier affichage, les racines poussent les unes après les autres, depuis la fleur
        attente: nouveau && this.premier ? Math.min(2.2, .35 + rang++ * .06) : 0,
      })
    }
    for (const b of d.brins) defs.push({ cle: b.cle, brins: 7, etincelles: 4, torsion: 2.5, pinceDebut: true, pinceFin: true, graine: b.id * 31 + b.cle.length })
    f.definir(defs)
    this.premier = false

    const regarde = typeof d.regard === 'number' ? d.regard : null
    for (const p of d.places.values()) {
      const a = allure(p.m), n = d.noeuds.get(p.m.id)
      if (!n) continue
      const depart = n.parent !== null ? d.noeuds.get(n.parent)!.base : departFleur(n)
      const L = Math.hypot(n.base[0] - depart[0], n.base[1] - depart[1], n.base[2] - depart[2])
      let eclat = a.eclat, rayon = 5 + 8 * (p.m.analyse?.force ?? .4)
      if (d.mode !== 'normal') eclat *= d.selection.has(p.m.id) ? 1.35 : .14
      // Survoler ou regarder un message resserre et allume ses racines (vers son parent et vers ses réponses).
      const vise = (id: number | null) => id !== null && (p.m.id === id || n.parent === id)
      if (vise(d.survol) || vise(regarde)) { eclat *= 1.6; rayon *= .55 }
      else if (regarde !== null && d.mode === 'normal') eclat *= .45
      f.regler('m' + p.m.id, { couleurA: a.A, couleurB: a.B, eclat, rayon, energie: a.energie, frise: a.frise, ampleur: 4 + L * .025, pousse: 1 })
    }
    for (const b of d.brins) {
      const eteint = d.mode !== 'normal' && !d.selection.has(b.id)
      f.regler(b.cle, { couleurA: '#7CFFB2', couleurB: '#E8FF8A', eclat: eteint ? .12 : .8, rayon: 3.5, energie: .5, frise: 0, ampleur: 5, pousse: b.tombe ? 0 : 1 })
    }
  }

  // Le bout d'une tige de fleur, au-delà d'un message qui attend une réponse.
  private tige(n: Noeud, a: V3) {
    // une idée flottante a son texte posé au-delà du bout de sa racine : la tige part de l'autre côté du texte
    const depart = n.libre ? 300 : 130
    const pied = plus(a, n.dir, depart), tete = plus(a, n.dir, depart + BRIN * .8)
    return { debut: n.libre ? plus(a, n.dir, depart * .75) : a, pied, tete }
  }

  // ------------------------------------------------------------ une image
  private image = (maintenant: number) => {
    this.horloge.update(maintenant)
    const dt = Math.min(.1, this.horloge.getDelta())
    const temps = this.horloge.getElapsed()
    const d = this.d
    if (!d) return
    const { l, h } = this.taille

    // La caméra glisse vers son but ; au repos, la scène tourne doucement sur elle-même.
    if (d.regard === null && this.mouvement === 1 && !this.glisse && performance.now() - this.derniereAction > REPOS) {
      this.but.theta += TOUR_LENT * dt
    }
    if (typeof d.regard === 'number') {
      const n = d.noeuds.get(d.regard)
      if (n) this.but.cible.set(...n.base)
    }
    const k = 1 - Math.exp(-dt * 5.5)
    const c = this.cam, b = this.but
    c.theta += (b.theta - c.theta) * k
    c.phi += (b.phi - c.phi) * k
    c.dist += (b.dist - c.dist) * (1 - Math.exp(-dt * 3.2))
    c.cible.lerp(b.cible, 1 - Math.exp(-dt * 3.2))
    const cam = this.camera
    cam.position.set(
      c.cible.x + c.dist * Math.cos(c.phi) * Math.sin(c.theta),
      c.cible.y + c.dist * Math.sin(c.phi),
      c.cible.z + c.dist * Math.cos(c.phi) * Math.cos(c.theta))
    cam.lookAt(c.cible)
    cam.updateMatrixWorld()
    const avant = new THREE.Vector3(); cam.getWorldDirection(avant)
    const droite = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    const haut = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)

    // Chaque message flotte ; sa racine part de son parent (qui flotte aussi) ou du cœur de la fleur.
    const amp = FLOTTEMENT * this.mouvement
    for (const n of d.noeuds.values()) this.ancres.set(n.id, plus(n.base, derive(n.id, temps, amp)))
    for (const n of d.noeuds.values()) {
      // une réponse à une idée flottante part de l'autre côté de son texte (comme sa tige), pas à travers
      const P = n.parent !== null ? d.noeuds.get(n.parent) : undefined, aP = P && this.ancres.get(P.id)
      const S = P && aP ? (P.libre ? plus(aP, P.dir, 225) : aP) : departFleur(n)
      const pts = courbe3(S, this.ancres.get(n.id)!, n.id)
      this.traces.set(n.id, pts)
      this.faisceaux.tracer('m' + n.id, pts)
    }
    for (const br of d.brins) {
      const n = d.noeuds.get(br.id), a = this.ancres.get(br.id)
      if (!n || !a) continue
      const { debut, pied, tete } = this.tige(n, a)
      this.faisceaux.tracer(br.cle, [debut, pied, tete])
    }

    // La fleur fait toujours face à la caméra, ses pétales un peu creusés vers nous, comme une corolle.
    const fl = couleursFleur(d.vie)
    const R = FLEUR_TAILLE / 2
    for (let i = 0; i < PETALES; i++) {
      const cle = 'p' + i
      const pts = petale(i, d.vie, temps, this.mouvement).map(([x, y]): V3 => {
        const r = Math.hypot(x, y), creux = r * r / R * .35
        return [droite.x * x - haut.x * y - avant.x * creux, droite.y * x - haut.y * y - avant.y * creux, droite.z * x - haut.z * y - avant.z * creux]
      })
      this.faisceaux.tracer(cle, pts)
      this.faisceaux.regler(cle, {
        couleurA: fl.A, couleurB: fl.B, eclat: fl.eclat * (d.fleurPrise ? 1.35 : 1),
        rayon: 9 + 5 * d.vie, energie: fl.energie, frise: .05, ampleur: 3, pousse: 1,
      } satisfies Reglage)
    }

    // Le pointeur dans l'espace : là où la souris vise, à la profondeur de ce qu'on regarde.
    if (this.pointeurEcran) {
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(this.pointeurEcran.x / l * 2 - 1, -(this.pointeurEcran.y / h) * 2 + 1), cam)
      const plan = new THREE.Plane().setFromNormalAndCoplanarPoint(avant, c.cible)
      const p = new THREE.Vector3()
      if (ray.ray.intersectPlane(plan, p)) this.faisceaux.pointeur(p.x, p.y, p.z)
    } else this.faisceaux.sansPointeur()

    // Le HTML suit : chaque étiquette est posée sur la projection de son point 3D.
    const focale = h / (2 * Math.tan(THREE.MathUtils.degToRad(CHAMP / 2)))
    const v = new THREE.Vector3()
    const projeter = (p: V3) => {
      v.set(...p)
      const prof = v.clone().sub(cam.position).dot(avant)
      v.project(cam)
      return { x: (v.x + 1) / 2 * l, y: (1 - v.y) / 2 * h, prof }
    }
    const poser = (el: HTMLElement, p: V3) => {
      const q = projeter(p)
      if (q.prof < 20) { el.style.visibility = 'hidden'; return q }
      const s = Math.min(2.4, Math.max(.22, focale / q.prof))
      // au-delà de la fleur, les choses se voilent : la brume de l'espace
      const voile = Math.min(1, Math.max(.16, 1 - (q.prof - c.dist) / 1500))
      el.style.visibility = ''
      el.style.transform = `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`
      el.style.opacity = voile.toFixed(2)
      el.style.zIndex = String(Math.max(1, Math.round(10000 - q.prof)))
      return q
    }
    for (const [cle, el] of this.etiquettes) {
      const t = cle[0], id = Number(cle.slice(1))
      if (cle === 'fleur') poser(el, [0, 0, 0])
      else if (t === 'm') {
        const a = this.ancres.get(id), pts = this.traces.get(id)
        if (!a) continue
        const q = poser(el, a)
        // Une idée flottante se pose au bout de sa racine, du côté opposé à la fleur : la racine touche
        // le bord du texte au lieu de le traverser. La direction est celle de la racine à l'écran.
        const mot = el.firstElementChild as HTMLElement | null
        if (pts && mot?.classList.contains('bd-mot')) {
          const r = projeter(pts[24])
          const dx = q.x - r.x, dy = q.y - r.y, n = Math.hypot(dx, dy) || 1
          mot.style.setProperty('--dx', (dx / n).toFixed(3))
          mot.style.setProperty('--dy', (dy / n).toFixed(3))
        }
      }
      else if (t === 'b' || t === 't') {
        const n = d.noeuds.get(id), a = this.ancres.get(id)
        if (n && a) poser(el, this.tige(n, a).tete)
      }
    }
    // La fenêtre pour répondre : sous ce qu'on regarde, à taille fixe, toujours dans le cadre.
    const compose = this.etiquettes.get('compose')
    if (compose && d.regard !== null) {
      const a = d.regard === 'fleur' ? [0, 0, 0] as V3 : this.ancres.get(d.regard)
      if (a) {
        const q = projeter(a)
        const s = Math.min(2.4, Math.max(.22, focale / Math.max(20, q.prof)))
        const dessous = d.regard === 'fleur' ? FLEUR_TAILLE * .45 * s : 60 * s + 18
        const x = Math.max(12, Math.min(l - compose.offsetWidth - 12, q.x - compose.offsetWidth / 2))
        const y = Math.max(12, Math.min(h - compose.offsetHeight - 12, q.y + dessous))
        compose.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      }
    }
    // En mode synthèse, les racines sont cliquables : leur tracé à l'écran suit la caméra.
    if (d.mode === 'choix') {
      for (const [id, path] of this.prises) {
        const pts = this.traces.get(id)
        if (!pts) continue
        let dd = ''
        for (const p of pts) {
          const q = projeter(p)
          if (q.prof < 20) continue
          dd += (dd ? ' L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1)
        }
        path.setAttribute('d', dd)
      }
    }

    this.faisceaux.uniforms.uPortee.value = 80
    this.faisceaux.avancer(dt, temps)
    this.poussiere.uniforms.uTemps.value = temps
    this.rendu.dessiner(cam)
  }

  liberer() {
    const c = this.conteneur
    this.rendu.renderer.setAnimationLoop(null)
    this.obs.disconnect()
    c.removeEventListener('pointerdown', this.appuie)
    c.removeEventListener('pointermove', this.bouge)
    c.removeEventListener('pointerup', this.lache)
    c.removeEventListener('pointercancel', this.lache)
    c.removeEventListener('pointerleave', this.sort)
    c.removeEventListener('wheel', this.roule)
    this.faisceaux.liberer()
    this.poussiere.liberer()
    this.horloge.dispose()
    this.rendu.liberer()
  }
}
