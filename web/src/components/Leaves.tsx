import { useEffect, useRef } from "react";
import { pointOnStem } from "../layout";
import { LEAF, noise, type Arrival, type Stem } from "./Branches";

type Camera = { x: number; y: number; zoom: number };
type Spot = { x: number; y: number };
type Blade = { points: Spot[]; width: number; shape: number; veins: [Spot, Spot][] };
type Part = { kind: "petiole"; points: Spot[] } | { kind: "blade"; outline: Spot[]; midrib: Spot[]; veins: [Spot, Spot][] };
type Flyer = { x: number; y: number; angle: number; side: number; start: number; phase: number; parts: Part[] };

const COUNT = 7;
const LIFE = 2.8;
const FADE = 0.9;
// Violet of the "triste" reaction.
const VIOLET = { line: "#9b6bff", fill: "rgba(155, 107, 255, 0.3)", core: "#efe6ff" };
const FALL_GRAVITY = 110;

const fract = (value: number) => value - Math.floor(value);
const modulo = (value: number, base: number) => value - base * Math.floor(value / base);

function curve(origin: Spot, start: number, turn: number, length: number, wobble = 0, seed = 0) {
  const points = [origin];
  for (let step = 1; step <= 12; step++) {
    const angle = start - turn * (step / 12) + wobble * Math.sin(step * 1.3 + noise(seed, 8) * 6.28);
    const last = points[step - 1];
    points.push({ x: last.x + (Math.cos(angle) * length) / 12, y: last.y + (Math.sin(angle) * length) / 12 });
  }
  return points;
}

function angleAt(points: Spot[], index: number) {
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 1)];
  return Math.atan2(after.y - before.y, after.x - before.x);
}

function makeLeaflet(origin: Spot, angle: number, side: number, scale: number, seed: number): Blade {
  const length = LEAF.length * scale * (0.7 + noise(seed, 1) * 0.6);
  const width = LEAF.width * scale * (0.7 + noise(seed, 9) * 0.5);
  const turn = side * LEAF.turn * (0.5 + noise(seed, 10) * 2.5);
  const points = curve(origin, angle + (noise(seed, 11) - 0.5) * 0.6, turn, length, 0.12, seed);
  const hook = noise(seed, 12) > 0.4 ? side * (0.6 + noise(seed, 13) * 0.8) : 0;
  for (let step = 9; step <= 12; step++) {
    const bend = hook * ((step - 8) / 4) ** 2;
    const pivot = points[8];
    const dx = points[step].x - pivot.x;
    const dy = points[step].y - pivot.y;
    points[step] = { x: pivot.x + dx * Math.cos(bend) - dy * Math.sin(bend), y: pivot.y + dx * Math.sin(bend) + dy * Math.cos(bend) };
  }
  const lopsided = noise(seed, 7) * 0.35;
  const asym = lopsided - 0.175;
  const profile = (along: number) => Math.pow(Math.sin(Math.PI * Math.pow(along, 0.75)), 0.8);
  const veins: [Spot, Spot][] = [];
  [0.22, 0.38, 0.54, 0.7].forEach((spot, vein) => {
    for (const edge of [-1, 1]) {
      if (noise(seed, 30 + vein * 2 + edge) < 0.2) continue;
      const at = Math.min(0.8, spot + (noise(seed, 40 + vein * 2 + edge) - 0.5) * 0.08);
      const slant = 0.1 + noise(seed, 50 + vein * 2 + edge) * 0.08;
      const from = points[Math.round(at * 12)];
      const toIndex = Math.min(12, Math.round((at + slant) * 12));
      const normal = angleAt(points, toIndex) + Math.PI / 2;
      const sideWidth = (width / 2) * (1 + edge * asym * 2);
      const reach = sideWidth * profile(at + slant) * (0.6 + noise(seed, 60 + vein * 2 + edge) * 0.3) * edge;
      veins.push([from, { x: points[toIndex].x + Math.cos(normal) * reach, y: points[toIndex].y + Math.sin(normal) * reach }]);
    }
  });
  return { points, width, shape: 3.05 + lopsided, veins };
}

function outline({ points, width, shape, veins }: Blade): Part {
  const seed = shape * 37;
  const left: Spot[] = [];
  const right: Spot[] = [];
  const midrib: Spot[] = [];
  const samples = 44;
  for (let sample = 0; sample <= samples; sample++) {
    const along = sample / samples;
    const index = Math.min(11, Math.floor(along * 12));
    const between = along * 12 - index;
    const here = points[index];
    const next = points[index + 1];
    const center = { x: here.x + (next.x - here.x) * between, y: here.y + (next.y - here.y) * between };
    const angle = Math.atan2(next.y - here.y, next.x - here.x);
    const depth = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(along * 17 + seed));
    const teeth = along < 0.1 ? 1 : 1 - depth * Math.pow(fract(along * (8 + modulo(seed, 6)) + seed), 1.6);
    const half = (side: number) => {
      const lobes = 1 + 0.22 * Math.sin(along * (4 + modulo(seed, 3)) * Math.PI + seed + side * 1.7);
      const uneven = 1 + side * (shape - 3.225) * 2;
      return (0.05 + width * Math.pow(Math.sin(Math.PI * Math.pow(along, 0.75)), 0.8) * teeth * lobes * uneven) / 2;
    };
    left.push({ x: center.x - Math.sin(angle) * half(1), y: center.y + Math.cos(angle) * half(1) });
    right.push({ x: center.x + Math.sin(angle) * half(-1), y: center.y - Math.cos(angle) * half(-1) });
    midrib.push(center);
  }
  return { kind: "blade", outline: left.concat(right.reverse()), midrib, veins };
}

function makeLeaf(seed: number): Part[] {
  const pick = noise(seed, 3);
  const count = pick < 0.4 ? 1 : pick < 0.85 ? 3 : 5;
  const origin = { x: 0, y: 0 };
  if (count === 1) return [outline(makeLeaflet(origin, 0, 1, 1, seed))];
  const petiole = curve(origin, 0, 0.2, LEAF.petiole);
  const parts: Part[] = [{ kind: "petiole", points: petiole }];
  parts.push(outline(makeLeaflet(petiole[12], angleAt(petiole, 12), 1, 1, seed + 2)));
  const pairs = count === 5 ? [0.65, 0.3] : [0.55];
  pairs.forEach((at, pair) => {
    const index = Math.round(at * 12);
    for (const edge of [-1, 1]) {
      parts.push(outline(makeLeaflet(petiole[index], angleAt(petiole, index) + edge * 1.1, edge, 0.75 - pair * 0.15, seed + 3 + pair * 3 + edge)));
    }
  });
  return parts;
}

function trace(context: CanvasRenderingContext2D, points: Spot[]) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points) context.lineTo(point.x, point.y);
}

function drawLeaf(context: CanvasRenderingContext2D, parts: Part[]) {
  context.shadowColor = VIOLET.line;
  for (const part of parts) {
    if (part.kind === "petiole") {
      trace(context, part.points);
      context.strokeStyle = VIOLET.line;
      context.lineWidth = 1.2;
      context.shadowBlur = 5;
      context.stroke();
      continue;
    }
    trace(context, part.outline);
    context.closePath();
    context.fillStyle = VIOLET.fill;
    context.fill();
    context.strokeStyle = VIOLET.line;
    context.lineWidth = 1;
    context.shadowBlur = 6;
    context.stroke();
    context.shadowBlur = 0;
    context.lineWidth = 0.5;
    for (const [from, to] of part.veins) {
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
    trace(context, part.midrib);
    context.strokeStyle = VIOLET.core;
    context.lineWidth = 0.7;
    context.stroke();
  }
}

function drop(flyer: Flyer, age: number) {
  return {
    x: flyer.x + Math.sin(age * 2.4 + flyer.phase) * 10 * flyer.side,
    y: flyer.y + 0.5 * FALL_GRAVITY * age * age,
    spin: Math.sin(age * 1.8 + flyer.phase) * 0.6,
    flip: Math.cos(age * 2.2 + flyer.phase),
  };
}

// "triste" makes violet leaves fall off the branch: the branch itself never moves, only these leaves.
function Leaves({ wilt, stems, camera }: { wilt: Arrival | null; stems: Stem[]; camera: Camera }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flyers = useRef<Flyer[]>([]);
  const latest = useRef({ stems, camera });
  const wake = useRef<() => void>(() => {});
  latest.current = { stems, camera };

  function spawn(target: Arrival | null) {
    if (!target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stem = latest.current.stems.find((item) => item.id === target.target);
    if (!stem) return;
    const now = performance.now() / 1000;
    for (let index = 0; index < COUNT; index++) {
      const seed = target.key * 10 + index;
      const point = pointOnStem(stem.from, stem.to, 0.25 + (index / (COUNT - 1)) * 0.65, stem.sag);
      const side = index % 2 === 0 ? 1 : -1;
      flyers.current.push({
        x: point.x,
        y: point.y,
        angle: (point.angle * Math.PI) / 180 + side,
        side,
        start: now + 0.05 + noise(seed, 72) * 0.35,
        phase: noise(seed, 73) * 6.28,
        parts: makeLeaf(seed),
      });
    }
    wake.current();
  }

  useEffect(() => spawn(wilt), [wilt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;

    function draw(time: number) {
      const now = time / 1000;
      const ratio = devicePixelRatio || 1;
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      if (canvas!.width !== Math.round(width * ratio)) canvas!.width = Math.round(width * ratio);
      if (canvas!.height !== Math.round(height * ratio)) canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      context!.clearRect(0, 0, width, height);

      flyers.current = flyers.current.filter((flyer) => now - flyer.start < LIFE);
      if (flyers.current.length === 0) {
        frame = 0;
        return;
      }

      const { camera } = latest.current;
      for (const flyer of flyers.current) {
        const age = now - flyer.start;
        if (age < 0) continue;
        const move = drop(flyer, age);
        context!.save();
        context!.globalAlpha = Math.max(0, Math.min(1, (LIFE - age) / FADE));
        context!.translate(width / 2 + camera.x + move.x * camera.zoom, height / 2 + camera.y + move.y * camera.zoom);
        context!.rotate(flyer.angle + move.spin);
        context!.scale(camera.zoom, camera.zoom * flyer.side * move.flip);
        drawLeaf(context!, flyer.parts);
        context!.restore();
      }

      frame = requestAnimationFrame(draw);
    }

    wake.current = () => {
      if (frame === 0) frame = requestAnimationFrame(draw);
    };
    wake.current();

    return () => {
      cancelAnimationFrame(frame);
      wake.current = () => {};
    };
  }, []);

  return <canvas className="leaves" ref={canvasRef} aria-hidden />;
}

export default Leaves;
