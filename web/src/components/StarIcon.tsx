import { useId } from "react";

// Five points, edges slightly bent inwards so it isn't a perfect star.
const STAR =
  "M0 -10 Q1.6 -5.2 2.6 -3.5 Q6 -3.4 9.5 -3.1 Q6.4 -0.4 4.1 1.4 Q5 4.8 5.9 8.1 " +
  "Q2.8 6.1 0 4.4 Q-2.8 6.1 -5.9 8.1 Q-5 4.8 -4.1 1.4 Q-6.4 -0.4 -9.5 -3.1 Q-6 -3.4 -2.6 -3.5 Q-1.6 -5.2 0 -10 Z";

// lit = the message is retained: glowing thread like the plant. Otherwise a plain line in the button's text colour.
function StarIcon({ lit }: { lit: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (!lit) {
    return (
      <svg className="star-icon plain" viewBox="-12 -12 24 24" aria-hidden>
        <path d={STAR} />
      </svg>
    );
  }

  return (
    <svg className="star-icon" viewBox="-12 -12 24 24" aria-hidden>
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
        <path className="reaction-tube" d={STAR} strokeWidth={1.6} />
        <path className="reaction-core" d={STAR} strokeWidth={0.6} />
      </g>
    </svg>
  );
}

export default StarIcon;
