// La poussière lumineuse qui flotte autour des filaments (comme du pollen dans la nuit).
// Chaque grain dérive dans un champ de bruit continu ; les grains « lointains » bougent moins
// quand on se déplace (parallaxe), ce qui donne de la profondeur.
import * as THREE from 'three'
import { BRUIT, POINT_DOUX } from './bruit'

const VERT = /* glsl */ `
${BRUIT}
uniform float uTemps;
uniform float uMouvement;
uniform float uTaille;
uniform vec2 uDecalage;
attribute vec3 aCouleur;
attribute vec2 aGrain;     // profondeur (0 loin → 1 près), graine
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  float tm = uTemps * uMouvement;
  vec3 p = position;
  p.x += snoise(vec3(p.xy * 0.002, tm * 0.03 + aGrain.y)) * 40.0;
  p.y += snoise(vec3(p.yx * 0.002, tm * 0.03 + aGrain.y + 9.0)) * 40.0;
  p.xy += uDecalage * (1.0 - aGrain.x);
  float scintille = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTemps * (0.6 + aGrain.y * 0.02) + aGrain.y));
  vCouleur = aCouleur * scintille;
  vAlpha = 0.35 + 0.65 * aGrain.x;
  gl_PointSize = uTaille * (0.5 + aGrain.x);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`
const FRAG = /* glsl */ `
${POINT_DOUX}
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  float a = pointDoux() * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCouleur, a);
}
`

export function creerPoussiere(o: {
  nombre: number
  etendue: { x: number; y: number; z?: number }   // demi-étendue autour de l'origine
  couleurs: string[]
  taille: number
  mouvement: number
}) {
  const n = o.nombre
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), grain = new Float32Array(n * 2)
  const couleurs = o.couleurs.map(c => new THREE.Color(c))
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() * 2 - 1) * o.etendue.x, (Math.random() * 2 - 1) * o.etendue.y, (Math.random() * 2 - 1) * (o.etendue.z ?? 0)], i * 3)
    const c = couleurs[i % couleurs.length].clone().multiplyScalar(.35 + .65 * Math.random())
    col.set([c.r, c.g, c.b], i * 3)
    grain.set([Math.random() ** 2, Math.random() * 100], i * 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aCouleur', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aGrain', new THREE.BufferAttribute(grain, 2))
  const uniforms = {
    uTemps: { value: 0 },
    uMouvement: { value: o.mouvement },
    uTaille: { value: o.taille },
    uDecalage: { value: new THREE.Vector2() },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  })
  const objet = new THREE.Points(geo, mat)
  objet.frustumCulled = false
  return { objet, uniforms, liberer: () => { geo.dispose(); mat.dispose() } }
}
