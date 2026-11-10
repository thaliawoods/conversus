// Le rendu WebGL commun : un canvas, une scène, et le bloom qui fait briller les filaments.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

export type Rendu = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  nette: THREE.Scene         // ce qui est dessiné après le bloom : net, sans lueur autour
  dimensionner: (largeur: number, hauteur: number) => void
  dessiner: (camera: THREE.Camera) => void
  liberer: () => void
  ratio: number
}

export const mouvementReduit = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Renvoie null si le navigateur ne sait pas faire de WebGL : la page garde alors son fond CSS.
export function creerRendu(canvas: HTMLCanvasElement, o: { fond: string; bloom: { force: number; rayon: number; seuil: number } }): Rendu | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  renderer.setPixelRatio(ratio)
  // Le fond passe par scene.background et non par setClearColor : setClearColor convertit la couleur
  // pour l'écran au moment de l'appel, puis la RenderPass s'en sert pour vider sa texture (linéaire),
  // et l'OutputPass la convertit une seconde fois : le fond sortait gris-bleu au lieu de nuit.
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(o.fond)
  const camFactice = new THREE.Camera()
  const passeScene = new RenderPass(scene, camFactice)
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), o.bloom.force, o.bloom.rayon, o.bloom.seuil)
  // La scène « nette » se dessine par-dessus, une fois le bloom passé : elle ne reçoit aucune lueur.
  const nette = new THREE.Scene()
  const passeNette = new RenderPass(nette, camFactice)
  passeNette.clear = false
  const composer = new EffectComposer(renderer)
  composer.addPass(passeScene)
  composer.addPass(bloom)
  composer.addPass(passeNette)
  composer.addPass(new OutputPass())

  return {
    renderer, scene, nette, ratio,
    dimensionner(l, h) {
      renderer.setSize(l, h, false)
      composer.setPixelRatio(ratio)
      composer.setSize(l, h)
    },
    dessiner(camera) {
      passeScene.camera = camera
      passeNette.camera = camera
      composer.render()
    },
    liberer() {
      composer.dispose()
      bloom.dispose()
      renderer.dispose()
    },
  }
}
