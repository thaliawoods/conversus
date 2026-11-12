import { useRef } from "react";

type ResizeHandleProps = {
  closed: "left" | "right" | null;
  label: string;
  onDragStart: () => void;
  onDrag: (dx: number) => void;
  onReopen: () => void;
};

function ResizeHandle({ closed, label, onDragStart, onDrag, onReopen }: ResizeHandleProps) {
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
          <path d={closed === "left" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
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
    />
  );
}

export default ResizeHandle;
