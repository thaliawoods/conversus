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
const FLOWER_RADIUS = 64;
const FLOWER_KEEP_OUT = 220;

function spiralPoint(k: number, offset: number) {
  const angle = k * GOLDEN_ANGLE + offset;
  const radius = SPACING * Math.sqrt(k);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function pseudoRandom(id: number, seed: number) {
  const noise = Math.sin(id * seed) * 43758.5453;
  return noise - Math.floor(noise);
}

const STEM_MIN = 30;
const STEM_MAX = 120;
const MARKED_STEM_MIN = 60;
const MARKED_STEM_MAX = 180;
const STEM_PER_MARK = 15;
const STEM_MARK_LIMIT = 4;

function stemLength(id: number, marks: number) {
  const random = pseudoRandom(id, 12.9898);
  if (marks === 0) return STEM_MIN + random * (STEM_MAX - STEM_MIN);
  const extra = (Math.min(marks, STEM_MARK_LIMIT) - 1) * STEM_PER_MARK;
  return MARKED_STEM_MIN + random * (MARKED_STEM_MAX - MARKED_STEM_MIN) + extra;
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

const FLOWER_RING = FLOWER_RADIUS + 30;
const PARENT_RING = 70;
const CONE = Math.PI / 3;
const WIDE_CONE = Math.PI / 2;
const AXIS = Math.PI / 9;
const SEARCH_LIMIT = 4000;
const STEM_SAMPLES = 32;
const STEM_CLEARANCE = 12;

type Rule = { cone: number | null; stems: boolean; sideways: boolean };

const RULES: Rule[] = [
  { cone: CONE, stems: true, sideways: true },
  { cone: CONE, stems: true, sideways: false },
  { cone: WIDE_CONE, stems: true, sideways: false },
  { cone: null, stems: true, sideways: false },
  { cone: null, stems: false, sideways: false },
];

type Line = { from: number | null; to: number; points: Point[]; bounds: Box };

function findSpot(center: Point, offset: number, accept: (point: Point) => boolean, limit: number) {
  for (let k = 0; k < limit; k++) {
    const spiral = spiralPoint(k, offset);
    const point = { x: center.x + spiral.x, y: center.y + spiral.y };
    if (accept(point)) return point;
  }
  return null;
}

function sampleStem(from: Point, to: Point, sag: number) {
  const { start, c1, c2, end } = stemCurve(from, to, sag);
  return Array.from({ length: STEM_SAMPLES + 1 }, (_, i) => ({
    x: cubic(start.x, c1.x, c2.x, end.x, i / STEM_SAMPLES),
    y: cubic(start.y, c1.y, c2.y, end.y, i / STEM_SAMPLES),
  }));
}

function boundsOf(points: Point[]): Box {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { left: Math.min(...xs) - 1, top: Math.min(...ys) - 1, right: Math.max(...xs) + 1, bottom: Math.max(...ys) + 1 };
}

function inside(point: Point, box: Box) {
  return (
    point.x > box.left - STEM_CLEARANCE &&
    point.x < box.right + STEM_CLEARANCE &&
    point.y > box.top - STEM_CLEARANCE &&
    point.y < box.bottom + STEM_CLEARANCE
  );
}

function segmentsCross(p: Point, q: Point, r: Point, s: Point) {
  const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
  if (d === 0) return false;
  const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
  const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function linesCross(a: Point[], b: Point[]) {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsCross(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

function angleGap(a: number, b: number) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function tiltDown(point: Point, center: Point, tilt: number) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const turn = Math.atan2(Math.sin(Math.PI / 2 - angle), Math.cos(Math.PI / 2 - angle));
  const tilted = angle + Math.max(-WILT_TURN, Math.min(WILT_TURN, turn)) * tilt;
  return { x: center.x + Math.cos(tilted) * distance, y: center.y + Math.sin(tilted) * distance };
}

let lastKey = "";
let lastPositions: Placement[] = [];
const remembered = new Map<
  number,
  { dx: number; dy: number; sag: number; baseDx: number; baseDy: number; parentId: number | null }
>();
const KEEP_RULE: Rule = { cone: null, stems: true, sideways: false };

export function placeMessages(
  sizes: Size[],
  parents: (number | null)[],
  ids: number[],
  sags: number[],
  marks: number[],
) {
  const key = JSON.stringify([sizes, parents, ids, sags, marks]);
  if (key === lastKey) return lastPositions;

  const placed: Box[] = [
    { left: -FLOWER_KEEP_OUT, top: -FLOWER_KEEP_OUT, right: FLOWER_KEEP_OUT, bottom: FLOWER_KEEP_OUT },
  ];
  const positions: Placement[] = [];
  const lines: Line[] = [];
  let flowerChildren = 0;

  for (const [index, size] of sizes.entries()) {
    const parent = parents[index];
    const origin = parent === null ? { x: 0, y: 0 } : positions[parent];
    const sag = sags[index] ?? 0;
    const ring = stemLength(ids[index], marks[index] ?? 0) + (parent === null ? FLOWER_RING : PARENT_RING);
    const offset = pseudoRandom(ids[index], 78.233) * Math.PI * 2;
    const grandParent = parent === null ? null : parents[parent];
    const from = grandParent === null || grandParent === undefined ? { x: 0, y: 0 } : positions[grandParent];
    const direction =
      parent === null
        ? -Math.PI / 2 + flowerChildren * GOLDEN_ANGLE
        : Math.atan2(origin.y - from.y, origin.x - from.x);
    const ownBox = parent === null ? 0 : parent + 1;

    const fits = (point: Point, rule: Rule) => {
      if (Math.hypot(point.x - origin.x, point.y - origin.y) < ring) return false;
      if (rule.cone !== null) {
        const gap = angleGap(Math.atan2(point.y - origin.y, point.x - origin.x), direction);
        if (gap > rule.cone) return false;
        if (rule.sideways && parent !== null && gap < AXIS) return false;
      }
      const box = boxAround(point, size);
      if (placed.some((other) => overlaps(box, other))) return false;
      if (!rule.stems) return true;
      const points = sampleStem(origin, point, sag);
      if (placed.some((other, j) => j !== ownBox && points.some((p) => inside(p, other)))) return false;
      const roomy = {
        left: box.left - STEM_CLEARANCE,
        top: box.top - STEM_CLEARANCE,
        right: box.right + STEM_CLEARANCE,
        bottom: box.bottom + STEM_CLEARANCE,
      };
      if (lines.some((line) => overlaps(line.bounds, roomy) && line.points.some((p) => inside(p, box)))) return false;
      const bounds = boundsOf(points);
      return lines.every(
        (line) =>
          line.from === parent ||
          line.to === parent ||
          !overlaps(line.bounds, bounds) ||
          !linesCross(points, line.points),
      );
    };

    const search = (center: Point, rules: Rule[]) => {
      for (const [k, rule] of rules.entries()) {
        const limit = k === rules.length - 1 ? Infinity : SEARCH_LIMIT;
        const found = findSpot(center, offset, (point) => fits(point, rule), limit);
        if (found) return found;
      }
      return center;
    };

    const nearest = (start: Point) =>
      findSpot(start, offset, (point) => fits(point, KEEP_RULE), SEARCH_LIMIT) ?? search(origin, RULES);

    const id = ids[index];
    const parentId = parent === null ? null : ids[parent];
    const memory = remembered.get(id);
    const known = memory && memory.parentId === parentId ? memory : null;
    let point: Point;
    let base: Point;
    if (known && known.sag === sag) {
      base = { x: origin.x + known.baseDx, y: origin.y + known.baseDy };
      point = nearest({ x: origin.x + known.dx, y: origin.y + known.dy });
    } else {
      base = known ? nearest({ x: origin.x + known.baseDx, y: origin.y + known.baseDy }) : search(origin, RULES);
      const tilt = sag / (WILT_MAX * WILT_SAG);
      point = tilt > 0 ? nearest(tiltDown(base, origin, tilt)) : base;
    }
    remembered.set(id, {
      dx: point.x - origin.x,
      dy: point.y - origin.y,
      sag,
      baseDx: base.x - origin.x,
      baseDy: base.y - origin.y,
      parentId,
    });
    if (parent === null) flowerChildren++;

    const points = sampleStem(origin, point, sag);
    placed.push(boxAround(point, size));
    positions.push({ ...point, ...size });
    lines.push({ from: parent, to: index, points, bounds: boundsOf(points) });
  }

  lastKey = key;
  lastPositions = positions;
  return positions;
}

const STEM_BEND = 0.15;

const WILT_SAG = 0.06;
const WILT_MAX = 4;
const WILT_TURN = 0.45;

export function wiltSag(count: number) {
  return Math.min(count, WILT_MAX) * WILT_SAG;
}

function stemCurve(from: Point | null, to: Point, sag: number) {
  const start = from ? { x: from.x, y: from.y } : { x: 0, y: 0 };
  const end = { x: to.x, y: to.y };

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
