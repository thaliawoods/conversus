// Une fleur en grains de lumière : une image recomposée en milliers de points bleus.
//   - le glaïeul (assets/gladiolus.png) : en grand derrière la connexion (Glaieul.tsx) et dans le panneau d'un canal ;
//   - le pétunia (assets/new/Petunia flower 2.svg) : au cœur de chaque ConVersus (Toile.tsx).
// Chaque grain bouge très légèrement, porté par un bruit continu.
// À la connexion (uExplose), la fleur éclate : chaque grain part du cœur vers l'extérieur, s'illumine puis s'éteint.
import * as THREE from 'three'
import imageGlaieul from '../assets/gladiolus.png'
import imagePetunia from '../assets/new/Petunia flower 2.svg'
import { BRUIT, POINT_DOUX } from './bruit'

// Le glaïeul : l'image fait 736 × 1288, détourée (fond transparent).
export const RAPPORT = 736 / 1288
// Le pétunia : une photo de 4071 × 4818 sur fond blanc ; la fleur y est vue de face, son cœur un peu au-dessus du milieu.
export const RAPPORT_PETUNIA = 4071 / 4818
export const COEUR_PETUNIA = .455

// Les bleus de la fleur, de l'ombre à la lumière : pétales (bleu roi profond → bleu vif → bleu glacier)
// et tige / feuilles (bleu nuit → bleu-vert), pour qu'on les distingue.
const PETALE = ['#0a1670', '#2f62ff', '#c4e6ff'].map(c => new THREE.Color(c))
const TIGE = ['#061d3d', '#1f5fa8', '#a9d4ff'].map(c => new THREE.Color(c))
const degrade = (cible: THREE.Color, stops: THREE.Color[], k: number) =>
  k < .55 ? cible.lerpColors(stops[0], stops[1], k / .55) : cible.lerpColors(stops[1], stops[2], (k - .55) / .45)
const contraste = (k: number) => { const t = Math.min(1, Math.max(0, (k - .3) / .62)); return t * t * (3 - 2 * t) }

// Les distances du shader sont pensées pour une fleur de 1000 de haut ; uEchelle les ramène à la taille voulue.
const VERT = /* glsl */ `
${BRUIT}
uniform float uTemps;
uniform float uMouvement;
uniform float uTaille;
uniform float uTailleMin;
uniform float uEchelle;
uniform float uEclat;
uniform vec3 uPointeur;
uniform float uExplose;
attribute vec3 aCouleur;
attribute vec2 aGrain;     // part de pétale (0 tige → 1 pétale), graine
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  float tm = uTemps * uMouvement;
  vec3 p = position / uEchelle;
  // Chaque grain flotte dans un champ de bruit ; les pétales plus que la tige.
  float amp = 1.2 + 7.0 * aGrain.x;
  p += vec3(snoise(vec3(p.xy * 0.006, tm * 0.08)),
            snoise(vec3(p.yx * 0.006 + 7.0, tm * 0.08)),
            snoise(vec3(p.xy * 0.006 + 13.0, tm * 0.08))) * amp;
  // Un souffle d'air qui fait ployer le haut de la fleur.
  p.x += snoise(vec3(0.0, p.y * 0.0015, tm * 0.05)) * 16.0 * smoothstep(-500.0, 500.0, p.y);
  // La main qui passe allume les grains sur son passage (et les pousse à peine).
  vec2 d = p.xy - uPointeur.xy / uEchelle;
  float infl = exp(-dot(d, d) / (95.0 * 95.0));
  p.xy += normalize(d + 1e-4) * infl * 2.5;
  // L'éclatement : chaque grain file du cœur vers l'extérieur (et un peu vers nous), dans un souffle tourbillonnant.
  float e = clamp(uExplose, 0.0, 1.0);
  float eclair = 0.0;
  if (e > 0.0) {
    float g = aGrain.y;
    vec3 ecart = vec3(sin(g * 3.1), cos(g * 1.7), sin(g * 0.9)) * 140.0;
    vec3 dir = normalize(vec3(p.xy, 150.0 + (fract(g * 0.37) - 0.3) * 500.0) + ecart);
    float vitesse = 0.3 + fract(g * 7.13);
    float k = 1.0 - pow(1.0 - e, 2.2);
    p += dir * k * (90.0 + 520.0 * vitesse);
    p += vec3(snoise(vec3(p.xy * 0.003, e * 1.5 + 1.0)), snoise(vec3(p.yx * 0.003 + 5.0, e * 1.5)), 0.0) * 70.0 * k;
    eclair = sin(min(e * 2.2, 1.0) * 3.14159);
  }
  vec4 mv = modelViewMatrix * vec4(p * uEchelle, 1.0);
  float vie = 0.75 + 0.25 * sin(uTemps * 0.7 + aGrain.y);
  vCouleur = aCouleur * vie * uEclat * (1.0 + infl * 1.6) * (1.0 + 2.2 * eclair);
  vAlpha = 0.7 * (1.0 - smoothstep(0.5, 1.0, e));
  gl_PointSize = max(uTailleMin, uTaille / -mv.z) * (1.0 + 0.6 * eclair);
  gl_Position = projectionMatrix * mv;
}
`
const FRAG = /* glsl */ `
${POINT_DOUX}
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  float a = pointDoux() * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vCouleur, a);
}
`

// Lit l'image et garde un grain par pixel de la fleur (pixel opaque, et pas blanc quand l'image a un fond blanc).
// La couleur d'origine est remplacée par des bleus, en gardant la lumière de chaque pixel : le modelé des pétales
// reste intact. Les pétales (roses, violets) prennent les bleus des pétales ; tige, feuilles et cœur, les bleus sombres.
function grains(img: HTMLImageElement, largeurGrains: number, H: number, rapport: number, fondBlanc: boolean) {
  const W = H * rapport
  const l = largeurGrains, h = Math.round(l / rapport)
  const cv = document.createElement('canvas')
  cv.width = l; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, l, h)
  const data = ctx.getImageData(0, 0, l, h).data
  const pos: number[] = [], col: number[] = [], grain: number[] = []
  const petale = new THREE.Color(), tige = new THREE.Color()
  const k = H / 1000
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4
      if (data[i + 3] < 110) continue
      const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
      if (fondBlanc && Math.min(r, g, b) > .9 && Math.max(r, g, b) - Math.min(r, g, b) < .08) continue
      const rose = Math.max(0, Math.min(1, (Math.max(r, b) - g) * 2.2))
      const lumiere = Math.min(1, .3 * r + .59 * g + .11 * b)
      degrade(petale, PETALE, contraste(lumiere))
      degrade(tige, TIGE, contraste(lumiere))
      const c = tige.lerp(petale, rose)
      pos.push(((x + Math.random()) / l - .5) * W, (.5 - (y + Math.random()) / h) * H, ((rose - .3) * 60 + (Math.random() - .5) * 16) * k)
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

type Options = { hauteur: number; grainsLargeur: number; mouvement: number; centre?: number }

export const creerGlaieul = (o: Options) => creerFleurEnGrains({ ...o, image: imageGlaieul, rapport: RAPPORT, fondBlanc: false })
export const creerPetunia = (o: Options) =>
  creerFleurEnGrains({ centre: COEUR_PETUNIA, ...o, image: imagePetunia, rapport: RAPPORT_PETUNIA, fondBlanc: true })

// hauteur : hauteur de l'image dans la scène · grainsLargeur : nombre de grains sur la largeur de l'image
// centre : le point de l'image (fraction de la hauteur, depuis le haut) placé à l'origine du groupe.
// `groupe` se place et s'oriente dans la scène ; `interieur` sert à ramener le pointeur dans le repère des grains.
function creerFleurEnGrains(o: Options & { image: string; rapport: number; fondBlanc: boolean }) {
  const H = o.hauteur, W = H * o.rapport
  const uniforms = {
    uTemps: { value: 0 }, uMouvement: { value: o.mouvement },
    uTaille: { value: 1000 }, uTailleMin: { value: 0 }, uEchelle: { value: H / 1000 }, uEclat: { value: 1 },
    uPointeur: { value: new THREE.Vector3(1e6, 1e6, 0) }, uExplose: { value: 0 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  })
  const groupe = new THREE.Group()
  const interieur = new THREE.Group()
  interieur.position.y = -(.5 - (o.centre ?? .5)) * H
  groupe.add(interieur)

  let nuage: THREE.Points | null = null
  let libere = false
  const img = new Image()
  img.onload = () => {
    if (libere) return
    nuage = new THREE.Points(grains(img, o.grainsLargeur, H, o.rapport, o.fondBlanc), mat)
    nuage.frustumCulled = false
    interieur.add(nuage)
  }
  img.src = o.image

  return {
    groupe, interieur, uniforms,
    hauteur: H, largeur: W,
    ecart: W / o.grainsLargeur,           // distance entre deux grains voisins (unités de la scène)
    // Le pointeur, donné dans le repère du monde (ou null quand il n'est pas là).
    pointeur(monde: THREE.Vector3 | null) {
      if (!monde) { uniforms.uPointeur.value.set(1e6, 1e6, 0); return }
      interieur.updateMatrixWorld()
      uniforms.uPointeur.value.copy(interieur.worldToLocal(monde.clone()))
    },
    liberer() { libere = true; nuage?.geometry.dispose(); mat.dispose() },
  }
}
