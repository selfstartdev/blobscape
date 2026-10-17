export interface Point {
  x: number;
  y: number;
}

export type Segment =
  | { type: "L"; to: Point }
  | { type: "Q"; control: Point; to: Point }
  | { type: "C"; c1: Point; c2: Point; to: Point };

/** A closed outline: start point plus segments; closing back to start is implied. */
export interface Outline {
  start: Point;
  segments: Segment[];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadAt(p0: number, c: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

function cubicAt(p0: number, c1: number, c2: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1;
}

/** Point on a segment at t ∈ [0, 1], starting from `from`. */
function segmentAt(from: Point, s: Segment, t: number): Point {
  switch (s.type) {
    case "L":
      return lerp(from, s.to, t);
    case "Q":
      return { x: quadAt(from.x, s.control.x, s.to.x, t), y: quadAt(from.y, s.control.y, s.to.y, t) };
    case "C":
      return { x: cubicAt(from.x, s.c1.x, s.c2.x, s.to.x, t), y: cubicAt(from.y, s.c1.y, s.c2.y, s.to.y, t) };
  }
}

/** Parameters in (0, 1) where a segment's coordinate on one axis can reach an extreme. */
function extremaParams(from: Point, s: Segment, axis: "x" | "y"): number[] {
  const inRange = (t: number) => t > 0 && t < 1;
  if (s.type === "L") return [];
  if (s.type === "Q") {
    const denom = from[axis] - 2 * s.control[axis] + s.to[axis];
    return denom === 0 ? [] : [(from[axis] - s.control[axis]) / denom].filter(inRange);
  }
  // Cubic derivative: a t² + b t + c = 0.
  const p0 = from[axis], p1 = s.c1[axis], p2 = s.c2[axis], p3 = s.to[axis];
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b].filter(inRange);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [(-b + sq) / (2 * a), (-b - sq) / (2 * a)].filter(inRange);
}

/** Applies fn to every point (including control points). Only valid for affine transforms. */
export function mapOutline(outline: Outline, fn: (p: Point) => Point): Outline {
  return {
    start: fn(outline.start),
    segments: outline.segments.map((s): Segment => {
      switch (s.type) {
        case "L":
          return { type: "L", to: fn(s.to) };
        case "Q":
          return { type: "Q", control: fn(s.control), to: fn(s.to) };
        case "C":
          return { type: "C", c1: fn(s.c1), c2: fn(s.c2), to: fn(s.to) };
      }
    }),
  };
}

/** Exact axis-aligned bounding box (includes curve extrema). */
export function bounds(outline: Outline): Bounds {
  let minX = outline.start.x, maxX = minX, minY = outline.start.y, maxY = minY;
  const add = ({ x, y }: Point) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  let from = outline.start;
  for (const s of outline.segments) {
    add(s.to);
    for (const axis of ["x", "y"] as const) {
      for (const t of extremaParams(from, s, axis)) add(segmentAt(from, s, t));
    }
    from = s.to;
  }
  return { minX, minY, maxX, maxY };
}

/** Largest distance from the origin to the outline (curves sampled finely). */
export function boundingRadius(outline: Outline): number {
  let max = Math.hypot(outline.start.x, outline.start.y);
  let from = outline.start;
  for (const s of outline.segments) {
    if (s.type !== "L") {
      for (let i = 1; i < 32; i++) {
        const p = segmentAt(from, s, i / 32);
        max = Math.max(max, Math.hypot(p.x, p.y));
      }
    }
    max = Math.max(max, Math.hypot(s.to.x, s.to.y));
    from = s.to;
  }
  return max;
}

export interface Transform {
  /** Translation, applied last. */
  x?: number;
  y?: number;
  /** Uniform scale. */
  scale?: number;
  /** Rotation in degrees, clockwise in SVG's y-down space, applied about the origin before scaling. */
  rotation?: number;
}

export interface PathTransform extends Transform {
  /** Decimal places in the output. Default 2. */
  precision?: number;
}

/** Rotates, scales, then translates every point: rotation is baked into the coordinates. */
export function transformOutline(outline: Outline, { x = 0, y = 0, scale = 1, rotation = 0 }: Transform = {}): Outline {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return mapOutline(outline, (p) => ({ x: (p.x * cos - p.y * sin) * scale + x, y: (p.x * sin + p.y * cos) * scale + y }));
}

export function formatNumber(n: number, precision = 2): string {
  const s = String(Number(n.toFixed(precision)));
  return s === "-0" ? "0" : s;
}

/** Serializes an outline to SVG path data, rounded to `precision` decimals. */
export function formatPath(outline: Outline, precision = 2): string {
  const fmt = (p: Point) => formatNumber(p.x, precision) + " " + formatNumber(p.y, precision);
  let d = "M" + fmt(outline.start);
  for (const s of outline.segments) {
    if (s.type === "L") d += "L" + fmt(s.to);
    else if (s.type === "Q") d += "Q" + fmt(s.control) + " " + fmt(s.to);
    else d += "C" + fmt(s.c1) + " " + fmt(s.c2) + " " + fmt(s.to);
  }
  return d + "Z";
}

/** Serializes an outline to SVG path data, transforming coordinates directly (no transform attribute). */
export function toPathData(outline: Outline, { precision = 2, ...transform }: PathTransform = {}): string {
  return formatPath(transformOutline(outline, transform), precision);
}
