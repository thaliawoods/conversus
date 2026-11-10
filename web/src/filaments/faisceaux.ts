// Les faisceaux de filaments : chaque lien est une double hélice (comme l'ADN) faite de brins très fins,
// qui suit une ligne centrale. Tout est calculé sur la carte graphique, en un seul dessin pour tous les liens :
//   - la ligne centrale de chaque faisceau est rangée dans une texture (une ligne de texture par faisceau) ;
//   - ses réglages (couleurs, éclat, largeur, énergie…) dans une seconde texture ;
//   - chaque sommet sait à quel faisceau il appartient, où il est sur la longueur (t) et quel brin il dessine.
// Le mouvement vient d'un bruit continu dans le temps (bruit.ts) et de l'attraction du pointeur :
// rien n'est une boucle écrite d'avance. Les changements d'état (pousse, éclat, largeur) sont amortis.
// En plus des brins, un faisceau peut porter des grains de lumière (comme le glaïeul de la connexion) :
//   - les grains de base, serrés le long du lien ;
//   - les grains « rejet » (dislikes) : un zigzag nerveux, qui tire vers le rouge ;
//   - les grains « adhésion » (likes) : des spirales dorées qui s'entrelacent.
// Les deux derniers arrivent en volant, petit à petit, quand le nombre de likes / dislikes change.
import * as THREE from 'three'
import { BRUIT, POINT_DOUX } from './bruit'

export const ECH = 128          // points de la ligne centrale (assez pour garder les pics d'un zigzag)
const SEGMENTS = 128            // segments par brin
const PARAMS = 5                // texels de réglages par faisceau

export type Pt3 = [number, number, number]

export type Reglage = {
  couleurA: string              // au départ du faisceau
  couleurB: string              // à l'arrivée
  eclat: number                 // luminosité
  rayon: number                 // demi-largeur de l'hélice (unités du monde)
  energie: number               // vivacité du mouvement des brins
  frise: number                 // 0 = sage, 1 = effiloché
  ampleur: number               // amplitude de l'ondulation du faisceau entier (unités du monde)
  pousse: number                // 0 → 1 : jusqu'où le faisceau a poussé
  rejet?: number                // 0 → 1 : part des grains en zigzag (dislikes) présents
  adhesion?: number             // 0 → 1 : part des grains en spirale (likes) présents
}

export type Def = {
  cle: string
  brins: number                 // nombre de brins
  etincelles: number            // points lumineux qui voyagent le long
  torsion: number               // tours d'hélice sur la longueur
  pinceDebut: boolean           // les brins se rejoignent au départ
  pinceFin: boolean             // … et à l'arrivée
  graine: number
  attente?: number              // secondes avant de commencer à pousser
  symetrique?: boolean          // couleur A aux deux bouts, B au milieu (boucles, pétales)
  grains?: number               // grains de lumière le long du lien
  zigzag?: number               // grains en réserve pour les dislikes
  spirale?: number              // grains en réserve pour les likes
}

type Etat = {
  def: Def
  ligne: number
  actuel: Reglage
  cible: Reglage
  attente: number
  A: THREE.Color
  B: THREE.Color
  versA: THREE.Color            // les couleurs visées : A et B y glissent en douceur
  versB: THREE.Color
}

const alea = (k: number, s: number) => { const x = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x) }

const COMMUN = /* glsl */ `
#define ECH ${ECH}
uniform sampler2D uCentre;
uniform sampler2D uParams;
uniform float uTemps;
uniform float uMouvement;
uniform vec3 uPointeur;
uniform float uPortee;
uniform float uIntensite;
${BRUIT}

vec3 centreA(int ligne, float t) {
  float f = clamp(t, 0.0, 1.0) * float(ECH - 1);
  int i = int(floor(f));
  int j = min(i + 1, ECH - 1);
  vec3 a = texelFetch(uCentre, ivec2(i, ligne), 0).xyz;
  vec3 b = texelFetch(uCentre, ivec2(j, ligne), 0).xyz;
  return mix(a, b, f - float(i));
}

// Le repère du faisceau à l'abscisse t : le point de la ligne centrale (qui ondule doucement, bouts accrochés),
// deux directions perpendiculaires (n, bn), le resserrement aux bouts (env) et le poids du milieu.
vec3 repere(int ligne, float t, out vec3 n, out vec3 bn, out float env, out float milieu) {
  vec4 p3 = texelFetch(uParams, ivec2(3, ligne), 0);   // pince début, pince fin, graine, ampleur
  float graine = p3.z, ampleur = p3.w;
  float tm = uTemps * uMouvement;

  vec3 c = centreA(ligne, t);
  float dt = 1.0 / float(ECH - 1);
  vec3 tg = centreA(ligne, t + dt) - centreA(ligne, t - dt);
  float L = length(tg);
  tg = L > 1e-5 ? tg / L : vec3(1.0, 0.0, 0.0);
  n = cross(tg, vec3(0.0, 0.0, 1.0));
  n = length(n) < 1e-3 ? vec3(1.0, 0.0, 0.0) : normalize(n);
  bn = cross(tg, n);

  // Les brins se resserrent aux bouts accrochés (comme deux êtres qui se relient).
  float ea = p3.x > 0.5 ? sin(min(t / 0.3, 1.0) * 1.5708) : 1.0;
  float eb = p3.y > 0.5 ? sin(min((1.0 - t) / 0.3, 1.0) * 1.5708) : 1.0;
  env = pow(ea * eb, 0.8);
  milieu = sin(3.14159 * clamp(t, 0.0, 1.0));

  // Le faisceau entier ondule doucement ; ses bouts restent accrochés.
  float o1 = snoise(vec3(t * 1.6 + graine, tm * 0.06, graine * 0.37));
  float o2 = snoise(vec3(t * 1.6 + graine + 17.0, tm * 0.06, graine * 0.37 + 5.0));
  return c + (n * o1 + bn * o2 * 0.7) * ampleur * milieu;
}

// La position d'un brin à l'abscisse t, et ce qu'il faut pour le colorer.
vec3 brin(int ligne, float t, vec4 b, out vec3 couleur, out float lum, out float visible) {
  vec4 p0 = texelFetch(uParams, ivec2(0, ligne), 0);   // pousse, éclat, rayon, énergie
  vec4 p1 = texelFetch(uParams, ivec2(1, ligne), 0);   // couleur A, frise
  vec4 p2 = texelFetch(uParams, ivec2(2, ligne), 0);   // couleur B, torsion
  vec4 p3 = texelFetch(uParams, ivec2(3, ligne), 0);
  vec4 p4 = texelFetch(uParams, ivec2(4, ligne), 0);   // symétrique, rejet, adhésion
  float pousse = p0.x, eclat = p0.y, rayon = p0.z, energie = p0.w;
  float frise = p1.w, torsion = p2.w, graine = p3.z;
  float tm = uTemps * uMouvement;

  vec3 n, bn; float env, milieu;
  vec3 c = repere(ligne, t, n, bn, env, milieu);

  // La double hélice : chaque brin tourne autour de la ligne centrale.
  float th = b.x + torsion * 6.28318 * t + tm * (0.12 + 0.18 * b.z) * (0.5 + energie);
  float freq = 2.0 + 7.0 * frise;
  float d1 = snoise(vec3(t * freq + b.w, tm * (0.08 + 0.1 * energie), graine));
  float d2 = snoise(vec3(t * freq + b.w + 31.0, tm * (0.08 + 0.1 * energie), graine + 3.0));
  float r = rayon * b.y * env * (1.0 + frise * d1 * 0.9);
  vec3 pos = c + (n * cos(th) + bn * sin(th)) * r
               + (n * d2 + bn * d1) * rayon * (0.18 + 0.25 * energie + 1.6 * frise) * env;

  // Le pointeur attire les brins, un peu comme une main qui passe dans des cheveux (en 3D : le pointeur est
  // le point de l'espace visé par la souris, à la profondeur de ce qu'on regarde).
  vec3 d = uPointeur - pos;
  float infl = exp(-dot(d, d) / (uPortee * uPortee));
  pos += d * infl * 0.3 * milieu;

  float face = sin(th);                                  // devant / derrière : relief
  visible = step(t, pousse);
  float pointe = smoothstep(pousse - 0.07, pousse, t) * step(pousse, 0.995);
  couleur = mix(p1.rgb, p2.rgb, p4.x > 0.5 ? 1.0 - abs(2.0 * t - 1.0) : t);
  lum = eclat * (0.5 + 0.5 * face) + pointe * 1.6 + infl * 0.5;
  return pos;
}
`

const LIGNES_VERT = /* glsl */ `
${COMMUN}
attribute float aFaisceau;
attribute float aT;
attribute vec4 aBrin;
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  vec3 couleur; float lum, visible;
  vec3 pos = brin(int(aFaisceau + 0.5), aT, aBrin, couleur, lum, visible);
  vCouleur = couleur * lum;
  vAlpha = visible * uIntensite;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`
const LIGNES_FRAG = /* glsl */ `
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  if (vAlpha < 0.01) discard;
  gl_FragColor = vec4(vCouleur, vAlpha);
}
`

const POINTS_VERT = /* glsl */ `
${COMMUN}
uniform float uTaille;
attribute float aFaisceau;
attribute float aT;
attribute vec4 aBrin;
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  // Les étincelles voyagent du départ vers l'arrivée : ce qui circule entre les messages.
  float t = fract(aT + uTemps * uMouvement * (0.03 + 0.07 * aBrin.z));
  vec3 couleur; float lum, visible;
  vec3 pos = brin(int(aFaisceau + 0.5), t, aBrin, couleur, lum, visible);
  float scintille = 0.6 + 0.4 * sin(uTemps * (1.5 + 3.0 * aBrin.z) + aBrin.w);
  vCouleur = mix(couleur, vec3(1.0), 0.35) * lum * scintille;
  vAlpha = visible * sin(3.14159 * t);
  gl_PointSize = uTaille * (0.7 + 0.8 * aBrin.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`
const POINTS_FRAG = /* glsl */ `
${POINT_DOUX}
varying vec3 vCouleur;
varying float vAlpha;
void main() {
  float a = pointDoux() * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCouleur, a);
}
`

// Les grains de lumière d'un lien. aGrain : famille (0 base, 1 rejet, 2 adhésion), rang d'arrivée, deux aléas.
const GRAINS_VERT = /* glsl */ `
${COMMUN}
uniform float uTailleGrain;
uniform vec3 uRouge;
uniform vec3 uOr;
attribute float aFaisceau;
attribute float aT;
attribute vec4 aGrain;
varying vec3 vCouleur;
varying float vAlpha;

float hache(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }

void main() {
  int ligne = int(aFaisceau + 0.5);
  vec4 p0 = texelFetch(uParams, ivec2(0, ligne), 0);
  vec4 p1 = texelFetch(uParams, ivec2(1, ligne), 0);
  vec4 p2 = texelFetch(uParams, ivec2(2, ligne), 0);
  vec4 p3 = texelFetch(uParams, ivec2(3, ligne), 0);
  vec4 p4 = texelFetch(uParams, ivec2(4, ligne), 0);
  float pousse = p0.x, eclat = p0.y, rayon = p0.z, energie = p0.w, graine = p3.z;
  float tm = uTemps * uMouvement;
  float famille = aGrain.x, rang = aGrain.y, a1 = aGrain.z, a2 = aGrain.w;

  float t = aT;
  float presence = 1.0;
  float taille = 1.0;
  if (famille > 1.5) t = fract(aT + tm * 0.012);           // les spirales coulent doucement le long du lien

  vec3 n, bn; float env, milieu;
  vec3 c = repere(ligne, t, n, bn, env, milieu);
  vec3 couleur = mix(p1.rgb, p2.rgb, p4.x > 0.5 ? 1.0 - abs(2.0 * t - 1.0) : t);
  float lum = eclat;
  vec3 pos;

  if (famille < 0.5) {
    // Les grains de base : un nuage serré autour de la ligne, qui respire dans un champ de bruit.
    float ang = a1 * 6.28318 + tm * (0.1 + 0.2 * a2);
    float r = rayon * 1.15 * sqrt(a2) * env;
    pos = c + (n * cos(ang) + bn * sin(ang)) * r;
    pos += vec3(snoise(vec3(a1 * 40.0, tm * 0.08, graine)),
                snoise(vec3(a2 * 40.0 + 7.0, tm * 0.08, graine)),
                snoise(vec3(a1 * 40.0 + 13.0, tm * 0.08, graine + 3.0))) * (1.2 + 1.6 * energie) * env;
    lum *= 0.7 + 0.3 * sin(uTemps * 0.7 + a1 * 60.0);
  } else if (famille < 1.5) {
    // Le rejet : un zigzag aux dents vives, qui tremble.
    presence = clamp((p4.y * 1.25 - rang) / 0.25, 0.0, 1.0);
    float dent = abs(fract(t * 11.0) * 2.0 - 1.0) * 2.0 - 1.0;
    float tremble = snoise(vec3(t * 28.0, tm * 2.2, graine));
    pos = c + n * dent * rayon * 3.6 * env
            + bn * tremble * rayon * 0.6 * env
            + (n * (a1 - 0.5) + bn * (a2 - 0.5)) * rayon * 0.5;
    couleur = mix(couleur, uRouge, 0.7);
    lum *= 1.15 + 0.35 * snoise(vec3(a1 * 30.0, uTemps * 3.0, 1.0));
  } else {
    // L'adhésion : quatre spirales, deux dans chaque sens, qui s'entrelacent harmonieusement.
    presence = clamp((p4.z * 1.25 - rang) / 0.25, 0.0, 1.0);
    float k = floor(a1 * 4.0);
    float sens = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
    float ang = k * 1.5708 + sens * (t * 6.28318 * 2.5 + tm * 0.7);
    float r = rayon * 2.3 * env * (0.82 + 0.18 * sin(t * 9.0 + tm * 1.1 + k));
    pos = c + (n * cos(ang) + bn * sin(ang)) * r + (n * (a2 - 0.5)) * rayon * 0.35;
    couleur = mix(couleur, uOr, 0.8);
    lum *= 1.2 + 0.3 * sin(uTemps * 1.6 + a2 * 40.0);
    taille = 1.25;
  }

  // Arrivée (ou départ) d'un grain : il vient de loin, en volant, et se pose à sa place.
  if (famille > 0.5) {
    vec3 loin = normalize(vec3(hache(a1 * 91.0), hache(a2 * 53.0), hache(a1 + a2 * 7.0)) * 2.0 - 1.0);
    float e = 1.0 - pow(1.0 - presence, 3.0);
    vec3 tourbillon = (n * sin(a2 * 20.0 + presence * 4.0) + bn * cos(a1 * 20.0 + presence * 4.0)) * 40.0;
    pos += (loin * (110.0 + 190.0 * a2) + tourbillon) * (1.0 - e);
    lum *= 1.0 + 1.5 * (1.0 - presence) * presence * 4.0;   // ils brillent en vol
  }

  // Le pointeur attire un peu les grains, comme les brins.
  vec3 d = uPointeur - pos;
  float infl = exp(-dot(d, d) / (uPortee * uPortee));
  pos += d * infl * 0.25 * milieu;

  float visible = step(t, pousse);
  vCouleur = mix(couleur, vec3(1.0), 0.15) * lum * (1.0 + infl * 0.6);
  vAlpha = visible * presence * 0.85;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = clamp(uTailleGrain / max(1.0, -mv.z), 1.0, 7.0) * (0.7 + 0.6 * a1) * taille;
  gl_Position = projectionMatrix * mv;
}
`

export class Faisceaux {
  readonly groupe = new THREE.Group()
  readonly uniforms
  private etats = new Map<string, Etat>()
  private capacite = 0
  private centre!: THREE.DataTexture
  private params!: THREE.DataTexture
  private lignes: THREE.LineSegments
  private points: THREE.Points
  private grains: THREE.Points
  private signature = ''

  // intensite : opacité de chaque brin (beaucoup de brins fins qui s'additionnent, puis le bloom)
  // tailleGrain : taille d'un grain en pixels × distance à la caméra (les grains suivent la perspective)
  constructor(o: { taillePoint: number; portee: number; mouvement: number; intensite: number; tailleGrain?: number }) {
    this.uniforms = {
      uCentre: { value: null as THREE.DataTexture | null },
      uParams: { value: null as THREE.DataTexture | null },
      uTemps: { value: 0 },
      uMouvement: { value: o.mouvement },
      uPointeur: { value: new THREE.Vector3(1e6, 1e6, 0) },
      uPortee: { value: o.portee },
      uTaille: { value: o.taillePoint },
      uIntensite: { value: o.intensite },
      uTailleGrain: { value: o.tailleGrain ?? 2000 },
      uRouge: { value: new THREE.Color('#FF3B3B') },
      uOr: { value: new THREE.Color('#FFDF4E') },
    }
    this.agrandir(32)
    const commun = { uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }
    this.lignes = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ ...commun, vertexShader: LIGNES_VERT, fragmentShader: LIGNES_FRAG }))
    this.points = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ ...commun, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG }))
    this.grains = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ ...commun, vertexShader: GRAINS_VERT, fragmentShader: POINTS_FRAG }))
    for (const m of [this.lignes, this.points, this.grains]) { m.frustumCulled = false; this.groupe.add(m) }
  }

  private agrandir(n: number) {
    const cap = Math.max(32, 2 ** Math.ceil(Math.log2(n)))
    if (cap <= this.capacite) return
    const ancienC = this.centre?.image.data as Float32Array | undefined
    const ancienP = this.params?.image.data as Float32Array | undefined
    const dc = new Float32Array(ECH * cap * 4), dp = new Float32Array(PARAMS * cap * 4)
    if (ancienC) dc.set(ancienC)
    if (ancienP) dp.set(ancienP)
    this.centre?.dispose(); this.params?.dispose()
    const tex = (d: Float32Array, l: number) => {
      const t = new THREE.DataTexture(d, l, cap, THREE.RGBAFormat, THREE.FloatType)
      t.minFilter = t.magFilter = THREE.NearestFilter
      t.needsUpdate = true
      return t
    }
    this.centre = tex(dc, ECH)
    this.params = tex(dp, PARAMS)
    this.uniforms.uCentre.value = this.centre
    this.uniforms.uParams.value = this.params
    this.capacite = cap
  }

  // La liste complète des faisceaux à montrer. Ceux qui disparaissent de la liste sont retirés ;
  // les nouveaux commencent sans avoir poussé et poussent vers leur cible.
  definir(defs: Def[]) {
    const vus = new Set(defs.map(d => d.cle))
    for (const cle of [...this.etats.keys()]) if (!vus.has(cle)) this.etats.delete(cle)
    this.agrandir(defs.length)
    const prises = new Set([...this.etats.values()].map(e => e.ligne))
    const libres = Array.from({ length: this.capacite }, (_, i) => i).filter(i => !prises.has(i))
    for (const def of defs) {
      const e = this.etats.get(def.cle)
      if (e) { e.def = def; continue }
      const ligne = libres.shift()!
      const zero: Reglage = { couleurA: '#ffffff', couleurB: '#ffffff', eclat: 0, rayon: 0, energie: 0, frise: 0, ampleur: 0, pousse: 0, rejet: 0, adhesion: 0 }
      this.etats.set(def.cle, {
        def, ligne, actuel: { ...zero }, cible: { ...zero }, attente: def.attente ?? 0,
        A: new THREE.Color(), B: new THREE.Color(), versA: new THREE.Color(), versB: new THREE.Color(),
      })
    }
    const signature = defs.map(d => `${d.cle}:${d.brins}:${d.etincelles}:${d.grains ?? 0}:${d.zigzag ?? 0}:${d.spirale ?? 0}`).join('|')
    if (signature !== this.signature) { this.signature = signature; this.construire() }
  }

  // Le réglage visé : on y va en douceur. `immediat` saute directement (premier réglage, couleurs).
  regler(cle: string, r: Partial<Reglage>, immediat = false) {
    const e = this.etats.get(cle)
    if (!e) return
    const neuf = e.actuel.rayon === 0 && e.actuel.eclat === 0
    Object.assign(e.cible, r)
    if (immediat || neuf) {
      const { pousse, ...sansPousse } = r
      Object.assign(e.actuel, sansPousse)
      if (immediat && pousse !== undefined) e.actuel.pousse = pousse
    }
    if (r.couleurA) e.versA.set(r.couleurA)
    if (r.couleurB) e.versB.set(r.couleurB)
    if (immediat || neuf) { e.A.copy(e.versA); e.B.copy(e.versB) }
  }

  // La ligne centrale d'un faisceau (rééchantillonnée régulièrement le long de sa longueur).
  tracer(cle: string, pts: Pt3[]) {
    const e = this.etats.get(cle)
    if (!e || pts.length < 2) return
    const longueurs = [0]
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]]
      longueurs.push(longueurs[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))
    }
    const total = longueurs[longueurs.length - 1] || 1
    const d = this.centre.image.data as Float32Array
    let k = 0
    for (let s = 0; s < ECH; s++) {
      const voulu = total * s / (ECH - 1)
      while (k < pts.length - 2 && longueurs[k + 1] < voulu) k++
      const f = Math.min(1, Math.max(0, (voulu - longueurs[k]) / ((longueurs[k + 1] - longueurs[k]) || 1)))
      const o = (e.ligne * ECH + s) * 4
      for (let c = 0; c < 3; c++) d[o + c] = pts[k][c] + (pts[k + 1][c] - pts[k][c]) * f
      d[o + 3] = 1
    }
    this.centre.needsUpdate = true
  }

  pointeur(x: number, y: number, z = 0) { this.uniforms.uPointeur.value.set(x, y, z) }
  sansPointeur() { this.uniforms.uPointeur.value.set(1e6, 1e6, 0) }

  // Une image : le temps avance, les réglages glissent vers leur cible, et on les envoie au GPU.
  avancer(dt: number, temps: number) {
    this.uniforms.uTemps.value = temps
    const lisse = (k: number) => 1 - Math.exp(-dt * k)
    const p = this.params.image.data as Float32Array
    for (const e of this.etats.values()) {
      const a = e.actuel, c = e.cible
      if (e.attente > 0) e.attente -= dt
      else a.pousse += (c.pousse - a.pousse) * lisse(c.pousse > a.pousse ? 1.6 : 2.6)
      for (const k of ['eclat', 'rayon', 'energie', 'frise', 'ampleur'] as const) a[k] += (c[k] - a[k]) * lisse(3.2)
      // Les grains de like / dislike arrivent (ou repartent) à pas réguliers : on voit chacun venir.
      for (const k of ['rejet', 'adhesion'] as const) {
        const ecart = (c[k] ?? 0) - (a[k] ?? 0)
        a[k] = (a[k] ?? 0) + Math.max(-dt * .3, Math.min(dt * .3, ecart))
      }
      e.A.lerp(e.versA, lisse(1.8)); e.B.lerp(e.versB, lisse(1.8))
      const o = e.ligne * PARAMS * 4
      p.set([a.pousse, a.eclat, a.rayon, a.energie,
             e.A.r, e.A.g, e.A.b, a.frise,
             e.B.r, e.B.g, e.B.b, e.def.torsion,
             e.def.pinceDebut ? 1 : 0, e.def.pinceFin ? 1 : 0, e.def.graine % 97, a.ampleur,
             e.def.symetrique ? 1 : 0, a.rejet ?? 0, a.adhesion ?? 0, 0], o)
    }
    this.params.needsUpdate = true
  }

  private construire() {
    let nL = 0, nP = 0, nG = 0
    for (const e of this.etats.values()) {
      nL += e.def.brins * SEGMENTS * 2; nP += e.def.etincelles
      nG += (e.def.grains ?? 0) + (e.def.zigzag ?? 0) + (e.def.spirale ?? 0)
    }
    const lF = new Float32Array(nL), lT = new Float32Array(nL), lB = new Float32Array(nL * 4)
    const pF = new Float32Array(nP), pT = new Float32Array(nP), pB = new Float32Array(nP * 4)
    const gF = new Float32Array(nG), gT = new Float32Array(nG), gB = new Float32Array(nG * 4)
    let i = 0, j = 0, q = 0
    for (const e of this.etats.values()) {
      const g = e.def.graine
      const unBrin = (k: number): number[] => {
        // Deux brins principaux à l'opposé (la double hélice), chacun fait de fils un peu écartés.
        const phase = (k % 2) * Math.PI + (alea(g + k, 1) - .5) * .9
        return [phase, .45 + .55 * alea(g + k, 2), alea(g + k, 3), alea(g + k, 4) * 50]
      }
      for (let k = 0; k < e.def.brins; k++) {
        const b = unBrin(k)
        for (let s = 0; s < SEGMENTS; s++) {
          for (const t of [s / SEGMENTS, (s + 1) / SEGMENTS]) {
            lF[i] = e.ligne; lT[i] = t; lB.set(b, i * 4); i++
          }
        }
      }
      for (let k = 0; k < e.def.etincelles; k++) {
        pF[j] = e.ligne; pT[j] = alea(g + k, 7); pB.set(unBrin(k + 1000), j * 4); j++
      }
      // Les grains, répartis régulièrement le long du lien (un peu de hasard dans chaque case).
      // Le rang décide de l'ordre d'arrivée des grains de like / dislike : un ordre mélangé, pour qu'ils
      // arrivent de partout à la fois et pas d'un bout à l'autre.
      const familles = [[0, e.def.grains ?? 0], [1, e.def.zigzag ?? 0], [2, e.def.spirale ?? 0]] as const
      for (const [f, n] of familles) {
        for (let k = 0; k < n; k++) {
          const h = g * 7 + f * 1009 + k
          gF[q] = e.ligne; gT[q] = (k + alea(h, 11)) / n
          gB.set([f, alea(h, 12), alea(h, 13), alea(h, 14)], q * 4); q++
        }
      }
    }
    const geo = (F: Float32Array, T: Float32Array, B: Float32Array) => {
      const g = new THREE.BufferGeometry()
      // Les positions sont calculées dans le shader : l'attribut position ne sert qu'à compter les sommets.
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(F.length * 3), 3))
      g.setAttribute('aFaisceau', new THREE.BufferAttribute(F, 1))
      g.setAttribute('aT', new THREE.BufferAttribute(T, 1))
      g.setAttribute('aBrin', new THREE.BufferAttribute(B, 4))
      return g
    }
    this.lignes.geometry.dispose(); this.points.geometry.dispose(); this.grains.geometry.dispose()
    this.lignes.geometry = geo(lF, lT, lB)
    this.points.geometry = geo(pF, pT, pB)
    const gg = new THREE.BufferGeometry()
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gF.length * 3), 3))
    gg.setAttribute('aFaisceau', new THREE.BufferAttribute(gF, 1))
    gg.setAttribute('aT', new THREE.BufferAttribute(gT, 1))
    gg.setAttribute('aGrain', new THREE.BufferAttribute(gB, 4))
    this.grains.geometry = gg
  }

  liberer() {
    this.lignes.geometry.dispose(); this.points.geometry.dispose(); this.grains.geometry.dispose()
    ;(this.lignes.material as THREE.Material).dispose(); (this.points.material as THREE.Material).dispose()
    ;(this.grains.material as THREE.Material).dispose()
    this.centre.dispose(); this.params.dispose()
  }
}
