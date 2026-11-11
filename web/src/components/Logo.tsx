import { useEffect, useRef } from "react";

const GRAIN_COUNT = 2200;
const PETALS = 6;
const RADIUS = 58;
const WORLD = 72;
const MAP_SIZE = 432;
const PETAL = { width: 19, round: 0.6, vary: 0.12, wobble: 0.08 };
const SHADOW = 0.6;
const NIGHT = [[0x0a, 0x16, 0x70], [0x1a, 0x2a, 0x9e]];
const BLUE = [[0x2a, 0x4d, 0xe0], [0x2f, 0x62, 0xff], [0x4a, 0x6c, 0xff]];
const LIGHT = [[0x8f, 0xa8, 0xff], [0xc4, 0xe6, 0xff]];

type Grain = {
  angle: number;
  k: number;
  ox: number;
  oy: number;
  size: number;
  alpha: number;
  fill: string;
  phase: number;
  spread: number;
};

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
  let color;
  if (Math.random() < 0.03 + 0.75 * tip) {
    color = mix(LIGHT[0], LIGHT[1], Math.random() * (0.3 + 0.7 * tip));
  } else {
    const side = edge * 0.8 * (1 - smooth(0.7, 0.95, k));
    const dark = Math.min(1, 1 - smooth(0.15, 0.75, k) + side + (overlap ? 0.6 : 0)) * SHADOW;
    const night = mix(NIGHT[0], NIGHT[1], Math.random());
    const blue = BLUE[Math.floor(Math.random() * BLUE.length)];
    color = mix(blue, night, Math.min(1, dark * (0.75 + 0.25 * Math.random())));
  }
  return `rgb(${color.map(Math.round).join(",")})`;
}

function createGrains(dot: number) {
  const { inside, gap, rim, count } = createMaps();
  const grains: Grain[] = [];
  const toMap = MAP_SIZE / (2 * WORLD);
  for (let tries = 0; grains.length < GRAIN_COUNT && tries < GRAIN_COUNT * 30; tries++) {
    const x = (Math.random() * 2 - 1) * WORLD;
    const y = (Math.random() * 2 - 1) * WORLD;
    const p = (Math.floor(y * toMap + MAP_SIZE / 2) * MAP_SIZE + Math.floor(x * toMap + MAP_SIZE / 2)) * 4;
    if (inside[p + 3] < 128 || (gap[p + 3] > 90 && Math.random() < 0.95)) continue;
    const edge = rim[p + 3] / 255;
    if (!edge && Math.random() < 0.3) continue;
    const k = Math.min(1, Math.hypot(x, y) / RADIUS + edge * 0.3);
    grains.push({
      angle: Math.atan2(y, x),
      k: (Math.hypot(x, y) / RADIUS) * 0.93,
      ox: 0,
      oy: 0,
      size: dot * (0.7 + Math.random() * 0.6),
      alpha: 0.6 + 0.35 * Math.random(),
      fill: grainColor(k, edge, count[p] > 90),
      phase: Math.random() * 100,
      spread: 0.5 + Math.random(),
    });
  }
  return grains;
}

type LogoProps = { still?: boolean; className?: string };

function Logo({ still = false, className = "login-brand" }: LogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const layer = document.createElement("canvas");
    const layerContext = layer.getContext("2d");
    if (!canvas || !context || !layerContext) return;

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ratio = window.devicePixelRatio || 1;
    const size = Math.round(canvas.clientWidth * ratio);
    if (size === 0) return;
    canvas.width = canvas.height = layer.width = layer.height = size;
    const center = size / 2;
    const radius = size * 0.185;
    const grains = createGrains(Math.max(0.55 * ratio, size / 480));
    const pointer = { x: -1e6, y: -1e6 };
    let bloom = 0;
    let frameId = 0;

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    if (!still) window.addEventListener("pointermove", handlePointerMove);

    function draw(now: number) {
      if (!canvas || !context || !layerContext) return;
      const time = still || reduceMotion ? 0 : now;
      const rect = canvas.getBoundingClientRect();
      const px = (pointer.x - rect.left) * (size / rect.width);
      const py = (pointer.y - rect.top) * (size / rect.height);
      const near = Math.hypot(px - center, py - center) < radius * 1.4;
      bloom += ((near ? 1 : 0) - bloom) * 0.05;
      const reach = radius * (0.7 + 0.5 * bloom);

      layerContext.clearRect(0, 0, size, size);
      for (const grain of grains) {
        const breathe = 1 + 0.07 * Math.sin(time * 0.0012 + grain.angle * 2.5);
        const r = grain.k * radius * breathe * (1 + bloom * 0.35 * grain.spread);
        const homeX = center + Math.cos(grain.angle) * r + Math.sin(time * 0.0011 + grain.phase) * radius * 0.03;
        const homeY = center + Math.sin(grain.angle) * r + Math.cos(time * 0.0009 + grain.phase * 1.3) * radius * 0.03;
        const dx = homeX - px;
        const dy = homeY - py;
        const distance = Math.hypot(dx, dy) || 1;
        const push = distance < reach ? Math.pow(1 - distance / reach, 2) * reach * 0.9 : 0;
        grain.ox += ((dx / distance) * push - grain.ox) * 0.08;
        grain.oy += ((dy / distance) * push - grain.oy) * 0.08;
        layerContext.globalAlpha = grain.alpha * (0.8 + 0.2 * Math.sin(time * 0.002 + grain.phase));
        layerContext.fillStyle = grain.fill;
        layerContext.beginPath();
        layerContext.arc(homeX + grain.ox, homeY + grain.oy, grain.size, 0, Math.PI * 2);
        layerContext.fill();
      }

      context.clearRect(0, 0, size, size);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.filter = "none";
      context.drawImage(layer, 0, 0);
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 0.25;
      context.filter = `blur(${size / 100}px)`;
      context.drawImage(layer, 0, 0);
      if (!still) frameId = requestAnimationFrame(draw);
    }
    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [still]);

  return (
    <p className={className} role="img" aria-label="ConVersus">
      C
      <span className="logo-flower">
        <canvas ref={canvasRef} />
      </span>
      NVERSUS
    </p>
  );
}

export default Logo;
