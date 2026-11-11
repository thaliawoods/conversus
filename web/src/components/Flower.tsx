import { useEffect, useRef } from "react";

const PETAL_PATH =
  "M122.633 33.0537C122.633 53.5627 91.0815 78.4996 85.4982 78.4996C78.0972 78.4996 48.3633 53.5627 48.3633 33.0537C48.3633 12.5446 66.5412 6.4898 85.4982 9.03281C99.7809 6.95637 122.633 12.5446 122.633 33.0537Z";
const VIEW = 171;
const MID = VIEW / 2;
const MAP_SIZE = 256;
const SHADES = 16;
const STOPS: [number, number[]][] = [
  [0, [0x2f, 0x62, 0xff]],
  [0.45, [0x6f, 0x9c, 0xff]],
  [0.75, [0xc4, 0xe6, 0xff]],
  [1, [0xf4, 0xfa, 0xff]],
];

type Grain = { x: number; y: number; phase: number; alpha: number; size: number };
type Shade = { fill: string; grains: Grain[] };
type Maps = { shape: Uint8ClampedArray; gap: Uint8ClampedArray; rim: Uint8ClampedArray };

let maps: Maps | null = null;

function turn(context: CanvasRenderingContext2D, petal: number) {
  context.translate(MID, MID);
  context.rotate((petal * Math.PI) / 3);
  context.translate(-MID, -MID);
}

function mapContext() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = MAP_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.scale(MAP_SIZE / VIEW, MAP_SIZE / VIEW);
  return context;
}

function shapeMap(petal: Path2D) {
  const context = mapContext();
  for (let i = 0; i < 6; i++) {
    context.save();
    turn(context, i);
    const gradient = context.createLinearGradient(MID, 8.5, MID, 78.5);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(1, "#000");
    context.fillStyle = gradient;
    context.fill(petal);
    context.restore();
  }
  return context.getImageData(0, 0, MAP_SIZE, MAP_SIZE).data;
}

function outlineMap(petal: Path2D, width: number) {
  const context = mapContext();
  context.lineWidth = width;
  context.strokeStyle = "#fff";
  for (let i = 0; i < 6; i++) {
    context.save();
    turn(context, i);
    context.globalCompositeOperation = "destination-out";
    context.fill(petal);
    context.globalCompositeOperation = "source-over";
    context.stroke(petal);
    context.restore();
  }
  return context.getImageData(0, 0, MAP_SIZE, MAP_SIZE).data;
}

function getMaps() {
  if (!maps) {
    const petal = new Path2D(PETAL_PATH);
    maps = { shape: shapeMap(petal), gap: outlineMap(petal, 2.6), rim: outlineMap(petal, 14) };
  }
  return maps;
}

function shadeColor(k: number) {
  for (let s = 1; s < STOPS.length; s++) {
    const [k1, to] = STOPS[s];
    if (k <= k1) {
      const [k0, from] = STOPS[s - 1];
      const t = (k - k0) / (k1 - k0);
      const [red, green, blue] = from.map((value, i) => Math.round(value + (to[i] - value) * t));
      return `rgb(${red},${green},${blue})`;
    }
  }
  return "rgb(244,250,255)";
}

function createGrains(count: number): Shade[] {
  const { shape, gap, rim } = getMaps();
  const shades: Shade[] = Array.from({ length: SHADES }, (_, s) => ({
    fill: shadeColor((s + 0.5) / SHADES),
    grains: [],
  }));
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 40; tries++) {
    const mx = Math.random() * MAP_SIZE;
    const my = Math.random() * MAP_SIZE;
    const p = (Math.floor(my) * MAP_SIZE + Math.floor(mx)) * 4;
    if (shape[p + 3] < 128 || gap[p + 3] > 90) continue;
    const k = Math.min(1, Math.pow(shape[p] / 255, 1.6) + (rim[p + 3] / 255) * 0.45);
    if (Math.random() > 0.2 + 0.8 * Math.pow(k, 1.1)) continue;
    const shade = Math.max(0, Math.min(0.999, k + (Math.random() - 0.5) * 0.08));
    shades[Math.floor(shade * SHADES)].grains.push({
      x: (mx / MAP_SIZE) * VIEW,
      y: (my / MAP_SIZE) * VIEW,
      phase: Math.random() * 100,
      alpha: 0.5 + 0.45 * Math.random() * (0.4 + 0.6 * k),
      size: 0.7 + Math.random() * 0.6,
    });
    placed++;
  }
  return shades;
}

function traceStar(context: CanvasRenderingContext2D, radius: number) {
  context.beginPath();
  for (let i = 0; i < 12; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 6;
    const r = i % 2 ? radius * 0.5 : radius;
    context.lineTo(MID + Math.cos(angle) * r, MID + Math.sin(angle) * r);
  }
  context.closePath();
}

function Flower({ className = "flower" }: { className?: string }) {
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
    const scale = (size / VIEW) * 0.92;
    const offset = size * 0.04;
    const shades = createGrains(Math.round(Math.min(14000, Math.max(700, size * size * 0.11))));
    const dot = Math.max(0.55 * ratio, size / 380);
    let frameId = 0;

    function draw(now: number) {
      if (!context || !layerContext) return;
      const time = reduceMotion ? 0 : now;
      const breathe = 1 + 0.025 * Math.sin(time * 0.0012);

      layerContext.setTransform(1, 0, 0, 1, 0, 0);
      layerContext.clearRect(0, 0, size, size);
      layerContext.translate(size / 2, size / 2);
      layerContext.scale(breathe, breathe);
      layerContext.translate(-size / 2 + offset, -size / 2 + offset);

      for (const shade of shades) {
        layerContext.fillStyle = shade.fill;
        for (const grain of shade.grains) {
          const x = grain.x + Math.sin(time * 0.0011 + grain.phase) * 0.8;
          const y = grain.y + Math.cos(time * 0.0009 + grain.phase * 1.3) * 0.8;
          const side = dot * grain.size;
          layerContext.globalAlpha = grain.alpha * (0.8 + 0.2 * Math.sin(time * 0.002 + grain.phase));
          layerContext.fillRect(x * scale - side / 2, y * scale - side / 2, side, side);
        }
      }

      layerContext.globalAlpha = 1;
      layerContext.scale(scale, scale);
      layerContext.shadowColor = "#c4e6ff";
      layerContext.shadowBlur = Math.max(2, size * 0.02);
      layerContext.fillStyle = "#f4faff";
      traceStar(layerContext, 9);
      layerContext.fill();
      layerContext.shadowBlur = 0;

      context.clearRect(0, 0, size, size);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.filter = "none";
      context.drawImage(layer, 0, 0);
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 0.35;
      context.filter = `blur(${Math.max(1, size / 70)}px)`;
      context.drawImage(layer, 0, 0);
      if (!reduceMotion) frameId = requestAnimationFrame(draw);
    }
    frameId = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(frameId);
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

export default Flower;
