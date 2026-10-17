import { bounds, boundingRadius, lerp, mapOutline, type Outline, type Point, type Segment } from "../geometry";
import { toRandom, type KeyPart, type Random } from "../random";

export interface ShapeOptions {
  /** Number of vertices / bumps. Rounded; minimum 3. */
  points?: number;
  /** 0 = regular shape; 1 = heavily varied radii with deep inward bites. */
  irregularity?: number;
  /** 0 = sharp polygon; 1 = fully smooth curve; between = softened corners. */
  roundness?: number;
}

export const SHAPE_DEFAULTS: Required<ShapeOptions> = {
  points: 7,
  irregularity: 0.5,
  roundness: 1,
};

export interface Shape extends Outline {
  /** Largest distance from the origin to the outline, in unit-box units. Used for spacing. */
  radius: number;
}

// At irregularity 1, a vertex radius can drop to 1 - RADIUS_VARIATION of the maximum.
const RADIUS_VARIATION = 0.75;
// At irregularity 1, a vertex angle can move this fraction of half the gap to its neighbors.
// Kept below 1 so vertices never cross and the outline never self-intersects.
const ANGLE_JITTER = 0.8;

function unitInterval(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`blobscape: ${name} must be a finite number, got ${value}`);
  return Math.min(1, Math.max(0, value));
}

/**
 * Generates one closed shape that fits a unit box centered on the origin
 * (its larger bounding-box side is exactly 1).
 *
 * Each vertex draws from its own sub-stream, so a vertex's jitter does not
 * depend on how many vertices came before it.
 */
export function generateShape(options: ShapeOptions = {}, random: Random | KeyPart = "blobscape"): Shape {
  const rng = toRandom(random);
  const pointsOpt = options.points ?? SHAPE_DEFAULTS.points;
  if (!Number.isFinite(pointsOpt)) throw new RangeError(`blobscape: points must be a finite number, got ${pointsOpt}`);
  const n = Math.max(3, Math.round(pointsOpt));
  const irregularity = unitInterval("irregularity", options.irregularity ?? SHAPE_DEFAULTS.irregularity);
  const roundness = unitInterval("roundness", options.roundness ?? SHAPE_DEFAULTS.roundness);

  const step = (2 * Math.PI) / n;
  const vertices: Point[] = [];
  for (let k = 0; k < n; k++) {
    const v = rng.fork("vertex", k);
    // Start at the top so regular shapes sit upright before rotation.
    const angle = -Math.PI / 2 + k * step + (v.value("angle") - 0.5) * irregularity * ANGLE_JITTER * step;
    const r = 1 - RADIUS_VARIATION * irregularity * v.value("radius");
    vertices.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }

  const outline = normalize(roundCorners(vertices, roundness));
  return { ...outline, radius: boundingRadius(outline) };
}

/**
 * Cuts each corner back along both edges by roundness × half the edge and
 * replaces it with a quadratic curve controlled by the original vertex.
 * At 1 the cuts meet at edge midpoints, giving a smooth closed curve.
 */
function roundCorners(vertices: Point[], roundness: number): Outline {
  const n = vertices.length;
  const at = (i: number) => vertices[((i % n) + n) % n]!;

  if (roundness === 0) {
    return { start: at(0), segments: vertices.slice(1).map((to) => ({ type: "L", to })) };
  }

  const t = roundness / 2;
  const entry = (k: number) => lerp(at(k), at(k - 1), t);
  const exit = (k: number) => lerp(at(k), at(k + 1), t);

  const start = entry(0);
  const segments: Segment[] = [];
  for (let k = 0; k < n; k++) {
    const out = exit(k);
    segments.push({ type: "Q", control: at(k), to: out });
    const next = entry(k + 1);
    const isLast = k === n - 1;
    // Straight run between corners; skipped when the cuts meet, and on the
    // last edge because the path's close command draws it.
    if (!isLast && Math.hypot(next.x - out.x, next.y - out.y) > 1e-9) segments.push({ type: "L", to: next });
  }
  return { start, segments };
}

/** Centers the outline's bounding box on the origin and scales its larger side to 1. */
function normalize(outline: Outline): Outline {
  const b = bounds(outline);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const s = 1 / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return mapOutline(outline, (p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s }));
}
