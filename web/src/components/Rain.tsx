import { useEffect, useRef } from "react";
import { pointOnStem } from "../layout";
import type { Stem } from "./Branches";

export type Shower = { key: number; target: number };
type Camera = { x: number; y: number; zoom: number };
type Drop = { x: number; y: number; speed: number; length: number; alpha: number };
type Tear = { x: number; y: number; hang: number; speed: number; life: number };

const DURATION = 2;
const FADE_IN = 0.4;
const FADE_OUT = 0.8;
const DROPS_PER_PIXEL = 70 / (400 * 500);
const TEAR_EVERY = 0.12;
const GRAVITY = 500;
const VEIL = 0.3;

const random = (min: number, max: number) => min + Math.random() * (max - min);

function envelope(age: number) {
  if (age < 0 || age > DURATION) return 0;
  return Math.min(1, age / FADE_IN) * Math.min(1, (DURATION - age) / FADE_OUT);
}

function Rain({ showers, stems, camera }: { showers: Shower[]; stems: Stem[]; camera: Camera }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starts = useRef(new Map<number, { start: number; target: number }>());
  const latest = useRef({ stems, camera });
  const wake = useRef<() => void>(() => {});
  latest.current = { stems, camera };

  useEffect(() => {
    const now = performance.now() / 1000;
    for (const shower of showers) {
      if (!starts.current.has(shower.key)) starts.current.set(shower.key, { start: now, target: shower.target });
    }
    wake.current();
  }, [showers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drops: Drop[] = [];
    let tears: Tear[] = [];
    let spawn = 0;
    let frame = 0;
    let last = 0;

    function resize() {
      const ratio = devicePixelRatio || 1;
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      if (canvas!.width !== Math.round(width * ratio) || canvas!.height !== Math.round(height * ratio)) {
        canvas!.width = Math.round(width * ratio);
        canvas!.height = Math.round(height * ratio);
        const count = Math.round(width * height * DROPS_PER_PIXEL);
        drops = Array.from({ length: count }, () => ({
          x: random(0, width),
          y: random(-height, height),
          speed: random(140, 260),
          length: Math.floor(random(3, 7)),
          alpha: random(0.25, 0.6),
        }));
      }
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      return { width, height };
    }

    function draw(time: number) {
      const now = time / 1000;
      const dt = Math.min(0.05, last ? now - last : 0);
      last = now;
      const { width, height } = resize();
      context!.clearRect(0, 0, width, height);

      // Strongest shower right now, and the stems that are crying.
      let strength = 0;
      const crying: number[] = [];
      for (const [key, shower] of starts.current) {
        const age = now - shower.start;
        if (age > DURATION) {
          starts.current.delete(key);
          continue;
        }
        strength = Math.max(strength, envelope(age));
        if (age < DURATION - FADE_OUT) crying.push(shower.target);
      }

      if (starts.current.size === 0 && tears.length === 0) {
        frame = 0;
        last = 0;
        return;
      }

      context!.fillStyle = `rgba(30, 40, 80, ${(strength * VEIL).toFixed(3)})`;
      context!.fillRect(0, 0, width, height);

      if (!reduceMotion) {
        for (const drop of drops) {
          drop.y += drop.speed * dt;
          if (drop.y > height + 20) {
            drop.y = random(-40, 0);
            drop.x = random(0, width);
          }
          for (let i = 0; i < drop.length; i++) {
            context!.fillStyle = `rgba(196, 230, 255, ${(drop.alpha * strength * (1 - i / drop.length)).toFixed(3)})`;
            context!.fillRect(drop.x, drop.y - i * 3, 1.3, 1.3);
          }
        }

        // Tears live in board coordinates so they follow the camera.
        const { stems, camera } = latest.current;
        spawn += dt;
        if (crying.length > 0 && spawn > TEAR_EVERY) {
          spawn = 0;
          for (const target of crying) {
            const stem = stems.find((item) => item.id === target);
            if (!stem) continue;
            const point = pointOnStem(stem.from, stem.to, random(0.15, 0.95), stem.sag);
            tears.push({ x: point.x, y: point.y, hang: random(0.3, 0.9), speed: 0, life: 0 });
          }
        }

        const toScreen = (x: number, y: number) => ({
          x: width / 2 + camera.x + x * camera.zoom,
          y: height / 2 + camera.y + y * camera.zoom,
        });
        tears = tears.filter((tear) => toScreen(tear.x, tear.y).y < height + 20 && tear.life < 4);
        context!.shadowColor = "#2f62ff";
        context!.shadowBlur = 10;
        for (const tear of tears) {
          tear.life += dt;
          const falling = tear.life > tear.hang;
          if (falling) {
            tear.speed += GRAVITY * dt;
            tear.y += (tear.speed * dt) / camera.zoom;
          }
          const grow = Math.min(1, tear.life / tear.hang);
          const stretch = falling ? Math.min(14, 2 + tear.speed * 0.04) : 0;
          const radius = 1.2 + grow * 1.4;
          const { x, y } = toScreen(tear.x, tear.y);
          const gradient = context!.createLinearGradient(x, y - stretch, x, y + radius);
          gradient.addColorStop(0, "rgba(196, 230, 255, 0)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 1)");
          context!.fillStyle = gradient;
          context!.beginPath();
          context!.ellipse(x, y - stretch / 2, radius, radius + stretch / 2, 0, 0, Math.PI * 2);
          context!.fill();
        }
        context!.shadowBlur = 0;
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

  return <canvas className="rain" ref={canvasRef} aria-hidden />;
}

export default Rain;
