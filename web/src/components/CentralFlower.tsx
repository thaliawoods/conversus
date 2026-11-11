import { useEffect, useRef } from "react";

const STOPS = [
  [0x0a, 0x16, 0x70],
  [0x2f, 0x62, 0xff],
  [0xc4, 0xe6, 0xff],
];
const GRAIN_COUNT = 4500;
const PETALS = 5;

type Grain = {
  angle: number;
  k: number;
  size: number;
  alpha: number;
  fill: string;
  phase: number;
};

function grainColor(t: number) {
  const [from, to, k] = t < 0.3 ? [STOPS[0], STOPS[1], t / 0.3] : [STOPS[1], STOPS[2], (t - 0.3) / 0.7];
  const [red, green, blue] = from.map((value, i) => Math.round(value + (to[i] - value) * k));
  return `rgb(${red},${green},${blue})`;
}

function createGrains(dot: number) {
  const grains: Grain[] = [];
  for (let n = 0; n < GRAIN_COUNT; n++) {
    const angle = Math.random() * Math.PI * 2;
    const petal = Math.pow(Math.abs(Math.cos((PETALS / 2) * angle)), 1.1);
    const k = (0.12 + 0.88 * petal) * Math.sqrt(Math.random());
    grains.push({
      angle,
      k,
      size: dot * (0.7 + Math.random() * 0.6),
      alpha: 0.6 + 0.35 * Math.random(),
      fill: grainColor(Math.max(0, Math.min(1, Math.sqrt(k) + (Math.random() - 0.5) * 0.2))),
      phase: Math.random() * 100,
    });
  }
  return grains;
}

function CentralFlower() {
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
    const radius = size * 0.3;
    const grains = createGrains(Math.max(0.55 * ratio, size / 480) * 0.85);
    let frameId = 0;

    function draw(now: number) {
      if (!canvas || !context || !layerContext) return;
      const time = reduceMotion ? 0 : now;

      layerContext.clearRect(0, 0, size, size);
      for (const grain of grains) {
        const breathe = 1 + 0.07 * Math.sin(time * 0.0012 + grain.angle * 2.5);
        const r = grain.k * radius * breathe;
        const x = center + Math.cos(grain.angle) * r + Math.sin(time * 0.0011 + grain.phase) * radius * 0.03;
        const y = center + Math.sin(grain.angle) * r + Math.cos(time * 0.0009 + grain.phase * 1.3) * radius * 0.03;
        layerContext.globalAlpha = grain.alpha * (0.8 + 0.2 * Math.sin(time * 0.002 + grain.phase));
        layerContext.fillStyle = grain.fill;
        layerContext.beginPath();
        layerContext.arc(x, y, grain.size, 0, Math.PI * 2);
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
      frameId = requestAnimationFrame(draw);
    }
    frameId = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(frameId);
  }, []);

  return <canvas className="central-flower" ref={canvasRef} role="img" aria-label="Sujet du débat" />;
}

export default CentralFlower;
