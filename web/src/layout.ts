export type Box = { left: number; top: number; right: number; bottom: number };

export function overlaps(a: Box, b: Box) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPACING = 10;
const GAP = 16;
const FLOWER_RADIUS = 48;

function spiralPoint(k: number) {
  const angle = k * GOLDEN_ANGLE;
  const radius = SPACING * Math.sqrt(k);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

const STEM_MIN = 30;
const STEM_MAX = 120;

function stemLength(id: number) {
  const noise = Math.sin(id * 12.9898) * 43758.5453;
  return STEM_MIN + (noise - Math.floor(noise)) * (STEM_MAX - STEM_MIN);
}

export type Size = { width: number; height: number };
export type Placement = { x: number; y: number; width: number; height: number };

export function placeMessages(sizes: Size[], parents: (number | null)[], ids: number[]) {
  const placed: Box[] = [
    { left: -FLOWER_RADIUS, top: -FLOWER_RADIUS, right: FLOWER_RADIUS, bottom: FLOWER_RADIUS },
  ];
  const positions: Placement[] = [];

  for (const [index, size] of sizes.entries()) {
    const parent = parents[index];
    const origin = parent === null ? { x: 0, y: 0 } : positions[parent];
    const parentBox = placed[parent === null ? 0 : parent + 1];
    const length = stemLength(ids[index]);
    const reserved = {
      left: parentBox.left - length,
      top: parentBox.top - length,
      right: parentBox.right + length,
      bottom: parentBox.bottom + length,
    };
    for (let k = 0; ; k++) {
      const spiral = spiralPoint(k);
      const point = { x: origin.x + spiral.x, y: origin.y + spiral.y };
      const box = {
        left: point.x - size.width / 2 - GAP / 2,
        top: point.y - size.height / 2 - GAP / 2,
        right: point.x + size.width / 2 + GAP / 2,
        bottom: point.y + size.height / 2 + GAP / 2,
      };
      if (!overlaps(box, reserved) && placed.every((other) => !overlaps(box, other))) {
        placed.push(box);
        positions.push({ ...point, ...size });
        break;
      }
    }
  }

  return positions;
}

const STEM_MARGIN = 6;
const STEM_BEND = 0.15;

function edgePoint(box: Placement, toward: { x: number; y: number }) {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  const t = Math.min(
    (box.width / 2 + STEM_MARGIN) / Math.abs(dx),
    (box.height / 2 + STEM_MARGIN) / Math.abs(dy),
  );
  return { x: box.x + dx * t, y: box.y + dy * t };
}

export function stemPath(from: Placement | null, to: Placement) {
  const center = from ?? { x: 0, y: 0 };
  const start = from ? edgePoint(from, to) : center;
  const end = edgePoint(to, center);

  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const nx = -vy * STEM_BEND;
  const ny = vx * STEM_BEND;
  const c1 = { x: start.x + vx / 3 + nx, y: start.y + vy / 3 + ny };
  const c2 = { x: start.x + (2 * vx) / 3 - nx, y: start.y + (2 * vy) / 3 - ny };

  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}
