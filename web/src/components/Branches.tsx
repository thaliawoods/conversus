import { useEffect, useRef } from "react";
import * as THREE from "three";
import { pointOnStem, wiltSag, type Placement, type Size } from "../layout";
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
const SWEEP = 0.6;
const POINT_GAP = 1.5;
export const LEAF = { length: 20, width: 10, turn: 0.35, petiole: 14 };
const PETIOLE_WIDTH = { base: 1.2, tip: 0.8 };
const VEIN_WIDTH = { base: 0.6, tip: 0.2 };
// Flowers, set aside for now (kept to bring them back, see addBlossom):
// // Small cherry blossom grown by each "content", at the tip of a twig, drawn with the same light line
// // as the branches: five broad petals with a notch at the tip, a few stamens, a glowing heart.
// const BLOSSOM = { stalk: 9, petal: 8, spread: 0.58, notch: 0.2, petals: 5, stamens: 7, stamen: 0.45, heart: 2 };
// const STALK_WIDTH = { base: 0.9, tip: 0.6 };
// const PETAL_WIDTH = { base: 0.7, tip: 0.7 };
// const PETAL_VEIN_WIDTH = { base: 0.45, tip: 0.15 };
// const STAMEN_WIDTH = { base: 0.35, tip: 0.35 };
// const BLOSSOM_SHARE = 0.28;
const THORN = { length: 10, spacing: 7, turn: 1.4 };
const THORN_WIDTH = { base: 6, tip: 0.05 };
const MARK_ROOM = 18;
const FLOWER_CLEAR = 130;
const TEXT_CLEAR = 30;
const SPIKE = 2;
const BLADE = 3;
const UNDER_TEXT = 0.2;
const UNDER_TEXT_LIT = 0.4;
const TEXT_MARGIN = 4;
const MAX_BOXES = 128;
const ANGER = { duration: 2, fadeIn: 0.3, fadeOut: 0.8 };
// Colour the whole branch takes for a moment when someone reacts, while the new leaf or thorn grows.
const TINT = { thorn: [1.0, 0.353, 0.212], leaf: [0.878, 0.31, 0.604], wilt: [0.608, 0.42, 1.0] } as const;
// Order of the lines of a new mark, offset by its kind: a "content" only regrows the newest leaf,
// an "en colère" only the newest thorn, even on a branch that has both.
const FRESH = { thorn: 100, leaf: 200, leaving: 300 } as const;
// Time a mark that went takes to shrink back to its base.
const RETREAT_SECONDS = 0.7;
const GROW_SECONDS = 2.4;
const TRUNK_SHARE = 0.7;
const TWIG_SHARE = 0.22;
const FORK_SHARE = 0.12;
const CREASE_SHARE = 0.08;
const LEAF_SHARE = 0.28;
const THORN_SHARE = 0.14;
const FOCUS_FADE = 0.12;
const DIMMED = 0.6;
const THREAD_MIX = 1.0;
export type Color = readonly [number, number, number];
const BLUE: Color = [0.184, 0.384, 1.0];
// Sag of the saddest possible branch: its twigs then hang almost straight down.
const FULL_SAG = wiltSag(Number.MAX_SAFE_INTEGER);
const DROOP = 0.8;
// Down on screen (layout y grows downward).
const DOWN = Math.PI / 2;

// Turns a twig's angle toward the ground, more as the branch gets sadder.
function droop(angle: number, amount: number) {
  if (amount <= 0) return angle;
  const towardDown = Math.atan2(Math.sin(DOWN - angle), Math.cos(DOWN - angle));
  return angle + towardDown * amount * DROOP;
}

export const ARRIVE_SECONDS = GROW_SECONDS * (1 - Math.sqrt(1 - TRUNK_SHARE / 1.05));

export type Mark = "leaf" | "thorn";
// gone: marks taken back, which keep their place so the others never move; leaving: the one
// that just went, still drawn for a moment while it shrinks.
export type Stem = { from: Placement | null; to: Placement; sag: number; id: number; marks: Mark[]; gone?: boolean[]; leaving?: number; text: Size };
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

// Where each mark sits along the stem (0 = base, 1 = tip). The k-th mark always gets the same spot,
// so a new mark never moves the others, and marks take the gaps between the twigs, never pushing them.
// shift: another walk along the stem, so leaves and thorns each have their own spots.
function placeMarks(id: number, count: number, from: number, span: number, room: number, twigs: number[], shift = 0) {
  const places: number[] = [];
  const crowded = (t: number, gap: number) => [...twigs, ...places].some((other) => Math.abs(other - t) < gap);
  const along = (step: number) => from + span * (0.08 + 0.84 * ((noise(id, 300) + shift + step * 0.618034) % 1));
  for (let step = 0; places.length < count && step < 200; step++) {
    // Golden ratio steps spread the spots evenly; after a while, accept tighter gaps on short stems.
    const t = along(step);
    if (!crowded(t, step < 100 ? room : room * 0.5)) places.push(t);
  }
  // A full stem gives fewer spots than marks: the others go on the twigs (see twigSlots).
  return places;
}

function buildGeometry(stems: Stem[], births: Map<number, number>) {
  const positions: number[] = [];
  const grows: number[] = [];
  const nodeGrows: number[] = [];
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
  const nodeFresh: number[] = [];
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
    nodeFresh.push(freshOrder);
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

  // A three-leaflet leaf for each "content": a short petiole, a leaflet at its tip and a pair below.
  // fresh: the newest leaf of the stem, drawn line after line when its "content" arrives.
  function addLeaf(base: Point, side: number, seed: number, code: number) {
    const angle = (base.angle * Math.PI) / 180 + side * (0.9 + noise(seed, 2) * 0.3);
    freshOrder = code ? code + 1 : 0;
    const petiole = curve(base, angle, side * 0.2, LEAF.petiole);
    addLine(petiole, PETIOLE_WIDTH, seed + 1);
    freshOrder = code ? code + 2 : 0;
    const tip = petiole[petiole.length - 1];
    addLeaflet(tip, (tip.angle * Math.PI) / 180, side, 1, seed + 2);
    const node = petiole[Math.round(0.55 * (petiole.length - 1))];
    const forward = (node.angle * Math.PI) / 180;
    for (const edge of [-1, 1]) addLeaflet(node, forward + edge * 1.1, edge, 0.75, seed + 3 + edge);
    freshOrder = 0;
  }

  // Flowers, set aside for now. To bring them back: uncomment BLOSSOM and its widths at the top,
  // these two functions, the twig tips below, and the flower version of the marks at the end.
  //
  // // fresh: the newest flower of the stem, drawn line after line when its "content" arrives
  // // (stalk, then petals, then stamens), like a new thorn.
  // function addBlossom(heart: Point, seed: number, fresh: boolean, firstOrder = 1) {
  //   const turn = noise(seed, 5) * Math.PI * 2;
  //   freshOrder = fresh ? FRESH.leaf + firstOrder : 0;
  //   for (let p = 0; p < BLOSSOM.petals; p++) {
  //     const axis = turn + (p / BLOSSOM.petals) * Math.PI * 2 + (noise(seed, 15 + p) - 0.5) * 0.15;
  //     const length = BLOSSOM.petal * (0.85 + noise(seed, 10 + p) * 0.3);
  //     // Leaves the heart on one side of the axis, swells into a broad round lobe with a small
  //     // notch at its tip, then comes back to the heart on the other side.
  //     const outline = Array.from({ length: 25 }, (_, k) => {
  //       const u = 2 * (k / 24) - 1;
  //       const notch = 1 - BLOSSOM.notch * Math.exp(-((u / 0.16) ** 2));
  //       const reach = length * Math.pow(1 - Math.abs(u) ** 2.4, 0.55) * notch;
  //       const offset = axis + BLOSSOM.spread * u;
  //       return { x: heart.x + Math.cos(offset) * reach, y: heart.y + Math.sin(offset) * reach };
  //     });
  //     addLine(withAngles(outline), PETAL_WIDTH, seed + 10 + p, 0.5);
  //     // One fine stroke down the petal, like the pen hatching of the drawing.
  //     const vein = [0.3, 0.62].map((at) => ({
  //       x: heart.x + Math.cos(axis) * length * at,
  //       y: heart.y + Math.sin(axis) * length * at,
  //     }));
  //     addLine(withAngles(vein), PETAL_VEIN_WIDTH, seed + 30 + p, 0.5);
  //   }
  //   freshOrder = fresh ? FRESH.leaf + firstOrder + 1 : 0;
  //   for (let s = 0; s < BLOSSOM.stamens; s++) {
  //     const angle = turn + ((s + 0.5) / BLOSSOM.stamens) * Math.PI * 2 + (noise(seed, 40 + s) - 0.5) * 0.4;
  //     const reach = BLOSSOM.petal * BLOSSOM.stamen * (0.75 + noise(seed, 50 + s) * 0.5);
  //     const tip = { x: heart.x + Math.cos(angle) * reach, y: heart.y + Math.sin(angle) * reach };
  //     addLine(withAngles([heart, tip]), STAMEN_WIDTH, seed + 60 + s, 0.5);
  //     addNode({ ...tip, angle: 0 }, 1, seed + 70 + s);
  //   }
  //   addNode(heart, BLOSSOM.heart, seed + 20);
  //   freshOrder = 0;
  // }
  //
  // // When every twig already has its flower: a short stalk off the stem carries the next one.
  // function addStalkBlossom(base: Point, side: number, seed: number, fresh: boolean) {
  //   const angle = (base.angle * Math.PI) / 180 + side * (0.9 + noise(seed, 2) * 0.3);
  //   const stalk = curve(base, angle, side * 0.25, BLOSSOM.stalk * (0.8 + noise(seed, 4) * 0.4));
  //   freshOrder = fresh ? FRESH.leaf + 1 : 0;
  //   addLine(stalk, STALK_WIDTH, seed + 1);
  //   addBlossom(stalk[stalk.length - 1], seed, fresh, 2);
  // }

  function addThorn(trunk: Point[], center: number, side: number, seed: number, code: number) {
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
      freshOrder = code ? code + i + 1 : 0;
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

    let bare = 0;
    if (stem.from === null) {
      while (bare < samples && Math.hypot(axis[bare].x, axis[bare].y) < FLOWER_CLEAR) bare++;
    }
    const span = Math.max(range.end - range.start, 1e-6);
    const clear = Math.min(0.8, Math.max(0, (bare / samples - range.start) / span));
    const beforeText = stem.from === null ? Math.min(0.8 - clear, TEXT_CLEAR / Math.max(visible, 1)) : 0;
    const markSpan = 1 - clear - Math.max(0, beforeText);
    const room = MARK_ROOM / Math.max(visible, 1);

    // Square root: a single sad vote already makes the twigs hang visibly.
    const sadness = Math.sqrt(Math.min(1, Math.max(0, stem.sag / FULL_SAG)));
    const twigCount = 2 + Math.floor(noise(stem.id, 3) * 3);
    const twigPlaces: number[] = [];
    const twigLines: { points: Point[]; start: number; span: number }[] = [];
    // Flowers (set aside): twig and fork tips, in a fixed order, so the k-th flower always opens on the same one.
    // const tips: { point: Point; grows: number }[] = [];
    for (let j = 0; j < twigCount; j++) {
      const at = 0.3 + ((j + noise(stem.id, 10 + j)) / twigCount) * 0.5;
      twigPlaces.push(at);
      const baseIndex = indexAt(at);
      const base = trunk[baseIndex];
      growth = { start: trunkAt(baseIndex), span: TWIG_SHARE, birth };
      const side = (j + Math.floor(noise(stem.id, 4) * 2)) % 2 ? 1 : -1;
      const angle = droop((base.angle * Math.PI) / 180 + side * (0.45 + noise(stem.id, 20 + j) * 0.4), sadness);
      const reach = visible * (0.15 + noise(stem.id, 30 + j) * 0.15);
      const twig = sprout(base, angle, reach, side * (1 - sadness), stem.id * 10 + j);
      addLine(twig, TWIG_WIDTH, stem.id * 10 + j);
      twigLines.push({ points: twig, start: growth.start, span: TWIG_SHARE });
      // tips.push({ point: twig[twig.length - 1], grows: trunkAt(baseIndex) + TWIG_SHARE });
      addNode(base, 2 + noise(stem.id, 35 + j), stem.id * 10 + j);

      if (noise(stem.id, 40 + j) > 0.35) {
        const forkIndex = Math.min(twig.length - 1, Math.round(twig.length * 0.55));
        const fork = twig[forkIndex];
        growth = { start: trunkAt(baseIndex) + TWIG_SHARE * (forkIndex / (twig.length - 1)), span: FORK_SHARE, birth };
        const forkAngle = droop((fork.angle * Math.PI) / 180 - side * (0.5 + noise(stem.id, 45 + j) * 0.3), sadness);
        const forked = sprout(fork, forkAngle, reach * 0.5, -side * (1 - sadness), stem.id * 10 + j + 5);
        addLine(forked, FORK_WIDTH, stem.id * 10 + j + 5);
        twigLines.push({ points: forked, start: growth.start, span: FORK_SHARE });
        // tips.push({ point: forked[forked.length - 1], grows: growth.start + FORK_SHARE });
        addNode(fork, 2, stem.id * 10 + j + 5);
      }
    }

    const creases = 3 + Math.floor(noise(stem.id, 50) * 3);
    for (let c = 0; c < creases; c++) {
      const at = 0.15 + noise(stem.id, 51 + c) * 0.75;
      const baseIndex = indexAt(at);
      const base = trunk[baseIndex];
      growth = { start: trunkAt(baseIndex), span: CREASE_SHARE, birth };
      const side = noise(stem.id, 60 + c) > 0.5 ? 1 : -1;
      const angle = droop((base.angle * Math.PI) / 180 + side * (0.25 + noise(stem.id, 70 + c) * 0.35), sadness);
      const reach = 4 + noise(stem.id, 80 + c) * 6;
      addLine(sprout(base, angle, reach, side * (1 - sadness), stem.id * 100 + c), CREASE_WIDTH, stem.id * 100 + c);
    }

    const beads = Math.round(visible / 40);
    for (let b = 0; b < beads; b++) {
      const index = indexAt(0.1 + noise(stem.id, 90 + b) * 0.85);
      growth = { start: trunkAt(index), span: 0, birth };
      addNode(trunk[index], 2 + noise(stem.id, 95 + b) * 1.5, stem.id * 7 + b);
    }

    // Leaves ("content") and thorns ("en colère") along the stem, each kind on its own spots, by rank
    // among its kind: the n-th leaf and the n-th thorn always sit at the same place with the same
    // look, whatever comes or goes (a leaf taken by "triste", a changed vote), so nothing shuffles.
    let leaves = 0;
    let thorns = 0;
    const leafCount = stem.marks.filter((mark) => mark === "leaf").length;
    const leafPlaces = placeMarks(stem.id, leafCount, clear, markSpan, room, twigPlaces);
    const thornPlaces = placeMarks(stem.id, stem.marks.length - leafCount, clear, markSpan, room, twigPlaces, 0.5);
    // Once the stem is full, marks go on the twigs: a spot every MARK_ROOM px from 30 % of each
    // twig to its tip, taken twig after twig so they spread out, even spots for leaves and odd
    // ones for thorns. When the twigs are full too, a new mark is not drawn (the branch still
    // takes its colour): nothing is ever drawn over another mark.
    const perTwig = twigLines.map(({ points, start, span }) => {
      const length = points.reduce((sum, point, i) => (i === 0 ? 0 : sum + Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y)), 0);
      const gap = Math.max(1, Math.round(((points.length - 1) * MARK_ROOM) / Math.max(length, 1)));
      const slots: { line: Point[]; index: number; grows: number }[] = [];
      for (let i = Math.round((points.length - 1) * 0.3); i < points.length - 1; i += gap) {
        slots.push({ line: points, index: i, grows: start + span * (i / (points.length - 1)) });
      }
      return slots;
    });
    const twigSlots = perTwig.flatMap((_, round) => perTwig.flatMap((slots) => (slots[round] ? [slots[round]] : [])));
    const slotsFor = { leaf: twigSlots.filter((_, i) => i % 2 === 0), thorn: twigSlots.filter((_, i) => i % 2 === 1) };
    const gone = stem.gone ?? [];
    const newestLeaf = stem.marks.findLastIndex((mark, k) => mark === "leaf" && !gone[k]);
    const newestThorn = stem.marks.findLastIndex((mark, k) => mark === "thorn" && !gone[k]);
    stem.marks.forEach((mark, k) => {
      const rank = mark === "leaf" ? leaves++ : thorns++;
      const onStem = mark === "leaf" ? leafPlaces : thornPlaces;
      const side = rank % 2 === 0 ? 1 : -1;
      const seed = stem.id * 1000 + (mark === "leaf" ? rank : 500 + rank);
      // A mark taken back keeps its rank (so its spot) but is not drawn, unless it is shrinking.
      if (gone[k] && k !== stem.leaving) return;
      const code = k === stem.leaving ? FRESH.leaving : k === (mark === "leaf" ? newestLeaf : newestThorn) ? FRESH[mark] : 0;
      const span = mark === "leaf" ? LEAF_SHARE : THORN_SHARE;
      let line = trunk;
      let index: number;
      if (rank < onStem.length) {
        index = indexAt(onStem[rank]);
        growth = { start: trunkAt(index), span, birth };
      } else {
        const slot = slotsFor[mark][rank - onStem.length];
        if (!slot) return;
        line = slot.line;
        index = slot.index;
        growth = { start: slot.grows, span, birth };
      }
      if (mark === "leaf") addLeaf(line[index], side, seed, code);
      else addThorn(line, index, -side, seed, code);
    });

    // Flower version of the marks (set aside, replaces the loop above): flowers open at the twig
    // tips; thorns, and flowers once every tip has one, sit along the stem.
    // let flowers = 0;
    // let thorns = 0;
    // const newestFlower = stem.marks.lastIndexOf("leaf");
    // const newestThorn = stem.marks.lastIndexOf("thorn");
    // const onStem: { mark: Mark; seed: number; fresh: boolean }[] = [];
    // stem.marks.forEach((mark, k) => {
    //   const fresh = k === (mark === "leaf" ? newestFlower : newestThorn);
    //   const rank = mark === "leaf" ? flowers++ : 500 + thorns++;
    //   const seed = stem.id * 1000 + rank;
    //   const tip = mark === "leaf" ? tips[rank] : undefined;
    //   if (!tip) {
    //     onStem.push({ mark, seed, fresh });
    //     return;
    //   }
    //   growth = { start: tip.grows, span: BLOSSOM_SHARE, birth };
    //   addBlossom(tip.point, seed, fresh);
    // });
    // const markPlaces = placeMarks(stem.id, onStem.length, clear, markSpan, room, twigPlaces);
    // onStem.forEach(({ mark, seed, fresh }, place) => {
    //   const index = indexAt(markPlaces[place]);
    //   const side = place % 2 === 0 ? 1 : -1;
    //   growth = { start: trunkAt(index), span: mark === "leaf" ? BLOSSOM_SHARE : THORN_SHARE, birth };
    //   if (mark === "leaf") addStalkBlossom(trunk[index], side, seed, fresh);
    //   else addThorn(trunk, index, side, seed, fresh);
    // });
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
  lines.setAttribute("aLit", new THREE.Float32BufferAttribute(new Float32Array(stemIds.length), 1));
  lines.setAttribute("aMood", new THREE.Float32BufferAttribute(new Float32Array(stemIds.length * 3), 3));
  lines.setIndex(indices);

  const points = new THREE.BufferGeometry();
  points.setAttribute("position", new THREE.Float32BufferAttribute(nodes, 3));
  points.setAttribute("aNode", new THREE.Float32BufferAttribute(nodeSizes, 2));
  points.setAttribute("aStem", new THREE.Float32BufferAttribute(nodeStems, 1));
  points.setAttribute("aFresh", new THREE.Float32BufferAttribute(nodeFresh, 1));
  points.setAttribute("aGrow", new THREE.Float32BufferAttribute(nodeGrows, 2));
  points.setAttribute("aLit", new THREE.Float32BufferAttribute(new Float32Array(nodeStems.length), 1));
  points.setAttribute("aMood", new THREE.Float32BufferAttribute(new Float32Array(nodeStems.length * 3), 3));
  return { lines, points, stemIds, nodeStems };
}

// Branches never move: only a light sweep runs along them.
const SWEEP_GLSL = `
uniform float uTime;
uniform float uSweep;
float sweep(vec4 clip) {
  float diagonal = (clip.x + clip.y) * 0.5;
  float head = mix(-1.4, 1.4, clamp(mod(uTime, 9.0) / 4.0, 0.0, 1.0));
  return exp(-pow((diagonal - head) / 0.15, 2.0)) * uSweep;
}
`;

const ANGER_GLSL = `
uniform float uTarget;
uniform float uAngry;
uniform float uAge;
// Kind of mark growing now (FRESH.thorn or FRESH.leaf, 0 for none).
uniform float uFreshKind;
// Stem whose mark is shrinking away, and since when.
uniform float uLeaveTarget;
uniform float uLeaveAge;
float targeted(float stem) {
  return 1.0 - step(0.5, abs(stem - uTarget));
}
float grown(float order) {
  if (order < 0.5 || abs(floor(order / 100.0) * 100.0 - uFreshKind) > 0.5) return 2.0;
  float rank = order - uFreshKind;
  float k = clamp((uAge - 0.15 - (rank - 1.0) * 0.2) / 0.6, 0.0, 1.0);
  return 1.0 - pow(1.0 - k, 3.0);
}
// How far along its line a mark is drawn: growing (fresh), shrinking (leaving) or whole (2.0).
float reveal(float order, float stem) {
  if (order > 299.5) {
    float left = 1.0 - clamp(uLeaveAge / ${RETREAT_SECONDS.toFixed(2)}, 0.0, 1.0);
    return mix(0.0, left * left, 1.0 - step(0.5, abs(stem - uLeaveTarget)));
  }
  return mix(2.0, grown(order), targeted(stem));
}
`;

const GROW_GLSL = `
attribute vec2 aGrow;
float sprouted() {
  float progress = clamp((uTime - aGrow.y) / ${GROW_SECONDS.toFixed(2)}, 0.0, 1.0);
  float eased = 1.0 - pow(1.0 - progress, 2.0);
  return clamp((eased * 1.05 - aGrow.x) / 0.05, 0.0, 1.0);
}
`;

const FOCUS_GLSL = `
attribute float aLit;
attribute vec3 aMood;
uniform float uFocus;
varying float vOn;
varying float vDim;
varying vec3 vMood;
void focus() {
  vMood = aMood;
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
const vec3 THREAD = vec3(1.0, 0.875, 0.306);
const vec3 ICE = vec3(0.769, 0.902, 1.0);
uniform vec3 uTint;
const vec3 PALE = vec3(1.0, 0.89, 0.89);
`;

const LINE_VERTEX = `
${SWEEP_GLSL}
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
varying float vSpike;
varying float vShown;
varying float vSweep;

void main() {
  float t = aT;
  float growing = sprouted();
  vShown = max(shown(position.xy), ${UNDER_TEXT_LIT.toFixed(2)} * aLit * uFocus) * growing;
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
  float core = (line * (1.0 - spike - blade) + needle * spike + leaf * blade) * mix(0.2, 1.0, growing);
  float halfWidth = (core / 2.0 + uGlowRadius) * step(0.001, growing);
  vec3 p = position;
  float hit = targeted(aStem);
  p.xy += aNormal * aSide * halfWidth / uZoom;
  vAnger = hit * uAngry;
  vT = t;
  vReveal = reveal(aFresh, aStem);
  vAcross = aSide * halfWidth;
  vCore = core / 2.0;
  vFade = max(smoothstep(0.0, 0.05, t), spike + blade);
  vBlade = blade;
  vSpike = spike;
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
varying float vSpike;
varying float vShown;
varying float vSweep;
varying float vOn;
varying float vDim;
varying vec3 vMood;

void main() {
  vec3 bright = mix(vMood, uTint, vAnger);
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
  // Leaves stay coloured, white only along the midrib: drawn in additive blending, a few
  // overlapping leaves added up to a white blur where no shape could be read.
  vec3 bladeColor = mix(bright * 0.4, mix(bright, white, 0.38), lit);
  bladeColor = mix(bladeColor, white, max(midrib * 0.7, rim * 0.15));
  float bladeAlpha = max(inside * (0.5 + 0.22 * lit + 0.15 * rim + 0.45 * midrib), glow * 0.6);
  a = mix(a, bladeAlpha, vBlade);
  // Thorns a touch softer than the branches.
  a *= mix(1.0, 0.85, vSpike);
  color = mix(color, bladeColor, vBlade);
  a *= vShown;
  a *= step(vT, vReveal - 0.001);
  a = min(1.0, a * (1.0 + vSweep));
  color = mix(color, WHITE, vSweep * 0.5);
  float threadLit = vOn * ${THREAD_MIX.toFixed(2)};
  float light = smoothstep(0.3, 1.0, dot(color, vec3(0.299, 0.587, 0.114)));
  vec3 gold = mix(THREAD * 0.45, mix(THREAD, WHITE, 0.6), light);
  color = mix(color, gold, threadLit);
  a = min(1.0, a * (1.0 + 0.6 * threadLit * inside)) * vDim;
  if (a < 0.01) discard;
  gl_FragColor = vec4(color, a);
}
`;

const NODE_VERTEX = `
${SWEEP_GLSL}
${GROW_GLSL}
${ANGER_GLSL}
${UNDER_TEXT_GLSL}
${FOCUS_GLSL}
uniform float uPixelRatio;
attribute vec2 aNode;
attribute float aStem;
attribute float aFresh;
varying float vPulse;
varying float vAnger;

void main() {
  vec3 p = position;
  float hit = targeted(aStem);
  vAnger = hit * uAngry;
  focus();
  // A fresh point (heart, stamen of a flower, set aside for now) appears with its lines when its mark grows.
  float growing = sprouted() * min(1.0, reveal(aFresh, aStem));
  vPulse = (0.75 + 0.25 * sin(uTime * 1.2 + aNode.y)) * max(shown(position.xy), ${UNDER_TEXT_LIT.toFixed(2)} * aLit * uFocus) * growing;
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
varying vec3 vMood;

void main() {
  vec3 bright = mix(vMood, uTint, vAnger);
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
    uFreshKind: { value: number };
    uLeaveTarget: { value: number };
    uLeaveAge: { value: number };
    uTint: { value: THREE.Vector3 };
  };
  leaveStart: number | null;
  angerStart: number | null;
  // Only a new thorn or leaf grows during the tint; sadness just changes the colour.
  growFresh: boolean;
  focus: { value: number };
  focusTarget: number;
  lineStems: number[];
  nodeStems: number[];
};

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

function applyMoods(view: View, moods: Map<number, Color> | undefined) {
  const paint = (geometry: THREE.BufferGeometry, stems: number[]) => {
    const attribute = geometry.getAttribute("aMood") as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    const values = attribute.array as Float32Array;
    for (let i = 0; i < stems.length; i++) values.set(moods?.get(stems[i]) ?? BLUE, i * 3);
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
  const messages = stems.slice(0, MAX_BOXES);
  messages.forEach(({ to, text }, k) => {
    const left = to.x - to.width / 2;
    const top = to.y - to.height / 2;
    boxes[k].set(left, -(top + text.height), left + text.width, -top);
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

type BranchesProps = {
  stems: Stem[];
  camera: Camera;
  thornArrival: Arrival | null;
  leafArrival: Arrival | null;
  wiltArrival?: Arrival | null;
  leaveArrival?: Arrival | null;
  sprouts: Map<number, Sprout>;
  highlight: Set<number> | null;
  moods?: Map<number, Color>;
  bare?: boolean;
};

function Branches({ stems, camera, thornArrival, leafArrival, wiltArrival = null, leaveArrival = null, sprouts, highlight, moods, bare = false }: BranchesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const cameraRef = useRef(camera);
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
    const motion = { uSweep: { value: SWEEP } };
    const boxes = Array.from({ length: MAX_BOXES }, () => new THREE.Vector4());
    const boxCount = { value: 0 };
    const focus = { value: 0 };
    const underText = { uBoxes: { value: boxes }, uBoxCount: boxCount, uUnderText: { value: UNDER_TEXT } };
    const anger = {
      uTarget: { value: -1 },
      uAngry: { value: 0 },
      uAge: { value: 1000 },
      uFreshKind: { value: 0 },
      uLeaveTarget: { value: -1 },
      uLeaveAge: { value: 1000 },
      uTint: { value: new THREE.Vector3(...TINT.thorn) },
    };
    const lineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...underText,
        ...motion,
        ...anger,
        uFocus: focus,
        uTime: time,
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
      uniforms: { ...underText, ...motion, ...anger, uFocus: focus, uTime: time, uPixelRatio: { value: pixelRatio } },
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
      renderer, scene, camera: orthographic, lines, nodes, width: 1, height: 1, animated, boxes, boxCount, anger, angerStart: null, leaveStart: null, growFresh: false,
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
        focus.value += (view.focusTarget - focus.value) * (1 - Math.exp(-dt / FOCUS_FADE));
        if (view.angerStart !== null) {
          const age = time.value - view.angerStart;
          const over = age > ANGER.duration;
          anger.uAge.value = over || !view.growFresh ? 1000 : age;
          anger.uAngry.value = angerEnvelope(age);
          if (over) view.angerStart = null;
        }
        if (view.leaveStart !== null) {
          anger.uLeaveAge.value = time.value - view.leaveStart;
          if (anger.uLeaveAge.value > RETREAT_SECONDS) view.leaveStart = null;
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
    const births = new Map(stems.map((stem) => [stem.id, view.animated ? (sprouts.get(stem.id)?.birth ?? -1e6) : -1e6]));
    const geometry = buildGeometry(stems, births);
    view.lines.geometry = geometry.lines;
    view.nodes.geometry = geometry.points;
    view.lineStems = geometry.stemIds;
    view.nodeStems = geometry.nodeStems;
    applyLit(view, litRef.current);
    applyMoods(view, moods);
    view.boxCount.value = bare ? 0 : textBoxes(stems, view.boxes);
    if (!view.animated) draw(view, cameraRef.current);
  }, [stems, sprouts, moods, bare]);

  useEffect(() => {
    const view = viewRef.current;
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

  function tint(arrival: Arrival | null, kind: keyof typeof TINT) {
    const view = viewRef.current;
    if (!view || !view.animated || !arrival) return;
    view.angerStart = performance.now() / 1000;
    view.anger.uTarget.value = arrival.target;
    view.growFresh = kind === "thorn" || kind === "leaf";
    view.anger.uFreshKind.value = kind === "wilt" ? 0 : FRESH[kind];
    view.anger.uAge.value = view.growFresh ? 0 : 1000;
    view.anger.uTint.value.fromArray(TINT[kind]);
  }

  useEffect(() => tint(thornArrival, "thorn"), [thornArrival]);
  useEffect(() => tint(leafArrival, "leaf"), [leafArrival]);
  useEffect(() => tint(wiltArrival, "wilt"), [wiltArrival]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !view.animated || !leaveArrival) return;
    view.leaveStart = performance.now() / 1000;
    view.anger.uLeaveTarget.value = leaveArrival.target;
    view.anger.uLeaveAge.value = 0;
  }, [leaveArrival]);

  useEffect(() => {
    cameraRef.current = camera;
    const view = viewRef.current;
    if (view && !view.animated) draw(view, camera);
  }, [camera]);

  return <canvas className="branches" ref={canvasRef} aria-hidden />;
}

export default Branches;
