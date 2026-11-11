// Preview of a synthesis: seen first, then shared in the channel or dropped.
type SynthesisModalProps = {
  retainedCount: number;
  text: string | null;
  error: string;
  sharing: boolean;
  onCancel: () => void;
  onShare: () => void;
};

function SynthesisModal({ retainedCount, text, error, sharing, onCancel, onShare }: SynthesisModalProps) {
  const scope =
    retainedCount === 0
      ? "De tout le débat"
      : `Des ${retainedCount} ${retainedCount > 1 ? "messages retenus" : "message retenu"}`;

  return (
    <div className="modal-backdrop" onKeyDown={(event) => event.key === "Escape" && onCancel()}>
      <div className="modal synthesis-modal" role="dialog" aria-modal aria-labelledby="synthesis-title">
        <h2 id="synthesis-title">Synthèse</h2>
        <p className="modal-label">{scope}</p>
        {text === null && !error && <p className="synthesis-text waiting">La synthèse s'écrit…</p>}
        {text !== null && <p className="synthesis-text">{text}</p>}
        {error && <p className="synthesis-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel} autoFocus>
            Annuler
          </button>
          <button type="submit" disabled={text === null || sharing} onClick={onShare}>
            Partager dans le canal
          </button>
        </div>
      </div>
    </div>
  );
}

export default SynthesisModal;
