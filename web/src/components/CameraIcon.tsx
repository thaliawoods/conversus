export type CameraAction = "zoomIn" | "zoomOut" | "recenter";

// Zoom arrows after the créa's diagonal double arrow; recenter = crosshair.
const SHAPES: Record<CameraAction, string[]> = {
  zoomIn: ["M-7 7 L7 -7", "M1.5 -7 L7 -7 L7 -1.5", "M-7 1.5 L-7 7 L-1.5 7"],
  zoomOut: ["M-8.5 8.5 L-2 2", "M-6.5 2 L-2 2 L-2 6.5", "M8.5 -8.5 L2 -2", "M6.5 -2 L2 -2 L2 -6.5"],
  recenter: [
    "M0 -6.5 A6.5 6.5 0 1 1 0 6.5 A6.5 6.5 0 1 1 0 -6.5",
    "M0 -10 L0 -4",
    "M0 10 L0 4",
    "M-10 0 L-4 0",
    "M10 0 L4 0",
  ],
};

// Thin line in the button's text colour (grey, white on hover).
function CameraIcon({ action }: { action: CameraAction }) {
  return (
    <svg className="camera-icon" viewBox="-12 -12 24 24" aria-hidden="true">
      {SHAPES[action].map((d) => (
        <path key={d} d={d} />
      ))}
      {action === "recenter" && <circle className="camera-dot" r={1} />}
    </svg>
  );
}

export default CameraIcon;
