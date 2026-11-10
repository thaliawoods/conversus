// Un glaïeul en grains de lumière sur la nuit, dans son propre canvas (grainsFleur.ts).
//   cadrage « page »   : derrière la connexion, la fleur très agrandie remplit l'écran (décalée à droite sur écran large).
//   cadrage « entier » : la fleur entière, centrée, dans un petit cadre (le panneau d'un canal).
// À la connexion (`explose`), la fleur éclate.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { creerRendu, mouvementReduit } from './rendu'
import { creerPoussiere } from './poussiere'
import { creerGlaieul } from './grainsFleur'

export const FOND_LOGIN = '#090b17'

// Dans la scène, la fleur mesure 1000 de haut.
const H = 1000
// « page » : on cadre assez serré pour que les pétales couvrent l'écran en hauteur (ECHELLE)
// comme en largeur (COUVRE : la part de la largeur de la fleur visible d'un bord à l'autre de l'écran).
const ECHELLE = 2
const COUVRE = 1.2
// Le point de la fleur (en fraction de sa hauteur, depuis le haut) placé au milieu de l'écran, en cadrage « page ».
const CENTRE_PAGE = .3
// Le décalage de la fleur vers la droite, en part de la largeur de l'écran (0 = centrée). Seulement sur écran large.
const DECALAGE = .15
// La taille d'un grain par rapport à l'écart entre deux grains.
const GROSSEUR = 1.1
const DUREE_ECLAT = 2     // secondes

// Deux sinus aux fréquences sans rapport entre elles : un balancement qui ne se répète jamais vraiment.
const derive = (t: number, a: number, b: number) => Math.sin(t * a) * .6 + Math.sin(t * b + 1.3) * .4

type Props = { explose?: boolean; cadrage?: 'page' | 'entier'; className?: string }

export default function Glaieul({ explose = false, cadrage = 'page', className = 'login-fond' }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const eclate = useRef(explose)
  useEffect(() => { eclate.current = explose }, [explose])

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const page = cadrage === 'page'
    const rendu = creerRendu(cv, { fond: FOND_LOGIN, bloom: { force: .85, rayon: .4, seuil: .22 } })
    if (!rendu) return
    const mouvement = mouvementReduit() ? .25 : 1
    const camera = new THREE.PerspectiveCamera(32, 1, 10, 6000)
    // La distance de la caméra pour voir une hauteur donnée de la scène (recalculée à chaque redimensionnement).
    const distance = (hautVisible: number) => hautVisible / (2 * Math.tan(THREE.MathUtils.degToRad(16)))

    const g = creerGlaieul({ hauteur: H, grainsLargeur: page ? 520 : 200, mouvement, centre: page ? CENTRE_PAGE : .5 })
    const fleur = g.groupe
    rendu.scene.add(fleur)

    // La poussière d'étoiles qui flotte dans le fond.
    const poussiere = creerPoussiere({
      nombre: page ? 700 : 260, etendue: page ? { x: 1200, y: 700, z: 400 } : { x: 700, y: 700, z: 300 },
      taille: 2.2 * rendu.ratio, mouvement,
      couleurs: ['#7CFFB2', '#FF8FB1', '#FFE27A', '#AEB3FF'],
    })
    rendu.scene.add(poussiere.objet)

    // « page » : sur un écran large, c'est la largeur qui décide du cadrage, sur un téléphone la hauteur.
    // « entier » : toute la fleur tient dans le cadre.
    const parent = cv.parentElement!
    const obs = new ResizeObserver(() => {
      const large = Math.max(1, parent.clientWidth), haut = Math.max(1, parent.clientHeight)
      rendu.dimensionner(large, haut)
      camera.aspect = large / haut
      const hautVisible = page
        ? Math.min(H / ECHELLE, g.largeur * COUVRE / camera.aspect)
        : Math.max(H * 1.06, g.largeur * 1.25 / camera.aspect)
      const D = distance(hautVisible)
      camera.position.set(0, 0, D)
      camera.updateProjectionMatrix()
      // Les grains suivent le zoom : assez gros pour que la fleur reste pleine, sans se chevaucher.
      const ecartPx = haut / hautVisible * g.ecart
      g.uniforms.uTaille.value = Math.max(page ? 2.4 : 1.6, GROSSEUR * ecartPx) * rendu.ratio * D
      fleur.position.x = page && camera.aspect > 1 ? DECALAGE * hautVisible * camera.aspect : 0
    })
    obs.observe(parent)

    // Le pointeur : la fleur se tourne à peine vers lui, et les grains s'allument sur son passage.
    const ndc = new THREE.Vector2(), visee = new THREE.Vector2(), repos = new THREE.Vector2()
    const etat = { dedans: false }
    const bouge = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect()
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      etat.dedans = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1
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
      fleur.rotation.y = visee.x * .06 + derive(tm, .11, .067) * .08
      fleur.rotation.x = -visee.y * .03 + derive(tm, .083, .051) * .03
      fleur.rotation.z = derive(tm, .07, .043) * .015
      // L'éclatement avance ; la fleur s'approche un peu de nous en même temps, et la poussière s'éteint.
      if (eclate.current) g.uniforms.uExplose.value = Math.min(1.2, g.uniforms.uExplose.value + dt / DUREE_ECLAT)
      const ex = Math.min(1, g.uniforms.uExplose.value)
      fleur.scale.setScalar(1 + .18 * (1 - (1 - ex) ** 3))
      poussiere.objet.visible = ex < .95
      poussiere.objet.scale.setScalar(1 + ex * 1.5)
      fleur.updateMatrixWorld()

      if (etat.dedans) {
        rayon.setFromCamera(ndc, camera)
        g.pointeur(rayon.ray.intersectPlane(plan, touche))
      } else g.pointeur(null)
      g.uniforms.uTemps.value = t
      poussiere.uniforms.uTemps.value = t
      rendu.dessiner(camera)
    })

    return () => {
      rendu.renderer.setAnimationLoop(null)
      obs.disconnect()
      removeEventListener('pointermove', bouge)
      parent.removeEventListener('pointerleave', sort)
      g.liberer()
      poussiere.liberer()
      horloge.dispose()
      rendu.liberer()
    }
  }, [cadrage])

  return <canvas className={className} ref={canvas} aria-hidden />
}
