import { useEffect, useRef, useState } from "react";
import { PetalFlower } from "./PetalIcons";
const debateLabel = (name: string) => name.replace(/#\d+$/, "");

export type DebateEntry = { name: string; id?: number };

type DebatePickerProps = {
  current: DebateEntry | null;
  debates: DebateEntry[];
  onSelect: (debate: DebateEntry) => void;
};

function DebatePicker({ current, debates, onSelect }: DebatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="debate-picker" ref={rootRef}>
      <button type="button" className="debate-picker-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{current ? debateLabel(current.name) : "Choisir un ConVersus"}</span>
        <svg viewBox="0 0 12 12" aria-hidden className={open ? "chevron up" : "chevron"}>
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open && (
        <ul className="debate-picker-list">
          {debates.map((debate) => (
            <li key={debate.name}>
              <button
                type="button"
                className={current?.name === debate.name ? "active" : undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(debate);
                }}
              >
                <span className="sidebar-mark">{current?.name === debate.name && <PetalFlower />}</span>
                <span className="debate-picker-name">{debateLabel(debate.name)}</span>
                {debate.id === undefined && <span className="debate-picker-new">rejoindre</span>}
              </button>
            </li>
          ))}
          {debates.length === 0 && <li className="debate-picker-empty">Aucun ConVersus ouvert pour l'instant</li>}
        </ul>
      )}
    </div>
  );
}

export default DebatePicker;
