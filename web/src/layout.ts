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

export function placeMessages(sizes: Size[]) {
  const placed: Box[] = [
    { left: -FLOWER_RADIUS, top: -FLOWER_RADIUS, right: FLOWER_RADIUS, bottom: FLOWER_RADIUS },
  ];
  const positions: { x: number; y: number }[] = [];

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
        positions.push(point);
        break;
      }
    }
  }

  return positions;
}
