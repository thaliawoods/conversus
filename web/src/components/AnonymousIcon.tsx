import { useId } from "react";

// Hat, brim and two eyes (Thalia's drawing, without the circle).
const PARTS = [
  { d: "M-6.6 -2.4 C-6.9 -7 -6.1 -10 -4 -10 C-2.1 -10 -1.3 -8.5 0 -8.5 C1.3 -8.5 2.1 -10 4 -10 C6.1 -10 6.9 -7 6.6 -2.4", width: 1.6 },
  { d: "M-11 -2 L11 -2", width: 1.9 },
  { d: "M-9.4 5 C-9.4 2.8 -1.8 2.8 -1.8 5 C-1.8 7.2 -9.4 7.2 -9.4 5 Z", width: 1.4 },
  { d: "M1.8 5 C1.8 2.8 9.4 2.8 9.4 5 C9.4 7.2 1.8 7.2 1.8 5 Z", width: 1.4 },
];
const PUPILS = [{ x: -7, y: 5 }, { x: 4.2, y: 5 }];

// lit = anonymous mode on: glowing thread like the plant. Otherwise a plain line in the button's text colour.
function AnonymousIcon({ lit }: { lit: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (!lit) {
    return (
      <svg className="anonymous-icon plain" viewBox="-12 -12 24 24">
        {PARTS.map((part) => (
          <path key={part.d} d={part.d} />
        ))}
        {PUPILS.map((pupil) => (
          <circle key={pupil.x} cx={pupil.x} cy={pupil.y} r={1.1} />
        ))}
      </svg>
    );
  }

  return (
    <svg className="anonymous-icon" viewBox="-12 -12 24 24">
      <defs>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.38  0 0 0 0 1  0 0 0 1.4 0" result="blue" />
          <feMerge>
            <feMergeNode in="blue" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-glow)`}>
        {PARTS.map((part) => (
          <g key={part.d}>
            <path className="reaction-tube" d={part.d} strokeWidth={part.width} />
            <path className="reaction-core" d={part.d} strokeWidth={part.width * 0.38} />
          </g>
        ))}
        {PUPILS.map((pupil) => (
          <g key={pupil.x}>
            <circle className="reaction-halo" cx={pupil.x} cy={pupil.y} r={1.9} />
            <circle className="reaction-node" cx={pupil.x} cy={pupil.y} r={1.1} />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default AnonymousIcon;
