import { useEffect, useRef } from "react";
import * as THREE from "three";
import { pointOnStem, type Placement } from "../layout";
import { createCentralFlower } from "./centralFlower";
import type { Sprout } from "../hooks/useSprouts";

const TRUNK_WIDTH = { base: 3, tip: 0.6 };
const TWIG_WIDTH = { base: 1.4, tip: 0.3 };
const FORK_WIDTH = { base: 0.8, tip: 0.2 };
const CREASE_WIDTH = { base: 0.6, tip: 0.2 };
const MEANDER = 0.06;
const WIGGLE = 1.2;
const WIGGLE_LENGTH = 9;
const GLOW_RADIUS = 3;
const GLOW = 0.3;
const SWAY = 1.5;
// M1: slow breath away from the flower, in px at the tips.
const BREATH = 3;
// F1: pale band of light crossing the screen diagonally (0 = off).
const SWEEP = 0.6;
const POINT_GAP = 1.5;
export const LEAF = { length: 16, width: 8, turn: 0.35, petiole: 14 };
const PETIOLE_WIDTH = { base: 1.2, tip: 0.8 };
const VEIN_WIDTH = { base: 0.6, tip: 0.2 };
const THORN = { length: 10, spacing: 7, turn: 1.4 };
const THORN_WIDTH = { base: 6, tip: 0.05 };
const MARK_ROOM = 18;
const SPIKE = 2;
const BLADE = 3;
const UNDER_TEXT = 0.2;
const TEXT_MARGIN = 4;
const MAX_BOXES = 128;
// Épine animation: the stem turns ember red and shakes, its newest thorns grow.
const ANGER = { duration: 2, fadeIn: 0.3, fadeOut: 0.8 };
// Tint of the stem aimed at: ember red for Épine, raspberry pink for Feuille.
const TINT = { thorn: [1.0, 0.353, 0.212], leaf: [0.878, 0.31, 0.604] } as const;
// Growth (from Kilian): a branch grows once from the flower. Share of the time for each part,
// a twig, leaf or thorn starts when the trunk reaches it.
const GROW_SECONDS = 2.4;
const TRUNK_SHARE = 0.7;
const TWIG_SHARE = 0.22;
const FORK_SHARE = 0.12;
const CREASE_SHARE = 0.08;
const LEAF_SHARE = 0.28;
const THORN_SHARE = 0.14;
// Hovered thread (from Kilian): fade speed (s), light left to the other branches, share of cyan.
const FOCUS_FADE = 0.12;
const DIMMED = 0.6;
const THREAD_MIX = 0.85;
// Seconds until the trunk reaches its message (same easing as sprouted() in the shader).
export const ARRIVE_SECONDS = GROW_SECONDS * (1 - Math.sqrt(1 - TRUNK_SHARE / 1.05));

export type Mark = "leaf" | "thorn";
export type Stem = { from: Placement | null; to: Placement; sag: number; id: number; marks: Mark[] };
export type Arrival = { key: number; target: number };
type Camera = { x: number; y: number; zoom: number };
type Point = { x: number; y: number; angle: number };
type Width = { base: number; tip: number };

export function noise(id: number, seed: number) {
  const value = Math.sin(id * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function withAngles(points: { x: number; y: number }[]): Point[] {
  const last = points.length - 1;
  return points.map((point, k) => {
    const next = points[Math.min(last, k + 1)];
    const before = points[Math.max(0, k - 1)];
    return { ...point, angle: (Math.atan2(next.y - before.y, next.x - before.x) * 180) / Math.PI };
  });
}

function organic(points: { x: number; y: number }[], length: number, seed: number): Point[] {
  const last = points.length - 1;
  const phases = [1, 2, 3, 4].map((k) => noise(seed, k) * 6.28);
  const shifted = points.map((point, k) => {
    const t = k / last;
    const next = points[Math.min(last, k + 1)];
    const before = points[Math.max(0, k - 1)];
    const angle = Math.atan2(next.y - before.y, next.x - before.x) + Math.PI / 2;
    const pin = Math.sin(Math.PI * t);
    const meander = (0.6 * Math.sin(t * 4.1 + phases[0]) + 0.4 * Math.sin(t * 11.7 + phases[1])) * length * MEANDER;
    const wiggle = Math.sin((t * length) / WIGGLE_LENGTH + phases[2]) * WIGGLE * (0.5 + 0.5 * Math.sin(t * 5 + phases[3]));
    const offset = (meander + wiggle) * pin;
    return { x: point.x + Math.cos(angle) * offset, y: point.y + Math.sin(angle) * offset };
  });
  return withAngles(shifted);
}

function sprout(start: Point, angle: number, reach: number, side: number, seed: number) {
  const samples = Math.max(10, Math.round(reach / POINT_GAP));
  const points = Array.from({ length: samples + 1 }, (_, k) => {
    const s = k / samples;
    const bend = angle + side * 0.6 * s + Math.PI / 2;
    return {
      x: start.x + Math.cos(angle) * reach * s + Math.cos(bend) * reach * 0.15 * s * s,
      y: start.y + Math.sin(angle) * reach * s + Math.sin(bend) * reach * 0.15 * s * s,
    };
  });
  return organic(points, reach, seed);
}

function covers(box: Placement | null, point: { x: number; y: number }) {
  if (!box) return false;
  return (
    Math.abs(point.x - box.x) < box.width / 2 + TEXT_MARGIN &&
    Math.abs(point.y - box.y) < box.height / 2 + TEXT_MARGIN
  );
}

function visibleRange(axis: Point[], from: Placement | null, to: Placement) {
  const last = axis.length - 1;
  let first = 0;
  while (first < last && covers(from, axis[first])) first++;
  let end = last;
  while (end > first && covers(to, axis[end])) end--;
  return { start: first / last, end: end / last };
}

function buildGeometry(stems: Stem[], births: Map<number, number>) {
  const positions: number[] = [];
  const grows: number[] = [];
  const nodeGrows: number[] = [];
  // When the part being built appears: start and length (share of the growth), and birth of its branch (s).
  let growth = { start: 0, span: 1, birth: 0 };
  const normals: number[] = [];
  const sides: number[] = [];
  const along: number[] = [];
  const widths: number[] = [];
  const indices: number[] = [];
  const nodes: number[] = [];
  const nodeSizes: number[] = [];
  const stemIds: number[] = [];
  const freshOrders: number[] = [];
  const nodeStems: number[] = [];
  // Stem being built, and the order (1 to 4) of a newest thorn, 0 for the rest.
  let stemId = 0;
  let freshOrder = 0;

  function addLine(points: Point[], width: Width, seed: number, shape = 0) {
    const first = positions.length / 3;
    const last = points.length - 1;
    points.forEach((point, k) => {
      const normal = (point.angle * Math.PI) / 180 + Math.PI / 2;
      for (const side of [-1, 1]) {
        positions.push(point.x, -point.y, 0);
        normals.push(Math.cos(normal), -Math.sin(normal));
        sides.push(side);
        along.push(k / last);
        widths.push(width.base, width.tip, shape || noise(seed, 5));
        stemIds.push(stemId);
        freshOrders.push(freshOrder);
        grows.push(growth.start + growth.span * (k / last), growth.birth);
      }
      if (k < last) {
        const a = first + k * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }

  function addNode(point: Point, size: number, seed: number) {
    nodes.push(point.x, -point.y, 0);
    nodeSizes.push(size, noise(seed, 6) * 6.28);
    nodeStems.push(stemId);
    nodeGrows.push(growth.start, growth.birth);
  }

  function curve(origin: { x: number; y: number }, start: number, turn: number, length: number, wobble = 0, seed = 0) {
    const points = [{ x: origin.x, y: origin.y }];
    for (let k = 1; k <= 12; k++) {
      const angle = start - turn * (k / 12) + wobble * Math.sin(k * 1.3 + noise(seed, 8) * 6.28);
      const last = points[k - 1];
      points.push({ x: last.x + (Math.cos(angle) * length) / 12, y: last.y + (Math.sin(angle) * length) / 12 });
    }
    return withAngles(points);
  }

  function addLeaflet(origin: { x: number; y: number }, angle: number, side: number, scale: number, seed: number) {
    const length = LEAF.length * scale * (0.7 + noise(seed, 1) * 0.6);
    const width = LEAF.width * scale * (0.7 + noise(seed, 9) * 0.5);
    const turn = side * LEAF.turn * (0.5 + noise(seed, 10) * 2.5);
    const blade = curve(origin, angle + (noise(seed, 11) - 0.5) * 0.6, turn, length, 0.12, seed);
    const hook = noise(seed, 12) > 0.4 ? side * (0.6 + noise(seed, 13) * 0.8) : 0;
    for (let k = 9; k <= 12; k++) {
      const bend = hook * ((k - 8) / 4) ** 2;
      const pivot = blade[8];
      const dx = blade[k].x - pivot.x;
      const dy = blade[k].y - pivot.y;
      blade[k] = { ...blade[k], x: pivot.x + dx * Math.cos(bend) - dy * Math.sin(bend), y: pivot.y + dx * Math.sin(bend) + dy * Math.cos(bend) };
    }
    const hooked = withAngles(blade);
    blade.splice(0, blade.length, ...hooked);
    const lopsided = noise(seed, 7) * 0.35;
    const asym = lopsided - 0.175;
    addLine(blade, { base: width, tip: 0.05 }, seed, BLADE + 0.05 + lopsided);
    const profile = (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8);
    [0.22, 0.38, 0.54, 0.7].forEach((spot, v) => {
      for (const edge of [-1, 1]) {
        if (noise(seed, 30 + v * 2 + edge) < 0.2) continue;
        const at = Math.min(0.8, spot + (noise(seed, 40 + v * 2 + edge) - 0.5) * 0.08);
        const slant = 0.1 + noise(seed, 50 + v * 2 + edge) * 0.08;
        const from = blade[Math.round(at * 12)];
        const to = blade[Math.min(12, Math.round((at + slant) * 12))];
        const normal = (to.angle * Math.PI) / 180 + Math.PI / 2;
        const sideWidth = (width / 2) * (1 + edge * asym * 2);
        const reach = sideWidth * profile(at + slant) * (0.6 + noise(seed, 60 + v * 2 + edge) * 0.3) * edge;
        const end = { x: to.x + Math.cos(normal) * reach, y: to.y + Math.sin(normal) * reach };
        addLine(withAngles([from, { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 }, end]), VEIN_WIDTH, seed + 20);
      }
    });
  }

  function addLeaf(base: Point, side: number, seed: number) {
    const pick = noise(seed, 3);
    const count = pick < 0.4 ? 1 : pick < 0.85 ? 3 : 5;
    const angle = (base.angle * Math.PI) / 180 + side * (0.9 + noise(seed, 2) * 0.3);
    if (count === 1) {
      addLeaflet(base, angle, side, 1, seed);
      return;
    }
    const petiole = curve(base, angle, side * 0.2, LEAF.petiole);
    addLine(petiole, PETIOLE_WIDTH, seed + 1);
    const tip = petiole[petiole.length - 1];
    addLeaflet(tip, (tip.angle * Math.PI) / 180, side, 1, seed + 2);
    const pairs = count === 5 ? [0.65, 0.3] : [0.55];
    pairs.forEach((at, p) => {
      const node = petiole[Math.round(at * (petiole.length - 1))];
      const forward = (node.angle * Math.PI) / 180;
      for (const edge of [-1, 1]) addLeaflet(node, forward + edge * 1.1, edge, 0.75 - p * 0.15, seed + 3 + p * 3 + edge);
    });
  }

  function addThorn(trunk: Point[], center: number, side: number, seed: number, fresh: boolean) {
    const count = 3 + Math.floor(noise(seed, 1) * 2);
    const gap = Math.round(THORN.spacing / POINT_GAP);
    for (let i = 0; i < count; i++) {
      const index = Math.min(trunk.length - 3, Math.max(2, center + Math.round((i - (count - 1) / 2) * gap)));
      const base = trunk[index];
      const towards = i % 2 === 0 ? side : -side;
      const length = THORN.length * (0.75 + noise(seed, 5 + i) * 0.4);
      const start = (base.angle * Math.PI) / 180 + towards * (1.4 + noise(seed, 2 + i) * 0.2);
      const points = [{ x: base.x, y: base.y }];
      for (let k = 1; k <= 8; k++) {
        const angle = start - towards * THORN.turn * (k / 8);
        const last = points[k - 1];
        points.push({ x: last.x + (Math.cos(angle) * length) / 8, y: last.y + (Math.sin(angle) * length) / 8 });
      }
      freshOrder = fresh ? i + 1 : 0;
      addLine(withAngles(points), THORN_WIDTH, seed + i, SPIKE);
      freshOrder = 0;
    }
  }

  for (const stem of stems) {
    stemId = stem.id;
    const start = pointOnStem(stem.from, stem.to, 0, stem.sag);
    const end = pointOnStem(stem.from, stem.to, 1, stem.sag);
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const samples = Math.max(24, Math.round(length / POINT_GAP));
    const axis = Array.from({ length: samples + 1 }, (_, k) => pointOnStem(stem.from, stem.to, k / samples, stem.sag));
    const trunk = organic(axis, length, stem.id);
    const birth = births.get(stem.id) ?? -1e6;
    const trunkAt = (index: number) => TRUNK_SHARE * (index / samples);
    growth = { start: 0, span: TRUNK_SHARE, birth };
    addLine(trunk, TRUNK_WIDTH, stem.id);

    const range = visibleRange(axis, stem.from, stem.to);
    const visible = length * (range.end - range.start);
    const indexAt = (u: number) => Math.round((range.start + (range.end - range.start) * u) * samples);

    const markPlaces = stem.marks.map((_, k) => (k + 1) / (stem.marks.length + 1));
    const room = MARK_ROOM / Math.max(visible, 1);
    const free = (t: number, before: boolean) => {
      const place = markPlaces.find((other) => Math.abs(other - t) < room);
      if (place === undefined) return t;
      const moved = before ? place - room * 1.1 : place + room * 1.1;
      return Math.min(0.92, Math.max(0.08, moved));
    };

    const twigCount = 2 + Math.floor(noise(stem.id, 3) * 3);
    for (let j = 0; j < twigCount; j++) {
      const at = free(0.3 + ((j + noise(stem.id, 10 + j)) / twigCount) * 0.5, j % 2 === 0);
      const baseIndex = indexAt(at);
      const base = trunk[baseIndex];
      growth = { start: trunkAt(baseIndex), span: TWIG_SHARE, birth };
      const side = (j + Math.floor(noise(stem.id, 4) * 2)) % 2 ? 1 : -1;
      const angle = (base.angle * Math.PI) / 180 + side * (0.45 + noise(stem.id, 20 + j) * 0.4);
      const reach = visible * (0.15 + noise(stem.id, 30 + j) * 0.15);
      const twig = sprout(base, angle, reach, side, stem.id * 10 + j);
      addLine(twig, TWIG_WIDTH, stem.id * 10 + j);
      addNode(base, 2 + noise(stem.id, 35 + j), stem.id * 10 + j);

      if (noise(stem.id, 40 + j) > 0.35) {
        const forkIndex = Math.min(twig.length - 1, Math.round(twig.length * 0.55));
        const fork = twig[forkIndex];
        growth = { start: trunkAt(baseIndex) + TWIG_SHARE * (forkIndex / (twig.length - 1)), span: FORK_SHARE, birth };
        const forkAngle = (fork.angle * Math.PI) / 180 - side * (0.5 + noise(stem.id, 45 + j) * 0.3);
        addLine(sprout(fork, forkAngle, reach * 0.5, -side, stem.id * 10 + j + 5), FORK_WIDTH, stem.id * 10 + j + 5);
        addNode(fork, 2, stem.id * 10 + j + 5);
      }
    }

    const creases = 3 + Math.floor(noise(stem.id, 50) * 3);
    for (let c = 0; c < creases; c++) {
      const at = free(0.15 + noise(stem.id, 51 + c) * 0.75, c % 2 === 0);
      const baseIndex = indexAt(at);
      const base = trunk[baseIndex];
      growth = { start: trunkAt(baseIndex), span: CREASE_SHARE, birth };
      const side = noise(stem.id, 60 + c) > 0.5 ? 1 : -1;
      const angle = (base.angle * Math.PI) / 180 + side * (0.25 + noise(stem.id, 70 + c) * 0.35);
      const reach = 4 + noise(stem.id, 80 + c) * 6;
      addLine(sprout(base, angle, reach, side, stem.id * 100 + c), CREASE_WIDTH, stem.id * 100 + c);
    }

    const beads = Math.round(visible / 40);
    for (let b = 0; b < beads; b++) {
      const index = indexAt(0.1 + noise(stem.id, 90 + b) * 0.85);
      growth = { start: trunkAt(index), span: 0, birth };
      addNode(trunk[index], 2 + noise(stem.id, 95 + b) * 1.5, stem.id * 7 + b);
    }

    // The newest thorn reaction is the last one: those are the thorns that grow.
    const newestThorn = stem.marks.lastIndexOf("thorn");
    stem.marks.forEach((mark, k) => {
      const index = indexAt(markPlaces[k]);
      const side = k % 2 === 0 ? 1 : -1;
      growth = { start: trunkAt(index), span: mark === "leaf" ? LEAF_SHARE : THORN_SHARE, birth };
      if (mark === "leaf") addLeaf(trunk[index], side, stem.id * 1000 + k);
      else addThorn(trunk, index, side, stem.id * 1000 + k, k === newestThorn);
    });
  }

  const lines = new THREE.BufferGeometry();
  lines.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  lines.setAttribute("aNormal", new THREE.Float32BufferAttribute(normals, 2));
  lines.setAttribute("aSide", new THREE.Float32BufferAttribute(sides, 1));
  lines.setAttribute("aT", new THREE.Float32BufferAttribute(along, 1));
  lines.setAttribute("aWidth", new THREE.Float32BufferAttribute(widths, 3));
  lines.setAttribute("aStem", new THREE.Float32BufferAttribute(stemIds, 1));
  lines.setAttribute("aFresh", new THREE.Float32BufferAttribute(freshOrders, 1));
  lines.setAttribute("aGrow", new THREE.Float32BufferAttribute(grows, 2));
  // aLit = 1 on the hovered thread, filled by applyLit.
  lines.setAttribute("aLit", new THREE.Float32BufferAttribute(new Float32Array(stemIds.length), 1));
  lines.setIndex(indices);

  const points = new THREE.BufferGeometry();
  points.setAttribute("position", new THREE.Float32BufferAttribute(nodes, 3));
  points.setAttribute("aNode", new THREE.Float32BufferAttribute(nodeSizes, 2));
  points.setAttribute("aStem", new THREE.Float32BufferAttribute(nodeStems, 1));
  points.setAttribute("aGrow", new THREE.Float32BufferAttribute(nodeGrows, 2));
  points.setAttribute("aLit", new THREE.Float32BufferAttribute(new Float32Array(nodeStems.length), 1));
  return { lines, points, stemIds, nodeStems };
}

const SWAY_GLSL = `
uniform float uTime;
uniform float uSway;
uniform float uBreath;
uniform float uSweep;
vec2 sway(vec2 p) {
  vec2 wave = vec2(sin(p.y * 0.02 + uTime * 0.5), cos(p.x * 0.02 + uTime * 0.4)) * uSway;
  float r = length(p);
  vec2 outward = r > 0.001 ? p / r : vec2(0.0);
  float breath = (0.5 + 0.5 * sin(uTime * 0.6 - r * 0.012)) * smoothstep(40.0, 260.0, r) * uBreath;
  return wave + outward * breath;
}
// clip = gl_Position. Band crosses the screen in 4 s, then rests 5 s.
float sweep(vec4 clip) {
  float diagonal = (clip.x + clip.y) * 0.5;
  float head = mix(-1.4, 1.4, clamp(mod(uTime, 9.0) / 4.0, 0.0, 1.0));
  return exp(-pow((diagonal - head) / 0.15, 2.0)) * uSweep;
}
`;

// Épine or Feuille: uTarget = stem aimed at, uAngry = 0 to 1 over 2 s, uAge = seconds since it arrived,
// uShake = 1 for Épine (the stem trembles), 0 for Feuille.
const ANGER_GLSL = `
uniform float uTarget;
uniform float uAngry;
uniform float uAge;
uniform float uShake;
float targeted(float stem) {
  return 1.0 - step(0.5, abs(stem - uTarget));
}
vec2 shake(float hit) {
  vec2 jolt = vec2(sin(uTime * 47.0) * 2.6 + sin(uTime * 31.0) * 1.2, cos(uTime * 39.0) * 2.2);
  return jolt * uAngry * hit * uShake;
}
// Newest thorns grow one after the other (order 1 to 4); 2.0 = fully shown.
float grown(float order) {
  if (order < 0.5) return 2.0;
  float k = clamp((uAge - 0.15 - (order - 1.0) * 0.2) / 0.6, 0.0, 1.0);
  return 1.0 - pow(1.0 - k, 3.0);
}
`;

// aGrow.x = when the point appears (0 = foot of the trunk, 1 = tip of the leaves), aGrow.y = birth (s).
// Returns 0 (not there yet) to 1 (grown).
const GROW_GLSL = `
attribute vec2 aGrow;
float sprouted() {
  float progress = clamp((uTime - aGrow.y) / ${GROW_SECONDS.toFixed(2)}, 0.0, 1.0);
  float eased = 1.0 - pow(1.0 - progress, 2.0);
  return clamp((eased * 1.05 - aGrow.x) / 0.05, 0.0, 1.0);
}
`;

// uFocus = 0 to 1 while a message is hovered. vOn = on the thread, vDim = light kept.
const FOCUS_GLSL = `
attribute float aLit;
uniform float uFocus;
varying float vOn;
varying float vDim;
void focus() {
  vOn = aLit * uFocus;
  vDim = mix(1.0, ${DIMMED.toFixed(2)}, (1.0 - aLit) * uFocus);
}
`;

const UNDER_TEXT_GLSL = `
uniform vec4 uBoxes[${MAX_BOXES}];
uniform int uBoxCount;
uniform float uUnderText;
float shown(vec2 p) {
  float hidden = 0.0;
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= uBoxCount) break;
    vec4 box = uBoxes[i];
    vec2 inside = smoothstep(box.xy - 2.0, box.xy + 2.0, p) * (1.0 - smoothstep(box.zw - 2.0, box.zw + 2.0, p));
    hidden = max(hidden, inside.x * inside.y);
  }
  return mix(1.0, uUnderText, hidden);
}
`;

const COLORS_GLSL = `
const vec3 WHITE = vec3(1.0);
const vec3 THREAD = vec3(0.561, 0.659, 1.0);
const vec3 ICE = vec3(0.769, 0.902, 1.0);
const vec3 BRIGHT = vec3(0.184, 0.384, 1.0);
uniform vec3 uTint;
const vec3 PALE = vec3(1.0, 0.89, 0.89);
`;

const LINE_VERTEX = `
${SWAY_GLSL}
${GROW_GLSL}
${ANGER_GLSL}
${UNDER_TEXT_GLSL}
${FOCUS_GLSL}
uniform float uZoom;
uniform float uGlowRadius;
attribute vec2 aNormal;
attribute float aSide;
attribute float aT;
attribute vec3 aWidth;
attribute float aStem;
attribute float aFresh;
varying float vAnger;
varying float vT;
varying float vReveal;
varying float vAcross;
varying float vCore;
varying float vFade;
varying float vBlade;
varying float vShown;
varying float vSweep;

void main() {
  float t = aT;
  float growing = sprouted();
  vShown = shown(position.xy) * growing;
  float blade = step(2.5, aWidth.z);
  float spike = step(1.5, aWidth.z) - blade;
  float palm = 0.45 + 0.55 * abs(0.7 * sin(t * 6.0 + aWidth.z * 6.28) + 0.3 * sin(t * 15.0 + aWidth.z * 3.0));
  float line = mix(aWidth.x, aWidth.y, t) * palm;
  float needle = aWidth.y + (aWidth.x - aWidth.y) * pow(1.0 - t, 1.6);
  float seed = aWidth.z * 37.0;
  float depth = 0.12 + 0.22 * (0.5 + 0.5 * sin(t * 17.0 + seed));
  float teeth = 1.0 - depth * pow(fract(t * (8.0 + mod(seed, 6.0)) + seed), 1.6) * step(0.1, t);
  float lobes = 1.0 + 0.22 * sin(t * (4.0 + mod(seed, 3.0)) * 3.14159 + seed + aSide * 1.7);
  teeth *= mix(1.0, lobes, blade);
  float lopsided = 1.0 + aSide * (aWidth.z - 3.225) * 2.0 * blade;
  float leaf = (aWidth.y + aWidth.x * pow(sin(3.14159 * pow(t, 0.75)), 0.8) * teeth * lopsided) * uZoom;
  // A point being reached starts thin and widens; before that, it has no width at all.
  float core = (line * (1.0 - spike - blade) + needle * spike + leaf * blade) * mix(0.2, 1.0, growing);
  float halfWidth = (core / 2.0 + uGlowRadius) * step(0.001, growing);
  vec3 p = position;
  float hit = targeted(aStem);
  p.xy += sway(p.xy) + shake(hit) + aNormal * aSide * halfWidth / uZoom;
  vAnger = hit * uAngry;
  vT = t;
  vReveal = mix(2.0, grown(aFresh), hit);
  vAcross = aSide * halfWidth;
  vCore = core / 2.0;
  vFade = max(smoothstep(0.0, 0.05, t), spike + blade);
  vBlade = blade;
  focus();
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vSweep = sweep(gl_Position);
}
`;

const LINE_FRAGMENT = `
${COLORS_GLSL}
uniform float uGlow;
uniform float uGlowRadius;
varying float vAnger;
varying float vT;
varying float vReveal;
varying float vAcross;
varying float vCore;
varying float vFade;
varying float vBlade;
varying float vShown;
varying float vSweep;
varying float vOn;
varying float vDim;

void main() {
  vec3 bright = mix(BRIGHT, uTint, vAnger);
  vec3 white = mix(WHITE, PALE, vAnger);
  float d = abs(vAcross);
  float inside = 1.0 - smoothstep(vCore - 0.5, vCore + 0.5, d);
  float center = clamp(1.0 - d / max(vCore, 0.5), 0.0, 1.0);
  vec3 tube = mix(bright, white, pow(center, 0.8));
  float core = inside * min(1.0, vCore * 2.0 + 0.3);
  float glow = exp(-pow(max(0.0, d - vCore) / uGlowRadius * 2.0, 2.0)) * uGlow;
  float a = max(core, glow) * vFade;
  vec3 color = mix(bright, tube, inside);
  float midrib = smoothstep(0.8, 1.0, center);
  float rim = 1.0 - smoothstep(0.0, 0.2, center);
  float across = clamp(vAcross / max(vCore, 0.5), -1.0, 1.0);
  float lit = smoothstep(-0.3, 1.0, -across);
  vec3 bladeColor = mix(bright * 0.5, mix(bright, white, 0.8), lit);
  bladeColor = mix(bladeColor, white, max(midrib, rim * 0.4));
  float bladeAlpha = max(inside * (0.6 + 0.4 * lit + 0.3 * rim + 0.5 * midrib), glow);
  a = mix(a, bladeAlpha, vBlade);
  color = mix(color, bladeColor, vBlade);
  a *= vShown;
  // A growing thorn shows only from its base up to vReveal.
  a *= step(vT, vReveal - 0.001);
  a = min(1.0, a * (1.0 + vSweep));
  color = mix(color, WHITE, vSweep * 0.5);
  float threadLit = vOn * ${THREAD_MIX.toFixed(2)};
  color = mix(color, mix(THREAD, WHITE, pow(center, 2.0) * 0.3), threadLit);
  a = min(1.0, a * (1.0 + 0.6 * threadLit)) * vDim;
  if (a < 0.01) discard;
  gl_FragColor = vec4(color, a);
}
`;

const NODE_VERTEX = `
${SWAY_GLSL}
${GROW_GLSL}
${ANGER_GLSL}
${UNDER_TEXT_GLSL}
${FOCUS_GLSL}
uniform float uPixelRatio;
attribute vec2 aNode;
attribute float aStem;
varying float vPulse;
varying float vAnger;

void main() {
  vec3 p = position;
  float hit = targeted(aStem);
  p.xy += sway(p.xy) + shake(hit);
  vAnger = hit * uAngry;
  focus();
  float growing = sprouted();
  vPulse = (0.75 + 0.25 * sin(uTime * 1.2 + aNode.y)) * shown(position.xy) * growing;
  gl_PointSize = aNode.x * 4.0 * uPixelRatio * growing;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vPulse *= 1.0 + sweep(gl_Position);
}
`;

const NODE_FRAGMENT = `
${COLORS_GLSL}
varying float vPulse;
varying float vAnger;
varying float vOn;
varying float vDim;

void main() {
  vec3 bright = mix(BRIGHT, uTint, vAnger);
  vec3 ice = mix(ICE, PALE, vAnger);
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.12, 0.25, d);
  float glow = exp(-d * d * 5.0) * 0.45;
  float a = max(core, glow) * vPulse * vDim;
  if (a < 0.01) discard;
  vec3 color = mix(bright, mix(ice, WHITE, core), max(core, 0.4));
  gl_FragColor = vec4(mix(color, mix(THREAD, WHITE, core * 0.6), vOn * ${THREAD_MIX.toFixed(2)}), a);
}
`;

type View = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  lines: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  nodes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  width: number;
  height: number;
  animated: boolean;
  boxes: THREE.Vector4[];
  boxCount: { value: number };
  anger: {
    uTarget: { value: number };
    uAngry: { value: number };
    uAge: { value: number };
    uShake: { value: number };
    uTint: { value: THREE.Vector3 };
  };
  angerStart: number | null;
  // Hovered thread: current fade (uFocus), where it goes, and the message of each vertex.
  focus: { value: number };
  focusTarget: number;
  lineStems: number[];
  nodeStems: number[];
};

// Puts aLit = 1 on the vertices of the lit messages, 0 elsewhere.
function applyLit(view: View, lit: Set<number> | null) {
  const paint = (geometry: THREE.BufferGeometry, stems: number[]) => {
    const attribute = geometry.getAttribute("aLit") as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    const values = attribute.array as Float32Array;
    for (let i = 0; i < stems.length; i++) values[i] = lit?.has(stems[i]) ? 1 : 0;
    attribute.needsUpdate = true;
  };
  paint(view.lines.geometry, view.lineStems);
  paint(view.nodes.geometry, view.nodeStems);
}

function angerEnvelope(age: number) {
  if (age < 0 || age > ANGER.duration) return 0;
  return Math.min(1, age / ANGER.fadeIn) * Math.min(1, (ANGER.duration - age) / ANGER.fadeOut);
}

function textBoxes(stems: Stem[], boxes: THREE.Vector4[]) {
  const messages = stems.map((stem) => stem.to).slice(0, MAX_BOXES);
  messages.forEach((box, k) => {
    boxes[k].set(box.x - box.width / 2, -(box.y + box.height / 2), box.x + box.width / 2, -(box.y - box.height / 2));
  });
  return messages.length;
}

function draw(view: View, camera: Camera) {
  const { width, height } = view;
  view.camera.left = (-width / 2 - camera.x) / camera.zoom;
  view.camera.right = (width / 2 - camera.x) / camera.zoom;
  view.camera.top = (height / 2 + camera.y) / camera.zoom;
  view.camera.bottom = (camera.y - height / 2) / camera.zoom;
  view.camera.updateProjectionMatrix();
  view.lines.material.uniforms.uZoom.value = camera.zoom;
  view.renderer.render(view.scene, view.camera);
}

// sprouts: when each branch starts to grow, by message id (see useSprouts).
// highlight: messages of the hovered thread (null = nothing hovered).
type BranchesProps = {
  stems: Stem[];
  camera: Camera;
  thornArrival: Arrival | null;
  leafArrival: Arrival | null;
  sprouts: Map<number, Sprout>;
  highlight: Set<number> | null;
};

function Branches({ stems, camera, thornArrival, leafArrival, sprouts, highlight }: BranchesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const cameraRef = useRef(camera);
  // Last lit thread: kept while it fades out.
  const litRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      console.log("WebGL indisponible : branches non dessinées");
      return;
    }
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    orthographic.position.z = 10;
    const time = { value: 0 };
    const zoom = { value: 1 };
    const sway = { value: SWAY };
    const motion = { uBreath: { value: BREATH }, uSweep: { value: SWEEP } };
    const boxes = Array.from({ length: MAX_BOXES }, () => new THREE.Vector4());
    const boxCount = { value: 0 };
    const focus = { value: 0 };
    const underText = { uBoxes: { value: boxes }, uBoxCount: boxCount, uUnderText: { value: UNDER_TEXT } };
    // uAge 1000 = no animation running: every thorn fully shown.
    const anger = {
      uTarget: { value: -1 },
      uAngry: { value: 0 },
      uAge: { value: 1000 },
      uShake: { value: 1 },
      uTint: { value: new THREE.Vector3(...TINT.thorn) },
    };
    const lineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...underText,
        ...motion,
        ...anger,
        uFocus: focus,
        uTime: time,
        uSway: sway,
        uZoom: zoom,
        uGlow: { value: GLOW },
        uGlowRadius: { value: GLOW_RADIUS },
      },
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const nodeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...underText, ...motion, ...anger, uFocus: focus, uTime: time, uSway: sway, uPixelRatio: { value: pixelRatio } },
      vertexShader: NODE_VERTEX,
      fragmentShader: NODE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.Mesh(new THREE.BufferGeometry(), lineMaterial);
    const nodes = new THREE.Points(new THREE.BufferGeometry(), nodeMaterial);
    lines.frustumCulled = false;
    nodes.frustumCulled = false;
    const flower = createCentralFlower({ time, zoom, pixelRatio });
    scene.add(lines, nodes, ...flower.layers);
    const animated = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const view: View = {
      renderer, scene, camera: orthographic, lines, nodes, width: 1, height: 1, animated, boxes, boxCount, anger, angerStart: null,
      focus, focusTarget: 0, lineStems: [], nodeStems: [],
    };
    viewRef.current = view;

    const observer = new ResizeObserver(() => {
      view.width = Math.max(1, parent.clientWidth);
      view.height = Math.max(1, parent.clientHeight);
      renderer.setSize(view.width, view.height, false);
      draw(view, cameraRef.current);
    });
    observer.observe(parent);

    if (animated) {
      renderer.setAnimationLoop((now: number) => {
        const dt = Math.min(0.1, Math.max(0, now / 1000 - time.value));
        time.value = now / 1000;
        // The lit thread fades in and out instead of switching at once.
        focus.value += (view.focusTarget - focus.value) * (1 - Math.exp(-dt / FOCUS_FADE));
        if (view.angerStart !== null) {
          const age = time.value - view.angerStart;
          const over = age > ANGER.duration;
          // A Feuille grows no thorn: they stay fully shown.
          anger.uAge.value = over || anger.uShake.value === 0 ? 1000 : age;
          anger.uAngry.value = angerEnvelope(age);
          if (over) view.angerStart = null;
        }
        draw(view, cameraRef.current);
      });
    }

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      lines.geometry.dispose();
      nodes.geometry.dispose();
      lineMaterial.dispose();
      nodeMaterial.dispose();
      flower.dispose();
      renderer.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.lines.geometry.dispose();
    view.nodes.geometry.dispose();
    // Without motion, every branch is born long ago: shown fully grown.
    const births = new Map(stems.map((stem) => [stem.id, view.animated ? (sprouts.get(stem.id)?.birth ?? -1e6) : -1e6]));
    const geometry = buildGeometry(stems, births);
    view.lines.geometry = geometry.lines;
    view.nodes.geometry = geometry.points;
    view.lineStems = geometry.stemIds;
    view.nodeStems = geometry.nodeStems;
    applyLit(view, litRef.current);
    view.boxCount.value = textBoxes(stems, view.boxes);
    if (!view.animated) draw(view, cameraRef.current);
  }, [stems, sprouts]);

  useEffect(() => {
    const view = viewRef.current;
    // On leaving, keep the old thread lit so it can fade out.
    if (highlight) {
      litRef.current = highlight;
      if (view) applyLit(view, highlight);
    }
    if (!view) return;
    view.focusTarget = highlight ? 1 : 0;
    if (!view.animated) {
      view.focus.value = view.focusTarget;
      draw(view, cameraRef.current);
    }
  }, [highlight]);

  // Épine and Feuille share the same 2 s tint: the latest one to arrive wins.
  function tint(arrival: Arrival | null, kind: keyof typeof TINT) {
    const view = viewRef.current;
    if (!view || !view.animated || !arrival) return;
    view.angerStart = performance.now() / 1000;
    view.anger.uTarget.value = arrival.target;
    view.anger.uAge.value = kind === "thorn" ? 0 : 1000;
    view.anger.uShake.value = kind === "thorn" ? 1 : 0;
    view.anger.uTint.value.fromArray(TINT[kind]);
  }

  useEffect(() => tint(thornArrival, "thorn"), [thornArrival]);
  useEffect(() => tint(leafArrival, "leaf"), [leafArrival]);

  useEffect(() => {
    cameraRef.current = camera;
    const view = viewRef.current;
    if (view && !view.animated) draw(view, camera);
  }, [camera]);

  return <canvas className="branches" ref={canvasRef} aria-hidden />;
}

export default Branches;
