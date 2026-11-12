import { useRef } from "react";

type ResizeHandleProps = {
  closed: "left" | "right" | null;
  label: string;
  onDragStart: () => void;
  onDrag: (dx: number) => void;
  onReopen: () => void;
  closeLeft?: { label: string; onClose: () => void };
  closeRight?: { label: string; onClose: () => void };
};

const CHEVRON_LEFT = "M15 6l-6 6 6 6";
const CHEVRON_RIGHT = "M9 6l6 6-6 6";

function ResizeHandle({ closed, label, onDragStart, onDrag, onReopen, closeLeft, closeRight }: ResizeHandleProps) {
  const startX = useRef<number | null>(null);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (closed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startX.current = event.clientX;
    onDragStart();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (startX.current === null) return;
    onDrag(event.clientX - startX.current);
  }

  function handlePointerUp() {
    startX.current = null;
  }

  if (closed) {
    return (
      <button type="button" className={`resize-handle closed ${closed}`} aria-label={label} data-tip={label} onClick={onReopen}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={closed === "left" ? CHEVRON_RIGHT : CHEVRON_LEFT} />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {closeLeft && (
        <button type="button" className="handle-close left" aria-label={closeLeft.label}
          onPointerDown={(event) => event.stopPropagation()} onClick={closeLeft.onClose}>
          <svg viewBox="0 0 24 24" aria-hidden><path d={CHEVRON_LEFT} /></svg>
        </button>
      )}
      {closeRight && (
        <button type="button" className="handle-close right" aria-label={closeRight.label}
          onPointerDown={(event) => event.stopPropagation()} onClick={closeRight.onClose}>
          <svg viewBox="0 0 24 24" aria-hidden><path d={CHEVRON_RIGHT} /></svg>
        </button>
      )}
    </div>
  );
}

export default ResizeHandle;
