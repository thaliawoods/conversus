import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type Renderer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  resize: (width: number, height: number) => void;
  draw: (camera: THREE.Camera) => void;
  dispose: () => void;
  pixelRatio: number;
};

export function prefersReducedMotion() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  options: { background: string; bloom: { strength: number; radius: number; threshold: number } },
): Renderer | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pixelRatio);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background);
  const placeholderCamera = new THREE.Camera();
  const scenePass = new RenderPass(scene, placeholderCamera);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(256, 256),
    options.bloom.strength,
    options.bloom.radius,
    options.bloom.threshold,
  );
  const composer = new EffectComposer(renderer);
  composer.addPass(scenePass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    renderer,
    scene,
    pixelRatio,
    resize(width, height) {
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
    draw(camera) {
      scenePass.camera = camera;
      composer.render();
    },
    dispose() {
      composer.dispose();
      bloom.dispose();
      renderer.dispose();
    },
  };
}
