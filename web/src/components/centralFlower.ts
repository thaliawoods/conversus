import * as THREE from "three";
import { SOFT_POINT } from "../login-flower/noise";

const PETALS = 6;
const RADIUS = 58;
const PETAL = { width: 19, round: 0.6, vary: 0.12, wobble: 0.08 };
const SHADOW = 0.6;
const GRAIN_COUNT = 6000;
const GRAIN_SIZE = 1.25;
const CORE = { spread: 1.1, strength: 1, crisp: 1 };
const HALO = { spread: 6, strength: 0.06, crisp: 0 };
const MAP_SIZE = 432;
const WORLD = 72;
const NIGHT = [[0x0a, 0x16, 0x70], [0x1a, 0x2a, 0x9e]];
const BLUE = [[0x2a, 0x4d, 0xe0], [0x2f, 0x62, 0xff], [0x4a, 0x6c, 0xff]];
const LIGHT = [[0x8f, 0xa8, 0xff], [0xc4, 0xe6, 0xff]];

function random(seed: number) {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function mix(from: number[], to: number[], t: number) {
  return from.map((value, i) => value + (to[i] - value) * t);
}

function smooth(from: number, to: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function petalPath(index: number) {
  const left: number[][] = [];
  const right: number[][] = [];
  const seed = index * 7.3 + 24;
  const length = RADIUS * (1 + (random(seed) - 0.5) * PETAL.vary);
  const width = PETAL.width * (1 + (random(seed + 1) - 0.5) * PETAL.vary * 1.4);
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const y = -length * (0.06 + 0.94 * t);
    const half = width * Math.pow(Math.sin(Math.PI * t), PETAL.round);
    const wl = 1 + PETAL.wobble * (Math.sin(t * 9 + seed) * 0.6 + Math.sin(t * 17 + seed * 2) * 0.4);
    const wr = 1 + PETAL.wobble * (Math.sin(t * 11 + seed * 3) * 0.6 + Math.sin(t * 19 + seed) * 0.4);
    left.push([-half * wl, y]);
    right.push([half * 0.85 * wr, y]);
  }
  const path = new Path2D();
  left.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  right.reverse().forEach(([x, y]) => path.lineTo(x, y));
  path.closePath();
  return path;
}

function createMaps() {
  const petals = Array.from({ length: PETALS }, (_, i) => petalPath(i));
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = MAP_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.translate(MAP_SIZE / 2, MAP_SIZE / 2);
    context.scale(MAP_SIZE / (2 * WORLD), MAP_SIZE / (2 * WORLD));
    return context;
  };
  const turn = (context: CanvasRenderingContext2D, i: number) =>
    context.rotate((i * 2 * Math.PI) / PETALS + (random(i * 5.1 + 9) - 0.5) * PETAL.vary * 0.6);
  const inside = make();
  const gap = make();
  const rim = make();
  const count = make();
  gap.lineWidth = 2;
  rim.lineWidth = 7;
  count.globalCompositeOperation = "lighter";
  count.fillStyle = "rgb(60,0,0)";
  for (let i = 0; i < PETALS; i++) {
    for (const context of [inside, count]) {
      context.save();
      turn(context, i);
      context.fill(petals[i]);
      context.restore();
    }
    for (const context of [gap, rim]) {
      context.save();
      turn(context, i);
      context.globalCompositeOperation = "destination-out";
      context.fill(petals[i]);
      context.globalCompositeOperation = "source-over";
      context.stroke(petals[i]);
      context.restore();
    }
  }
  const read = (context: CanvasRenderingContext2D) => context.getImageData(0, 0, MAP_SIZE, MAP_SIZE).data;
  return { inside: read(inside), gap: read(gap), rim: read(rim), count: read(count) };
}

function grainColor(k: number, edge: number, overlap: boolean) {
  const tip = smooth(0.6, 0.95, k) * (overlap ? 0.2 : 1);
  if (Math.random() < 0.03 + 0.75 * tip) {
    return mix(LIGHT[0], LIGHT[1], Math.random() * (0.3 + 0.7 * tip));
  }
  const side = edge * 0.8 * (1 - smooth(0.7, 0.95, k));
  const dark = Math.min(1, 1 - smooth(0.15, 0.75, k) + side + (overlap ? 0.6 : 0)) * SHADOW;
  const night = mix(NIGHT[0], NIGHT[1], Math.random());
  const blue = BLUE[Math.floor(Math.random() * BLUE.length)];
  return mix(blue, night, Math.min(1, dark * (0.75 + 0.25 * Math.random())));
}

function createGeometry() {
  const { inside, gap, rim, count } = createMaps();
  const positions: number[] = [];
  const looks: number[] = [];
  const colors: number[] = [];
  const toMap = MAP_SIZE / (2 * WORLD);
  for (let tries = 0; positions.length / 3 < GRAIN_COUNT && tries < GRAIN_COUNT * 30; tries++) {
    const x = (Math.random() * 2 - 1) * WORLD;
    const y = (Math.random() * 2 - 1) * WORLD;
    const p = (Math.floor(y * toMap + MAP_SIZE / 2) * MAP_SIZE + Math.floor(x * toMap + MAP_SIZE / 2)) * 4;
    if (inside[p + 3] < 128 || (gap[p + 3] > 90 && Math.random() < 0.95)) continue;
    const edge = rim[p + 3] / 255;
    if (!edge && Math.random() < 0.3) continue;
    const k = Math.min(1, Math.hypot(x, y) / RADIUS + edge * 0.3);
    const color = grainColor(k, edge, count[p] > 90);
    positions.push(x, -y, Math.random() * 100);
    looks.push(GRAIN_SIZE * (0.7 + Math.random() * 0.6), 0.6 + 0.35 * Math.random());
    colors.push(...color.map((value) => value / 255));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aLook", new THREE.Float32BufferAttribute(looks, 2));
  geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

const VERTEX = `
uniform float uTime;
uniform float uZoom;
uniform float uPixelRatio;
uniform float uSpread;
uniform float uStrength;
attribute vec2 aLook;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float phase = position.z;
  float angle = atan(position.y, position.x);
  float radius = ${RADIUS.toFixed(1)};
  vec2 p = position.xy * (1.0 + 0.07 * sin(uTime * 1.2 + angle * 2.5));
  p += vec2(sin(uTime * 1.1 + phase), cos(uTime * 0.9 + phase * 1.3)) * radius * 0.03;
  vColor = aColor;
  vAlpha = aLook.y * (0.8 + 0.2 * sin(uTime * 2.0 + phase)) * uStrength;
  gl_PointSize = max(1.0, aLook.x * uSpread * uZoom * uPixelRatio);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

const FRAGMENT = `
${SOFT_POINT}
uniform float uCrisp;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float disc = 1.0 - smoothstep(0.35, 0.5, length(gl_PointCoord - 0.5));
  float a = mix(softPoint(), disc, uCrisp) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

type Shared = { time: { value: number }; zoom: { value: number }; pixelRatio: number };

export function createCentralFlower({ time, zoom, pixelRatio }: Shared) {
  const geometry = createGeometry();
  const layers = [
    { ...CORE, blending: THREE.NormalBlending },
    { ...HALO, blending: THREE.AdditiveBlending },
  ].map(({ spread, strength, crisp, blending }, order) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: time,
        uZoom: zoom,
        uPixelRatio: { value: pixelRatio },
        uSpread: { value: spread },
        uStrength: { value: strength },
        uCrisp: { value: crisp },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = order + 1;
    return points;
  });

  return {
    layers,
    dispose() {
      geometry.dispose();
      layers.forEach((layer) => layer.material.dispose());
    },
  };
}
