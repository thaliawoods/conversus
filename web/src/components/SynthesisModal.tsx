import { useLayoutEffect, useRef, useState } from "react";
import Branches, { type Color, type Stem } from "./Branches";

const FLOWER_ROOM = 150;
const PLANT_MARGIN = 0.95;
const MAX_ZOOM = 1.6;
const NO_SPROUTS = new Map();

type SynthesisModalProps = {
  stems: Stem[];
  moods: Map<number, Color>;
  retainedCount: number;
  text: string | null;
  error: string;
  sharing: boolean;
  onCancel: () => void;
  onShare: () => void;
  // A synthesis already shared: no share button.
  readOnly?: boolean;
  // When it was shared, e.g. "Aujourd'hui à 15:40".
  sharedAt?: string;
  // The ConVersus question, shown instead of the scope when reading a shared synthesis.
  question?: string;
};

function fitPlant(stems: Stem[], width: number, height: number) {
  let left = -FLOWER_ROOM;
  let right = FLOWER_ROOM;
  let top = -FLOWER_ROOM;
  let bottom = FLOWER_ROOM;
  for (const { to } of stems) {
    left = Math.min(left, to.x - to.width / 2);
    right = Math.max(right, to.x + to.width / 2);
    top = Math.min(top, to.y - to.height / 2);
    bottom = Math.max(bottom, to.y + to.height / 2);
  }
  const zoom = Math.min(MAX_ZOOM, (width / (right - left)) * PLANT_MARGIN, (height / (bottom - top)) * PLANT_MARGIN);
  return { x: (-(left + right) / 2) * zoom, y: (-(top + bottom) / 2) * zoom, zoom };
}

function SynthesisModal({ stems, moods, retainedCount, text, error, sharing, onCancel, onShare, readOnly = false, sharedAt, question }: SynthesisModalProps) {
  const plantRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  // Only worth saying when the synthesis covers some messages, not the whole debate.
  const scope =
    retainedCount === 0 ? null : `Des ${retainedCount} ${retainedCount > 1 ? "messages retenus" : "message retenu"}`;

  useLayoutEffect(() => {
    const plant = plantRef.current;
    if (!plant) return;
    const observer = new ResizeObserver(() => setSize({ width: plant.clientWidth, height: plant.clientHeight }));
    observer.observe(plant);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="modal-backdrop" onKeyDown={(event) => event.key === "Escape" && onCancel()}>
      <div className="modal synthesis-modal" role="dialog" aria-modal aria-labelledby="synthesis-title">
        <div className="synthesis-plant" ref={plantRef} role="img" aria-label="La plante du débat, colorée par réaction">
          <Branches
            stems={stems}
            camera={fitPlant(stems, size.width, size.height)}
            thornArrival={null}
            leafArrival={null}
            sprouts={NO_SPROUTS}
            highlight={null}
            moods={moods}
            bare
          />
        </div>
        <div className="synthesis-side">
          <h2 id="synthesis-title">Synthesis</h2>
          {(question || scope || sharedAt) && (
            <p className="modal-label">
              {question ? <span className="synthesis-question">{question}</span> : scope}
              {sharedAt && ` · ${sharedAt}`}
            </p>
          )}
          {text === null && !error && <p className="synthesis-text waiting">La synthèse s'écrit…</p>}
          {text !== null && <p className="synthesis-text">{text}</p>}
          {error && <p className="synthesis-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onCancel} autoFocus>
              {readOnly ? "Fermer" : "Annuler"}
            </button>
            {!readOnly && (
              <button type="submit" disabled={text === null || sharing} onClick={onShare}>
                Partager dans le canal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SynthesisModal;
