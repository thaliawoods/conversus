import * as THREE from "three";
import { NOISE, SOFT_POINT } from "./noise";

const VERTEX = `
${NOISE}
uniform float uTime;
uniform float uMotion;
uniform float uSize;
uniform vec2 uOffset;
attribute vec3 aColor;
attribute vec2 aGrain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float tm = uTime * uMotion;
  vec3 p = position;
  p.x += snoise(vec3(p.xy * 0.002, tm * 0.03 + aGrain.y)) * 40.0;
  p.y += snoise(vec3(p.yx * 0.002, tm * 0.03 + aGrain.y + 9.0)) * 40.0;
  p.xy += uOffset * (1.0 - aGrain.x);
  float twinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.6 + aGrain.y * 0.02) + aGrain.y));
  vColor = aColor * twinkle;
  vAlpha = 0.35 + 0.65 * aGrain.x;
  gl_PointSize = uSize * (0.5 + aGrain.x);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = `
${SOFT_POINT}
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = softPoint() * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export function createDust(options: {
  count: number;
  extent: { x: number; y: number; z?: number };
  colors: string[];
  size: number;
  motion: number;
}) {
  const count = options.count;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const grains = new Float32Array(count * 2);
  const palette = options.colors.map((color) => new THREE.Color(color));
  for (let i = 0; i < count; i++) {
    positions.set(
      [
        (Math.random() * 2 - 1) * options.extent.x,
        (Math.random() * 2 - 1) * options.extent.y,
        (Math.random() * 2 - 1) * (options.extent.z ?? 0),
      ],
      i * 3,
    );
    const color = palette[i % palette.length].clone().multiplyScalar(0.35 + 0.65 * Math.random());
    colors.set([color.r, color.g, color.b], i * 3);
    grains.set([Math.random() ** 2, Math.random() * 100], i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aGrain", new THREE.BufferAttribute(grains, 2));
  const uniforms = {
    uTime: { value: 0 },
    uMotion: { value: options.motion },
    uSize: { value: options.size },
    uOffset: { value: new THREE.Vector2() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  return {
    object,
    uniforms,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
