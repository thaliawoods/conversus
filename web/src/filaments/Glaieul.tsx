// Le fond de la page de connexion : le glaïeul (assets/Gladiolus.svg) recomposé en milliers de grains de lumière bleue.
// Chaque grain bouge très légèrement, porté par un bruit continu : rien n'est une boucle écrite d'avance.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import imageGlaieul from '../assets/gladiolus.png'
import { BRUIT, POINT_DOUX } from './bruit'
import { creerRendu, mouvementReduit } from './rendu'
import { creerPoussiere } from './poussiere'

export const FOND_LOGIN = '#090b17'

// L'image fait 736 × 1288 ; dans la scène, la fleur mesure 1000 de haut.
const H = 1000, W = H * 736 / 1288
// La fleur remplit toute la page : on cadre assez serré pour que ses pétales couvrent l'écran en hauteur (ECHELLE)
// comme en largeur (COUVRE : la part de la largeur de la fleur visible d'un bord à l'autre de l'écran).
// CENTRE : le point de la fleur (en fraction de sa hauteur, depuis le haut) placé au milieu de l'écran.
const ECHELLE = 2
const COUVRE = 1.2
// Le nombre de grains sur la largeur de la fleur, et leur taille par rapport à l'écart entre deux grains.
const GRAINS_LARGEUR = 520
const GROSSEUR = 1.1
const CENTRE = .3
// Le décalage de la fleur vers la droite, en part de la largeur de l'écran (0 = centrée). Seulement sur écran large :
// sur téléphone, la fleur remplit tout l'écran et reste centrée.
const DECALAGE = .15

// Les bleus de la fleur, de l'ombre à la lumière : pétales (bleu roi profond → bleu vif → bleu glacier)
// et tige / feuilles (bleu nuit → bleu-vert), pour qu'on les distingue.
const PETALE = ['#0a1670', '#2f62ff', '#c4e6ff'].map(c => new THREE.Color(c))
const TIGE = ['#061d3d', '#1f5fa8', '#a9d4ff'].map(c => new THREE.Color(c))
const degrade = (cible: THREE.Color, stops: THREE.Color[], k: number) =>
  k < .55 ? cible.lerpColors(stops[0], stops[1], k / .55) : cible.lerpColors(stops[1], stops[2], (k - .55) / .45)
const contraste = (k: number) => { const t = Math.min(1, Math.max(0, (k - .3) / .62)); return t * t * (3 - 2 * t) }

const GRAINS_VERT = /* glsl */ `
${BRUIT}
uniform float uTemps;
uniform float uMouvement;
uniform float uTaille;
uniform vec3 uPointeur;
attribute vec3 aCouleur;
attribute vec2 aGrain;     // part de pétale (0 tige → 1 pétale), graine
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  float tm = uTemps * uMouvement;
  vec3 p = position;
  // Chaque grain flotte dans un champ de bruit ; les pétales plus que la tige.
  float amp = 1.2 + 7.0 * aGrain.x;
  p += vec3(snoise(vec3(p.xy * 0.006, tm * 0.08)),
            snoise(vec3(p.yx * 0.006 + 7.0, tm * 0.08)),
            snoise(vec3(p.xy * 0.006 + 13.0, tm * 0.08))) * amp;
  // Un souffle d'air qui fait ployer le haut de la fleur.
  p.x += snoise(vec3(0.0, p.y * 0.0015, tm * 0.05)) * 16.0 * smoothstep(-500.0, 500.0, p.y);
  // La main qui passe écarte doucement les grains.
  vec2 d = p.xy - uPointeur.xy;
  float infl = exp(-dot(d, d) / (80.0 * 80.0));
  p.xy += normalize(d + 1e-4) * infl * 22.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float vie = 0.75 + 0.25 * sin(uTemps * 0.7 + aGrain.y);
  vCouleur = aCouleur * vie * (1.0 + infl * 0.8);
  vAlpha = 0.7;
  gl_PointSize = uTaille / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const GRAINS_FRAG = /* glsl */ `
${POINT_DOUX}
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  float a = pointDoux() * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vCouleur, a);
}
`

// Lit l'image et garde un grain par pixel visible. La couleur d'origine (rose et verte) est remplacée
// par des bleus, en gardant la lumière de chaque pixel : le modelé des pétales reste intact.
function grains(img: HTMLImageElement) {
  // Échantillonnage dense : la fleur est très agrandie, les grains doivent rester serrés.
  const l = GRAINS_LARGEUR, h = Math.round(l * img.height / img.width)
  const cv = document.createElement('canvas')
  cv.width = l; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, l, h)
  const data = ctx.getImageData(0, 0, l, h).data
  const pos: number[] = [], col: number[] = [], grain: number[] = []
  const petale = new THREE.Color(), tige = new THREE.Color()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4
      if (data[i + 3] < 110) continue
      const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
      const rose = Math.max(0, Math.min(1, (r - g) * 2.2))
      const lumiere = Math.min(1, .3 * r + .59 * g + .11 * b)
      degrade(petale, PETALE, contraste(lumiere))
      degrade(tige, TIGE, contraste(lumiere))
      const c = tige.lerp(petale, rose)
      pos.push(((x + Math.random()) / l - .5) * W, (.5 - (y + Math.random()) / h) * H, (rose - .3) * 60 + (Math.random() - .5) * 16)
      col.push(c.r * .9, c.g * .9, c.b * .9)
      grain.push(rose, Math.random() * 100)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aCouleur', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('aGrain', new THREE.Float32BufferAttribute(grain, 2))
  return geo
}

// Deux sinus aux fréquences sans rapport entre elles : un balancement qui ne se répète jamais vraiment.
const derive = (t: number, a: number, b: number) => Math.sin(t * a) * .6 + Math.sin(t * b + 1.3) * .4

export default function Glaieul() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const rendu = creerRendu(cv, { fond: FOND_LOGIN, bloom: { force: .85, rayon: .4, seuil: .22 } })
    if (!rendu) return
    const mouvement = mouvementReduit() ? .25 : 1
    const camera = new THREE.PerspectiveCamera(32, 1, 10, 6000)
    // La distance de la caméra pour voir une hauteur donnée de la scène (recalculée à chaque redimensionnement).
    const distance = (hautVisible: number) => hautVisible / (2 * Math.tan(THREE.MathUtils.degToRad(16)))
    camera.position.set(0, 0, distance(H / ECHELLE))

    const fleur = new THREE.Group()
    rendu.scene.add(fleur)

    const uGrains = {
      uTemps: { value: 0 }, uMouvement: { value: mouvement },
      uTaille: { value: 5 * rendu.ratio * camera.position.z }, uPointeur: { value: new THREE.Vector3(1e6, 1e6, 0) },
    }
    const matGrains = new THREE.ShaderMaterial({
      uniforms: uGrains, vertexShader: GRAINS_VERT, fragmentShader: GRAINS_FRAG,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    })
    let nuage: THREE.Points | null = null
    const img = new Image()
    img.onload = () => {
      nuage = new THREE.Points(grains(img), matGrains)
      nuage.frustumCulled = false
      fleur.add(nuage)
    }
    img.src = imageGlaieul

    // La poussière d'étoiles qui flotte dans le fond.
    const poussiere = creerPoussiere({
      nombre: 700, etendue: { x: 1200, y: 700, z: 400 }, taille: 2.2 * rendu.ratio, mouvement,
      couleurs: ['#7CFFB2', '#FF8FB1', '#FFE27A', '#AEB3FF'],
    })
    rendu.scene.add(poussiere.objet)

    // La fleur remplit toute la page, derrière le bloc de connexion : sur un écran large, c'est la largeur
    // qui décide du cadrage, sur un téléphone la hauteur.
    const parent = cv.parentElement!
    const obs = new ResizeObserver(() => {
      const large = Math.max(1, parent.clientWidth), haut = Math.max(1, parent.clientHeight)
      rendu.dimensionner(large, haut)
      camera.aspect = large / haut
      const hautVisible = Math.min(H / ECHELLE, W * COUVRE / camera.aspect)
      const D = distance(hautVisible)
      camera.position.set(0, 0, D)
      camera.updateProjectionMatrix()
      // Les grains suivent le zoom : assez gros pour que la fleur reste pleine, sans se chevaucher.
      const ecartPx = haut / hautVisible * W / GRAINS_LARGEUR
      uGrains.uTaille.value = Math.max(2.4, GROSSEUR * ecartPx) * rendu.ratio * D
      const decalage = camera.aspect > 1 ? DECALAGE * hautVisible * camera.aspect : 0
      fleur.position.set(decalage, -(.5 - CENTRE) * H, 0)
    })
    obs.observe(parent)

    // Le pointeur : il penche un peu la fleur vers lui et écarte les grains sur son passage.
    const ndc = new THREE.Vector2(), visee = new THREE.Vector2(), repos = new THREE.Vector2()
    const etat = { dedans: false }
    const bouge = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect()
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      etat.dedans = true
    }
    const sort = () => { etat.dedans = false }
    addEventListener('pointermove', bouge)
    parent.addEventListener('pointerleave', sort)

    const rayon = new THREE.Raycaster(), plan = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), touche = new THREE.Vector3()
    const horloge = new THREE.Timer()
    rendu.renderer.setAnimationLoop((maintenant: number) => {
      horloge.update(maintenant)
      const dt = Math.min(.1, horloge.getDelta()), t = horloge.getElapsed()
      const tm = t * mouvement
      visee.lerp(etat.dedans ? ndc : repos, 1 - Math.exp(-dt * 1.5))
      fleur.rotation.y = visee.x * .22 + derive(tm, .11, .067) * .08
      fleur.rotation.x = -visee.y * .08 + derive(tm, .083, .051) * .03
      fleur.rotation.z = derive(tm, .07, .043) * .015
      fleur.updateMatrixWorld()

      if (etat.dedans) {
        rayon.setFromCamera(ndc, camera)
        if (rayon.ray.intersectPlane(plan, touche)) uGrains.uPointeur.value.copy(fleur.worldToLocal(touche))
      } else {
        uGrains.uPointeur.value.set(1e6, 1e6, 0)
      }
      uGrains.uTemps.value = t
      poussiere.uniforms.uTemps.value = t
      rendu.dessiner(camera)
    })

    return () => {
      rendu.renderer.setAnimationLoop(null)
      obs.disconnect()
      removeEventListener('pointermove', bouge)
      parent.removeEventListener('pointerleave', sort)
      nuage?.geometry.dispose()
      matGrains.dispose()
      poussiere.liberer()
      horloge.dispose()
      rendu.liberer()
    }
  }, [])

  return <canvas className="login-fond" ref={canvas} aria-hidden />
}
