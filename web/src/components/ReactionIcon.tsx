import { useId } from "react";
import type { ReactionValue } from "../types";

export const REACTIONS: { value: ReactionValue; label: string }[] = [
  { value: "leaf", label: "Feuille" },
  { value: "thorn", label: "Épine" },
  { value: "wilt", label: "Faner" },
];

// Same sequence of numbers for the same seed: shapes are irregular but identical on every render.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

type Leaflet = { x: number; y: number; angle: number; whole: string; half: string; rib: string; veins: string; dim: boolean };
type Horn = { x: number; y: number; angle: number; outline: string; core: string };
type Tube = { d: string; width: number };
type Dot = { x: number; y: number; r: number };
type Drawing = { tubes: Tube[]; leaflets: Leaflet[]; horns: Horn[]; nodes: Dot[] };

// Bramble leaflet: base at (0, 0), tip upwards, toothed edge, one side wider than the other.
function leaflet(x: number, y: number, angle: number, length: number, width: number, seed: number, hook: number, dim = false): Leaflet {
  const next = random(seed);
  const steps = 16;
  const lopsided = 0.78 + next() * 0.12;
  const right: [number, number][] = [];
  const left: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const half = width * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
    const center = hook * t * t * t;
    const top = -length * t;
    right.push([center + half * (i % 2 ? 0.8 + next() * 0.1 : 1), top]);
    left.push([center - half * lopsided * (i % 2 ? 0.78 + next() * 0.12 : 1), top]);
  }
  const line = (points: [number, number][]) => points.map(([px, py]) => `${px.toFixed(2)} ${py.toFixed(2)}`).join(" L");
  const bend = `${(hook * 0.3).toFixed(2)} ${(-length * 0.5).toFixed(2)}`;
  const tip = `${hook} ${-length}`;
  let veins = "";
  for (let k = 1; k <= 3; k++) {
    if (next() < 0.2) continue;
    const t = k / 4.4;
    const cx = hook * t * t * t;
    const cy = -length * t;
    const reach = width * (0.55 + next() * 0.3);
    veins += `M${cx} ${cy} L${cx + reach} ${cy - length * 0.13} M${cx} ${cy + 0.4} L${cx - reach * lopsided} ${cy - length * 0.1} `;
  }
  return {
    x, y, angle, dim, veins,
    whole: `M0 0 L${line(right)} L${tip} L${line(left.slice().reverse())} Z`,
    half: `M0 0 L${line(right)} L${tip} Q${bend} 0 0 Z`,
    rib: `M0 0 Q${bend} ${tip}`,
  };
}

// Curved horn: base on the stem at (0, 0), tip upwards, bent towards +x.
function horn(x: number, y: number, angle: number, length: number, base: number): Horn {
  const b = base / 2;
  const tipX = length * 0.45;
  const tipY = -length;
  return {
    x, y, angle,
    outline: `M${-b} 0 Q${-b * 0.4} ${tipY * 0.55} ${tipX} ${tipY} Q${b * 0.9} ${tipY * 0.35} ${b} 0 Z`,
    core: `M0 0 Q${b * 0.1} ${tipY * 0.5} ${tipX * 0.9} ${tipY * 0.95}`,
  };
}

// Option C of the preview: a small piece of the plant per reaction.
const DRAWINGS: Record<ReactionValue, Drawing> = {
  leaf: {
    tubes: [{ d: "M-11 11 Q-6 5 -1 0", width: 1.5 }],
    leaflets: [
      leaflet(-1, 0, 40, 11, 3.8, 21, 2.75),
      leaflet(-4.5, 3.8, -18, 8, 2.8, 22, 1),
      leaflet(-4.5, 3.8, 95, 8, 2.8, 23, -1),
    ],
    horns: [],
    nodes: [{ x: -4.5, y: 3.8, r: 0.6 }],
  },
  thorn: {
    tubes: [{ d: "M-12 7 Q0 2 12 -6", width: 1.6 }],
    leaflets: [],
    horns: [horn(-8, 5, -25, 6, 3.4), horn(-3, 3.2, 155, 6, 3.4), horn(2, 1.2, -30, 6, 3.2), horn(7, -2.2, 150, 5.5, 3)],
    nodes: [],
  },
  wilt: {
    tubes: [{ d: "M-11 -4 Q-2 -12 5 -5 Q8 -2 8 4", width: 1.5 }],
    leaflets: [leaflet(8, 4, 175, 8, 3, 31, 1.5, true), leaflet(1, -7.3, 160, 7, 2.6, 32, 2, true)],
    horns: [],
    nodes: [{ x: 1, y: -7.3, r: 0.6 }],
  },
};

function ReactionIcon({ value }: { value: ReactionValue }) {
  // One id per icon: the hidden "who reacted" bubble (display: none) must not hold the only copy of the gradients.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const drawing = DRAWINGS[value];

  return (
    <svg className="reaction-icon" viewBox="-12 -12 24 24">
      <defs>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.38  0 0 0 0 1  0 0 0 1.4 0" result="blue" />
          <feMerge>
            <feMergeNode in="blue" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7fb0ff" />
          <stop offset="1" stopColor="#f2f8ff" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#2f62ff" />
          <stop offset="1" stopColor="#0f2a9a" />
        </linearGradient>
        <linearGradient id={`${id}-dim`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#4c78d8" />
          <stop offset="1" stopColor="#16246e" />
        </linearGradient>
        <linearGradient id={`${id}-horn`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2f62ff" />
          <stop offset="0.55" stopColor="#cfe4ff" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>

      <g filter={`url(#${id}-glow)`}>
        {drawing.tubes.map((tube) => (
          <g key={tube.d}>
            <path className="reaction-tube" d={tube.d} strokeWidth={tube.width} />
            <path className="reaction-core" d={tube.d} strokeWidth={tube.width * 0.38} />
          </g>
        ))}

        {drawing.leaflets.map((leaf) => (
          <g key={leaf.whole} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle})`} className={leaf.dim ? "reaction-dim" : undefined}>
            <path className="reaction-leaf" d={leaf.whole} fill={`url(#${id}-${leaf.dim ? "dim" : "shade"})`} />
            <path d={leaf.half} fill={`url(#${id}-${leaf.dim ? "dim" : "lit"})`} opacity={leaf.dim ? 0.35 : 0.9} />
            <path className="reaction-veins" d={leaf.veins} />
            <path className="reaction-rib" d={leaf.rib} />
          </g>
        ))}

        {drawing.horns.map((thorn) => (
          <g key={thorn.outline + thorn.x} transform={`translate(${thorn.x} ${thorn.y}) rotate(${thorn.angle})`}>
            <path className="reaction-horn" d={thorn.outline} fill={`url(#${id}-horn)`} />
            <path className="reaction-horn-core" d={thorn.core} />
          </g>
        ))}

        {drawing.nodes.map((node) => (
          <g key={`${node.x} ${node.y}`}>
            <circle className="reaction-halo" cx={node.x} cy={node.y} r={node.r * 1.8} />
            <circle className="reaction-node" cx={node.x} cy={node.y} r={node.r} />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default ReactionIcon;
