import { useEffect, useRef } from "react";
import * as THREE from "three";
import gladiolusImage from "../assets/gladiolus.png";
import { NOISE, SOFT_POINT } from "./noise";
import { createRenderer, prefersReducedMotion } from "./renderer";
import { createDust } from "./dust";

const LOGIN_BACKGROUND = "#090b17";

const HEIGHT = 1000;
const WIDTH = (HEIGHT * 736) / 1288;
const SCALE = 2;
const COVER = 1.2;
const GRAINS_ACROSS = 520;
const GRAIN_SIZE = 1.1;
// Fade-in of the flower once its image is loaded.
const APPEAR_MS = 1200;
const CENTER = 0.3;
const SHIFT = 0.15;

const PETAL = ["#0a1670", "#2f62ff", "#c4e6ff"].map((color) => new THREE.Color(color));
const STEM = ["#061d3d", "#1f5fa8", "#a9d4ff"].map((color) => new THREE.Color(color));

function gradient(target: THREE.Color, stops: THREE.Color[], k: number) {
  return k < 0.55
    ? target.lerpColors(stops[0], stops[1], k / 0.55)
    : target.lerpColors(stops[1], stops[2], (k - 0.55) / 0.45);
}

function contrast(k: number) {
  const t = Math.min(1, Math.max(0, (k - 0.3) / 0.62));
  return t * t * (3 - 2 * t);
}

const VERTEX = `
${NOISE}
uniform float uTime;
uniform float uMotion;
uniform float uSize;
uniform vec3 uPointer;
attribute vec3 aColor;
attribute vec2 aGrain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float tm = uTime * uMotion;
  vec3 p = position;
  float amp = 1.2 + 7.0 * aGrain.x;
  p += vec3(snoise(vec3(p.xy * 0.006, tm * 0.08)),
            snoise(vec3(p.yx * 0.006 + 7.0, tm * 0.08)),
            snoise(vec3(p.xy * 0.006 + 13.0, tm * 0.08))) * amp;
  p.x += snoise(vec3(0.0, p.y * 0.0015, tm * 0.05)) * 16.0 * smoothstep(-500.0, 500.0, p.y);
  vec2 d = p.xy - uPointer.xy;
  float influence = exp(-dot(d, d) / (36.0 * 36.0));
  p.xy += normalize(d + 1e-4) * influence * 12.0 * smoothstep(0.0, 15.5, length(d)) * mix(0.55, 1.0, fract(aGrain.y * 7.31));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float life = 0.75 + 0.25 * sin(uTime * 0.7 + aGrain.y);
  vColor = aColor * life * (1.0 + influence * 0.25);
  vAlpha = 0.7;
  gl_PointSize = uSize / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = `
${SOFT_POINT}
varying vec3 vColor;
varying float vAlpha;
uniform float uAppear;
void main() {
  float a = softPoint() * vAlpha * uAppear;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

function createGrains(image: HTMLImageElement) {
  const width = GRAINS_ACROSS;
  const height = Math.round((width * image.height) / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const positions: number[] = [];
  const colors: number[] = [];
  const grains: number[] = [];
  const petal = new THREE.Color();
  const stem = new THREE.Color();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 110) continue;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const pink = Math.max(0, Math.min(1, (r - g) * 2.2));
      const light = Math.min(1, 0.3 * r + 0.59 * g + 0.11 * b);
      gradient(petal, PETAL, contrast(light));
      gradient(stem, STEM, contrast(light));
      const color = stem.lerp(petal, pink);
      positions.push(
        ((x + Math.random()) / width - 0.5) * WIDTH,
        (0.5 - (y + Math.random()) / height) * HEIGHT,
        (pink - 0.3) * 60 + (Math.random() - 0.5) * 16,
      );
      colors.push(color.r * 0.9, color.g * 0.9, color.b * 0.9);
      grains.push(pink, Math.random() * 100);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aGrain", new THREE.Float32BufferAttribute(grains, 2));
  return geometry;
}

function drift(t: number, a: number, b: number) {
  return Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.3) * 0.4;
}

function Gladiolus() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = createRenderer(canvas, {
      background: LOGIN_BACKGROUND,
      bloom: { strength: 0.85, radius: 0.4, threshold: 0.22 },
    });
    if (!view) return;
    let disposed = false;
    const motion = prefersReducedMotion() ? 0.25 : 1;
    const camera = new THREE.PerspectiveCamera(32, 1, 10, 6000);
    const distanceFor = (visibleHeight: number) =>
      visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(16)));
    camera.position.set(0, 0, distanceFor(HEIGHT / SCALE));

    const flower = new THREE.Group();
    view.scene.add(flower);

    const uniforms = {
      uTime: { value: 0 },
      uMotion: { value: motion },
      uSize: { value: 5 * view.pixelRatio * camera.position.z },
      uPointer: { value: new THREE.Vector3(1e6, 1e6, 0) },
      // 0 → 1 once the image is loaded: the flower fades in instead of popping up.
      uAppear: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    let cloud: THREE.Points | null = null;
    let appearAt: number | null = null;
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      appearAt = performance.now();
      cloud = new THREE.Points(createGrains(image), material);
      cloud.frustumCulled = false;
      flower.add(cloud);
    };
    image.src = gladiolusImage;

    const dust = createDust({
      count: 700,
      extent: { x: 1200, y: 700, z: 400 },
      size: 2.2 * view.pixelRatio,
      motion,
      colors: ["#7CFFB2", "#FF8FB1", "#FFE27A", "#AEB3FF"],
    });
    view.scene.add(dust.object);

    const parent = canvas.parentElement!;
    const observer = new ResizeObserver(() => {
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      view.resize(width, height);
      camera.aspect = width / height;
      const visibleHeight = Math.min(HEIGHT / SCALE, (WIDTH * COVER) / camera.aspect);
      const distance = distanceFor(visibleHeight);
      camera.position.set(0, 0, distance);
      camera.updateProjectionMatrix();
      const gapPx = ((height / visibleHeight) * WIDTH) / GRAINS_ACROSS;
      uniforms.uSize.value = Math.max(2.4, GRAIN_SIZE * gapPx) * view.pixelRatio * distance;
      const shift = camera.aspect > 1 ? SHIFT * visibleHeight * camera.aspect : 0;
      flower.position.set(shift, -(0.5 - CENTER) * HEIGHT, 0);
    });
    observer.observe(parent);

    const pointer = new THREE.Vector2();
    const aim = new THREE.Vector2();
    const rest = new THREE.Vector2();
    let pointerInside = false;
    const handlePointerMove = (event: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      pointerInside = true;
    };
    const handlePointerLeave = () => {
      pointerInside = false;
    };
    window.addEventListener("pointermove", handlePointerMove);
    parent.addEventListener("pointerleave", handlePointerLeave);

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const timer = new THREE.Timer();
    view.renderer.setAnimationLoop((now: number) => {
      timer.update(now);
      if (appearAt !== null) uniforms.uAppear.value = Math.min(1, (now - appearAt) / APPEAR_MS);
      const dt = Math.min(0.1, timer.getDelta());
      const t = timer.getElapsed();
      const tm = t * motion;
      aim.lerp(pointerInside ? pointer : rest, 1 - Math.exp(-dt * 1.5));
      flower.rotation.y = aim.x * 0.22 + drift(tm, 0.11, 0.067) * 0.08;
      flower.rotation.x = -aim.y * 0.08 + drift(tm, 0.083, 0.051) * 0.03;
      flower.rotation.z = drift(tm, 0.07, 0.043) * 0.015;
      flower.updateMatrixWorld();

      if (pointerInside) {
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) uniforms.uPointer.value.copy(flower.worldToLocal(hit));
      } else {
        uniforms.uPointer.value.set(1e6, 1e6, 0);
      }
      uniforms.uTime.value = t;
      dust.uniforms.uTime.value = t;
      view.draw(camera);
    });

    return () => {
      disposed = true;
      image.onload = null;
      view.renderer.setAnimationLoop(null);
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      parent.removeEventListener("pointerleave", handlePointerLeave);
      cloud?.geometry.dispose();
      material.dispose();
      dust.dispose();
      timer.dispose();
      view.dispose();
    };
  }, []);

  return <canvas className="login-background" ref={canvasRef} aria-hidden />;
}

export default Gladiolus;
