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

type Point = { x: number; y: number };

function boxAround(point: Point, size: Size): Box {
  return {
    left: point.x - size.width / 2 - GAP / 2,
    top: point.y - size.height / 2 - GAP / 2,
    right: point.x + size.width / 2 + GAP / 2,
    bottom: point.y + size.height / 2 + GAP / 2,
  };
}

function findSpot(origin: Point, size: Size, reserved: Box, placed: Box[]) {
  for (let k = 0; ; k++) {
    const spiral = spiralPoint(k);
    const point = { x: origin.x + spiral.x, y: origin.y + spiral.y };
    const box = boxAround(point, size);
    if (!overlaps(box, reserved) && placed.every((other) => !overlaps(box, other))) {
      return point;
    }
  }
}

function tiltDown(point: Point, center: Point, tilt: number) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const turn = Math.atan2(Math.sin(Math.PI / 2 - angle), Math.cos(Math.PI / 2 - angle));
  const tilted = angle + turn * tilt;
  return { x: center.x + Math.cos(tilted) * distance, y: center.y + Math.sin(tilted) * distance };
}

export function placeMessages(sizes: Size[], parents: (number | null)[], ids: number[], sags: number[]) {
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
    let point = findSpot(origin, size, reserved, placed);
    const tilt = (sags[index] ?? 0) / (WILT_MAX * WILT_SAG);
    if (tilt > 0) {
      point = findSpot(tiltDown(point, origin, tilt), size, reserved, placed);
    }
    placed.push(boxAround(point, size));
    positions.push({ ...point, ...size });
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

const WILT_SAG = 0.15;
const WILT_MAX = 4;

export function wiltSag(count: number) {
  return Math.min(count, WILT_MAX) * WILT_SAG;
}

function stemCurve(from: Placement | null, to: Placement, sag: number) {
  const center = from ?? { x: 0, y: 0 };
  const start = from ? edgePoint(from, to) : center;
  const end = edgePoint(to, center);

  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const nx = -vy * STEM_BEND;
  const ny = vx * STEM_BEND;
  const lift = Math.hypot(vx, vy) * sag;
  const k = sag / (WILT_MAX * WILT_SAG);
  const c1 = { x: start.x + vx / 3 + nx, y: start.y + vy / 3 + ny - lift };
  const c2x = start.x + (2 * vx) / 3 - nx;
  const c2 = { x: c2x + (end.x - c2x) * k, y: start.y + (2 * vy) / 3 - ny - lift };

  return { start, c1, c2, end };
}

export function stemPath(from: Placement | null, to: Placement, sag = 0) {
  const { start, c1, c2, end } = stemCurve(from, to, sag);
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function cubicSlope(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

export function pointOnStem(from: Placement | null, to: Placement, t: number, sag = 0) {
  const { start, c1, c2, end } = stemCurve(from, to, sag);
  const dx = cubicSlope(start.x, c1.x, c2.x, end.x, t);
  const dy = cubicSlope(start.y, c1.y, c2.y, end.y, t);
  return {
    x: cubic(start.x, c1.x, c2.x, end.x, t),
    y: cubic(start.y, c1.y, c2.y, end.y, t),
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
