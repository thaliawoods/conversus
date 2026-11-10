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

export type Size = { width: number; height: number };
export type Placement = { x: number; y: number; width: number; height: number };

export function placeMessages(sizes: Size[]) {
  const placed: Box[] = [
    { left: -FLOWER_RADIUS, top: -FLOWER_RADIUS, right: FLOWER_RADIUS, bottom: FLOWER_RADIUS },
  ];
  const positions: Placement[] = [];

  for (const size of sizes) {
    for (let k = 0; ; k++) {
      const point = spiralPoint(k);
      const box = {
        left: point.x - size.width / 2 - GAP / 2,
        top: point.y - size.height / 2 - GAP / 2,
        right: point.x + size.width / 2 + GAP / 2,
        bottom: point.y + size.height / 2 + GAP / 2,
      };
      if (placed.every((other) => !overlaps(box, other))) {
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

export function stemPath(from: { x: number; y: number }, to: Placement) {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const t = Math.min(
    (to.width / 2 + STEM_MARGIN) / Math.abs(dx),
    (to.height / 2 + STEM_MARGIN) / Math.abs(dy),
  );
  const end = { x: to.x + dx * t, y: to.y + dy * t };

  const vx = end.x - from.x;
  const vy = end.y - from.y;
  const nx = -vy * STEM_BEND;
  const ny = vx * STEM_BEND;
  const c1 = { x: from.x + vx / 3 + nx, y: from.y + vy / 3 + ny };
  const c2 = { x: from.x + (2 * vx) / 3 - nx, y: from.y + (2 * vy) / 3 - ny };

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}
