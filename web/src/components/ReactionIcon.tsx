import type { ReactionValue } from "../pages/Chat";

type ReactionShapeProps = { value: ReactionValue; onStem?: boolean };

export function ReactionShape({ value, onStem = false }: ReactionShapeProps) {
  if (value === "leaf") {
    return (
      <g transform={onStem ? "translate(8 -8)" : undefined}>
        <path className="reaction-fill" d="M-8 8 C-8 -2 -2 -8 8 -8 C8 2 2 8 -8 8 Z" />
        <path className="reaction-vein" d="M-8 8 L3 -3" />
      </g>
    );
  }
  if (value === "thorn") {
    return (
      <>
        <path className="reaction-line" d="M-10 2 Q0 -2 10 2" />
        <path className="reaction-solid" d="M-6 1 L-3.5 -8 L-1 0 Z" />
        <path className="reaction-solid" d="M1 0 L4 9 L6 0.6 Z" />
      </>
    );
  }
  if (value === "wilt") {
    return (
      <>
        <path className="reaction-line" d="M-10 -5 C-1 -10 7 -6 7 3" />
        <path className="reaction-fill" d="M7 3 C4 6 4 9 7 10 C10 9 10 6 7 3 Z" />
      </>
    );
  }
  return null;
}

function ReactionIcon({ value }: { value: ReactionValue }) {
  return (
    <svg className="reaction-icon" viewBox="-12 -12 24 24">
      <ReactionShape value={value} />
    </svg>
  );
}

export default ReactionIcon;
