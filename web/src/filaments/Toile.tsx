// L'espace 3D d'un ConVersus : le pétunia en grains au centre, les racines de lumière, la poussière, et la caméra
// qui tourne toujours autour de la fleur (glisser pour tourner, molette ou pincement pour zoomer).
// Les messages restent du HTML (polices, effets, clics) : à chaque image, la scène projette leur position 3D
// sur l'écran et place chaque élément enregistré (étiquette) au bon endroit, à la bonne taille,
// plus ou moins voilé selon sa profondeur. Chaque message flotte un peu ; sa racine le suit.
import * as THREE from 'three'
import { creerRendu, mouvementReduit, type Rendu } from './rendu'
import { Faisceaux, type Def } from './faisceaux'
import { creerPoussiere } from './poussiere'
import { creerPetunia } from './grainsFleur'
import { courbe3, departFleur, derive, plus, unitaire, type Noeud, type V3 } from './espace'
import { BRIN, FLEUR_TAILLE, melange, type Place } from '../plan'
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

// Les couleurs des racines : lavande pour les idées qui partent de la fleur, bleu ciel pour les réponses ;
// un message rejeté devient rouge et sa racine zigzague en pics ; un message très aimé devient doré.
const RACINE_IDEE = '#dbd7f5'
const RACINE_REPONSE = '#A9D4FF'
const ROUGE = '#FF4A4A'
const OR = '#FFDF4E'
const AVIS_PLEIN = 3                   // solde de likes (ou de dislikes) à partir duquel l'effet est complet
// Le texte d'un message est posé au-delà du bout de sa racine : ses réponses partent de l'autre côté du texte.
const AU_DELA_IDEE = 225, AU_DELA_REPONSE = 150
// Une racine est un trait de lumière simple, comme une fibre nerveuse : près du message, elle se ramifie
// en quelques fines terminaisons qui s'écartent en éventail. [départ sur la racine (rang du point), écart, avancée]
const TERMINAISONS: [number, number, number][] = [[23, -30, 10], [26, 22, 16], [28, -9, 22], [29, 34, 4]]

// Une petite courbe douce de a à b, qui passe près de `vers`.
const courbe = (a: V3, vers: V3, b: V3, n = 10): V3[] => Array.from({ length: n }, (_, i) => {
  const t = i / (n - 1), s = 1 - t
  return [0, 1, 2].map(k => s * s * a[k] + 2 * s * t * vers[k] + t * t * b[k]) as V3
})

// Le zigzag d'une racine rejetée : des pics de part et d'autre de la racine (telle qu'on la voit), sur sa partie
// centrale ; il s'efface avant les terminaisons, qui restent accrochées. `force` : 0 → 1.
const PIC = 20                          // hauteur d'un pic à pleine force (unités de la scène)
function zigzag(pts: V3[], cote: V3, force: number): V3[] {
  const n = pts.length - 1
  let L = 0
  for (let i = 1; i <= n; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])
  const pics = Math.max(6, Math.min(18, Math.round(L / 34))) * 2
  const sur = (t: number): V3 => {
    const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = f - i
    return [0, 1, 2].map(c => pts[i][c] + (pts[i + 1][c] - pts[i][c]) * k) as V3
  }
  // les sommets des pics, plus de quoi garder la courbe ailleurs ; entre deux pics, le trait est droit
  const ts = [...new Set([...Array.from({ length: 33 }, (_, i) => i / 32), ...Array.from({ length: pics + 1 }, (_, j) => j / pics)])].sort((a, b) => a - b)
  return ts.map(t => {
    const x = t * pics, dent = 1 - 2 * Math.abs((x % 2) - 1)
    const env = Math.min(1, t / .1) * Math.max(0, Math.min(1, (.72 - t) / .14))
    return plus(sur(t), cote, dent * env * PIC * force)
  })
}

type Cam = { theta: number; phi: number; dist: number; cible: THREE.Vector3 }

export class Espace {
  private rendu: Rendu
  private camera = new THREE.PerspectiveCamera(CHAMP, 1, 5, 12000)
  private faisceaux: Faisceaux
  private poussiere: ReturnType<typeof creerPoussiere>
  private fleur: ReturnType<typeof creerPetunia>
  private pics = new Map<number, { actuel: number; cible: number }>()   // le zigzag de chaque racine rejetée
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
    this.faisceaux = new Faisceaux({
      taillePoint: 2.4 * rendu.ratio, portee: 80, mouvement: this.mouvement, intensite: .32,
    })
    this.poussiere = creerPoussiere({
      nombre: 1600, etendue: { x: 2600, y: 2600, z: 2600 }, taille: 2.6 * rendu.ratio, mouvement: this.mouvement,
      couleurs: ['#7CFFB2', '#AEB3FF', '#FF9AA8', '#FFE27A', '#6FE3D2', '#c4e6ff'],
    })
    // Le pétunia du centre, en grains comme le glaïeul de la connexion : il baigne dans le bloom.
    // Les racines, elles, sont dessinées après le bloom (scène nette) : un trait net, sans lueur derrière.
    this.fleur = creerPetunia({ hauteur: 410, grainsLargeur: 200, mouvement: this.mouvement })
    this.fleur.uniforms.uTailleMin.value = 1.1 * rendu.ratio
    rendu.scene.add(this.poussiere.objet, this.fleur.groupe)
    rendu.nette.add(this.faisceaux.groupe)

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
    let rang = 0
    for (const p of d.places.values()) {
      const nouveau = !this.dejaVus.has(p.m.id)
      this.dejaVus.add(p.m.id)
      // Une racine : un trait de lumière (deux brins presque confondus, pour un peu d'épaisseur), sans grains
      // ni étincelles autour, et ses fines terminaisons. Elles poussent après la racine, comme si elle s'ouvrait.
      // au premier affichage, les racines poussent les unes après les autres, depuis la fleur
      const attente = nouveau && this.premier ? Math.min(2.2, .35 + rang++ * .06) : 0
      defs.push({ cle: 'm' + p.m.id, brins: 2, etincelles: 0, torsion: 1, pinceDebut: true, pinceFin: true, graine: p.m.id, attente })
      TERMINAISONS.forEach((_, k) => defs.push({
        cle: `m${p.m.id}t${k}`, brins: 1, etincelles: 0, torsion: 0, pinceDebut: true, pinceFin: false,
        graine: p.m.id * 7 + k, attente: attente + .5 + k * .08,
      }))
    }
    for (const b of d.brins) defs.push({ cle: b.cle, brins: 2, etincelles: 0, torsion: 1, pinceDebut: true, pinceFin: true, graine: b.id * 31 + b.cle.length })
    f.definir(defs)
    this.premier = false

    const regarde = typeof d.regard === 'number' ? d.regard : null
    for (const p of d.places.values()) {
      const n = d.noeuds.get(p.m.id)
      if (!n) continue
      const depart = n.parent !== null ? d.noeuds.get(n.parent)!.base : departFleur(n)
      const L = Math.hypot(n.base[0] - depart[0], n.base[1] - depart[1], n.base[2] - depart[2])
      let eclat = 1.5 + .4 * (p.m.analyse?.force ?? .4)
      if (d.mode !== 'normal') eclat *= d.selection.has(p.m.id) ? 1.35 : .14
      // Survoler ou regarder un message allume ses racines (vers son parent et vers ses réponses).
      const vise = (id: number | null) => id !== null && (p.m.id === id || n.parent === id)
      if (vise(d.survol) || vise(regarde)) eclat *= 1.6
      else if (regarde !== null && d.mode === 'normal') eclat *= .45
      const solde = p.m.pour - p.m.contre
      // Dès qu'un message a plus de dislikes que de likes, sa racine est rouge et zigzague ; plus il est rejeté,
      // plus les pics sont hauts.
      const rejet = solde < 0 ? .55 + .45 * Math.min(1, (-solde - 1) / (AVIS_PLEIN - 1)) : 0
      const adhesion = Math.min(1, Math.max(0, solde / AVIS_PLEIN))
      const pic = this.pics.get(p.m.id)
      if (pic) pic.cible = rejet
      else this.pics.set(p.m.id, { actuel: rejet, cible: rejet })
      const base = n.parent === null ? RACINE_IDEE : RACINE_REPONSE
      const teinte = adhesion > 0 ? melange(base, OR, adhesion) : rejet > 0 ? melange(base, ROUGE, .7 + .3 * rejet) : base
      // Un trait fin qui ondule à peine, comme une fibre nerveuse ; ses terminaisons, plus fines et plus pâles.
      f.regler('m' + p.m.id, {
        couleurA: teinte, couleurB: melange(teinte, '#ffffff', .25), eclat, rayon: .9, energie: .25,
        frise: 0, ampleur: 3 + L * .02, pousse: 1,
      })
      TERMINAISONS.forEach((_, k) => f.regler(`m${p.m.id}t${k}`, {
        couleurA: melange(teinte, '#ffffff', .25), couleurB: teinte, eclat: eclat * .7, rayon: .4, energie: .2,
        frise: 0, ampleur: 1.5, pousse: 1,
      }))
    }
    for (const b of d.brins) {
      const eteint = d.mode !== 'normal' && !d.selection.has(b.id)
      // la tige au bout d'un message sans réponse : violet clair, comme les racines des idées
      f.regler(b.cle, { couleurA: RACINE_IDEE, couleurB: melange(RACINE_IDEE, '#ffffff', .25), eclat: eteint ? .12 : 1.3, rayon: .9, energie: .25, frise: 0, ampleur: 4, pousse: b.tombe ? 0 : 1 })
    }
  }

  // Le bout d'une tige de fleur, au-delà d'un message qui attend une réponse.
  private tige(n: Noeud, a: V3) {
    // le texte est posé au-delà du bout de la racine : la tige part de l'autre côté du texte
    const depart = n.libre ? 300 : 200
    const pied = plus(a, n.dir, depart), tete = plus(a, n.dir, depart + BRIN * .8)
    return { debut: plus(a, n.dir, depart * .75), pied, tete }
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

    // Chaque message flotte ; sa racine part de son parent (qui flotte aussi) ou du cœur de la fleur.
    const amp = FLOTTEMENT * this.mouvement
    for (const n of d.noeuds.values()) this.ancres.set(n.id, plus(n.base, derive(n.id, temps, amp)))
    for (const n of d.noeuds.values()) {
      // une réponse à une idée flottante part de l'autre côté de son texte (comme sa tige), pas à travers
      const P = n.parent !== null ? d.noeuds.get(n.parent) : undefined, aP = P && this.ancres.get(P.id)
      const S = P && aP ? plus(aP, P.dir, P.libre ? AU_DELA_IDEE : AU_DELA_REPONSE) : departFleur(n)
      const pts = courbe3(S, this.ancres.get(n.id)!, n.id)
      this.traces.set(n.id, pts)
      // « de côté » : perpendiculaire à la racine telle qu'on la voit (et à la caméra)
      const fin = pts[pts.length - 1], u = unitaire([fin[0] - pts[28][0], fin[1] - pts[28][1], fin[2] - pts[28][2]])
      const cote = unitaire([u[1] * avant.z - u[2] * avant.y, u[2] * avant.x - u[0] * avant.z, u[0] * avant.y - u[1] * avant.x])
      // Le zigzag d'un message rejeté pousse (ou se résorbe) en douceur.
      const pic = this.pics.get(n.id)
      if (pic) pic.actuel += (pic.cible - pic.actuel) * (1 - Math.exp(-dt * 2.5))
      this.faisceaux.tracer('m' + n.id, pic && pic.actuel > .01 ? zigzag(pts, cote, pic.actuel) : pts)
      // Les terminaisons : elles quittent la racine peu avant le message et s'ouvrent en éventail, de part et
      // d'autre de la racine.
      TERMINAISONS.forEach(([i, ecart, avance], k) => {
        const depart = pts[i]
        const bout = plus(plus(fin, cote, ecart), u, avance)
        const vers = plus(plus(depart, u, avance * .6 + 8), cote, ecart * .35)
        this.faisceaux.tracer(`m${n.id}t${k}`, courbe(depart, vers, bout))
      })
    }
    for (const br of d.brins) {
      const n = d.noeuds.get(br.id), a = this.ancres.get(br.id)
      if (!n || !a) continue
      const { debut, pied, tete } = this.tige(n, a)
      this.faisceaux.tracer(br.cle, [debut, pied, tete])
    }

    // Le pétunia fait toujours face à la caméra. Il brille d'autant plus que le débat vit ;
    // quand tout le débat est pris pour une synthèse, il s'illumine.
    const fl = this.fleur
    fl.groupe.quaternion.copy(cam.quaternion)
    fl.groupe.updateMatrixWorld()
    fl.uniforms.uTaille.value = 1.15 * fl.ecart * h / (2 * Math.tan(THREE.MathUtils.degToRad(CHAMP / 2))) * this.rendu.ratio
    fl.uniforms.uEclat.value = (.55 + .45 * d.vie) * (d.fleurPrise ? 1.35 : 1)
    fl.uniforms.uTemps.value = temps

    // Le pointeur dans l'espace : là où la souris vise, à la profondeur de ce qu'on regarde.
    if (this.pointeurEcran) {
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(this.pointeurEcran.x / l * 2 - 1, -(this.pointeurEcran.y / h) * 2 + 1), cam)
      const plan = new THREE.Plane().setFromNormalAndCoplanarPoint(avant, c.cible)
      const p = new THREE.Vector3()
      if (ray.ray.intersectPlane(plan, p)) { this.faisceaux.pointeur(p.x, p.y, p.z); fl.pointeur(p) }
    } else { this.faisceaux.sansPointeur(); fl.pointeur(null) }

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
        const W = compose.offsetWidth, H = compose.offsetHeight
        let x = q.x - W / 2, y = q.y + dessous
        // Pas la place dessous (l'historique de la branche la rend haute) : elle se met à côté du message,
        // du côté où il y a le plus d'espace, pour ne jamais le cacher.
        if (y + H > h - 12 && d.regard !== 'fleur') {
          const ecart = 200 * s + 24
          x = q.x < l / 2 ? q.x + ecart : q.x - ecart - W
          y = q.y - H / 2
        }
        x = Math.max(12, Math.min(l - W - 12, x))
        y = Math.max(12, Math.min(h - H - 12, y))
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
    this.fleur.liberer()
    this.horloge.dispose()
    this.rendu.liberer()
  }
}
