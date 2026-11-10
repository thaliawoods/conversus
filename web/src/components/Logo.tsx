import { useEffect, useRef } from "react";

const STOPS = [
  [0x0a, 0x16, 0x70],
  [0x2f, 0x62, 0xff],
  [0xc4, 0xe6, 0xff],
];
const GRAIN_COUNT = 2200;
const PETALS = 5;

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
      ox: 0,
      oy: 0,
      size: dot * (0.7 + Math.random() * 0.6),
      alpha: 0.6 + 0.35 * Math.random(),
      fill: grainColor(Math.max(0, Math.min(1, Math.sqrt(k) + (Math.random() - 0.5) * 0.2))),
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
