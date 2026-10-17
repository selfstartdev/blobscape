/**
 * Positioner: arranges blobs on a vertical strip, grown in fixed-height bands.
 *
 * Each band draws candidate points from its own sub-stream and tries them in
 * top-to-bottom order. A candidate is tried as the next blob index; if it is
 * too close to an earlier blob it is skipped and the next candidate tries the
 * same index. So:
 *   - blob indexes are strictly top-to-bottom (even / sequence rely on this),
 *   - a blob's size, shape and colour depend only on its index,
 *   - a band depends only on the bands above it: a taller page only adds blobs below.
 */
import { fillSampler, numberSampler, type Fill, type FillDist, type NumberDist } from "../distribution";
import type { Shape } from "../generator";
import { createRandom, type KeyPart, type Random } from "../random";
import { shapeSampler, type ShapeDist } from "../shapes";

export interface LayoutOptions {
  /** Hard minimum distance between blob centers, in px. */
  minDistance?: number;
  /** Hard minimum gap between blob edges (bounding circles), in px. */
  minGap?: number;
  /** Target blobs per 1000px of height. The minimums above are never broken to meet it. */
  density?: number;
  /** Height of each generation band, in px. */
  bandHeight?: number;
}

export interface PlaceOptions {
  seed: KeyPart;
  /** Height to cover, in px. */
  height: number;
  /** Canvas width, in px. */
  width?: number;
  /** Generator settings, or user-supplied shapes. */
  shapes?: ShapeDist;
  /** Blob size: the side of the unit box the shape is scaled to, in px. */
  size?: NumberDist;
  /** Rotation in degrees. */
  rotation?: NumberDist;
  opacity?: NumberDist;
  fill?: FillDist;
  layout?: LayoutOptions;
}

export interface Placement {
  /** Position in top-to-bottom order; stable as the page grows. */
  index: number;
  band: number;
  /** Center, in canvas px. */
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  /** Index into Layout.palette. */
  slot: number;
  /** Unit-box shape. */
  shape: Shape;
  /** Bounding radius in px (shape.radius × size). */
  radius: number;
}

export interface Layout {
  width: number;
  height: number;
  bandHeight: number;
  palette: Fill[];
  placements: Placement[];
}

export const PLACE_DEFAULTS = {
  width: 1440,
  size: { random: [600, 1200] } as NumberDist,
  rotation: { random: [0, 360] } as NumberDist,
  opacity: 0.4 as NumberDist,
  fill: "currentColor" as FillDist,
  layout: { minDistance: 600, minGap: 150, density: 1.25, bandHeight: 1000 } satisfies Required<LayoutOptions>,
};

// Candidates tried per expected blob in a band; enough to saturate the spacing rules.
const CANDIDATES_PER_BLOB = 24;
const MIN_CANDIDATES = 32;

/**
 * Converts density into a soft center spacing D, with about PACKING / D² blobs
 * per unit area. Calibrated so the default options achieve ~1.25 per 1000px
 * (test/positioner.test.ts checks this). With default sizes the hard gap rule
 * caps density at ~1.5 per 1000px, so higher targets saturate there.
 */
const PACKING = 1.5;

export interface BlobSpec {
  size: number;
  shape: Shape;
  /** Bounding radius in px. */
  radius: number;
}

export interface BlobSamplers {
  /** Size and shape for a blob index (what spacing needs). */
  spec: (index: number) => BlobSpec;
  rotation: (index: number) => number;
  opacity: (index: number) => number;
  slot: (index: number) => number;
  palette: Fill[];
  /** Upper bound on any blob's radius in px. */
  maxRadius: number;
}

/** Per-blob property samplers, all keyed by blob index. Shared by place() and explicit placements. */
export function blobSamplers(options: Omit<PlaceOptions, "seed" | "height">, root: Random): BlobSamplers {
  const sizeDist = options.size ?? PLACE_DEFAULTS.size;
  const size = numberSampler(sizeDist, root.fork("size"));
  const fill = fillSampler(options.fill ?? PLACE_DEFAULTS.fill, root.fork("fill"));
  const shapes = shapeSampler(options.shapes ?? {}, root);
  return {
    spec: (index) => {
      const s = positive("size", size(index));
      const shape = shapes.at(index);
      return { size: s, shape, radius: shape.radius * s };
    },
    rotation: numberSampler(options.rotation ?? PLACE_DEFAULTS.rotation, root.fork("rotation")),
    opacity: numberSampler(options.opacity ?? PLACE_DEFAULTS.opacity, root.fork("opacity")),
    slot: fill.slot,
    palette: fill.palette,
    maxRadius: maxValue(sizeDist) * shapes.maxRadius,
  };
}

export function place(options: PlaceOptions): Layout {
  const width = positive("width", options.width ?? PLACE_DEFAULTS.width);
  const height = nonNegative("height", options.height);
  const layout = { ...PLACE_DEFAULTS.layout, ...options.layout };
  const minDistance = nonNegative("minDistance", layout.minDistance);
  const minGap = nonNegative("minGap", layout.minGap);
  const density = nonNegative("density", layout.density);
  const bandHeight = positive("bandHeight", layout.bandHeight);

  const root = createRandom(options.seed);
  const blobs = blobSamplers(options, root);

  const perBand = (density * bandHeight) / 1000;
  // Soft spacing from density; 0 density means "as dense as the hard rules allow".
  const spacing = perBand > 0 ? Math.sqrt((PACKING * width * bandHeight) / perBand) : 0;
  const candidatesPerBand = Math.max(MIN_CANDIDATES, Math.ceil(perBand * CANDIDATES_PER_BLOB));

  // Blobs below `height` can still reach up into view, so keep generating
  // bands until no further blob could.
  const reach = blobs.maxRadius;
  const placed: Placement[] = [];
  const rules: Rules = { minDistance, minGap, spacing, maxRadius: 0 };
  let pending: BlobSpec | undefined;

  for (let band = 0; band * bandHeight < height + reach; band++) {
    const bandRandom = root.fork("band", band);
    const top = band * bandHeight;
    const candidates = Array.from({ length: candidatesPerBand }, (_, c) => {
      const r = bandRandom.fork("candidate", c);
      return { x: r.value("x") * width, y: top + r.value("y") * bandHeight, c };
    }).sort((a, b) => a.y - b.y || a.c - b.c);

    for (const { x, y } of candidates) {
      const index = placed.length;
      const blob = (pending ??= blobs.spec(index));
      if (!fits(placed, x, y, blob.radius, rules)) continue;
      rules.maxRadius = Math.max(rules.maxRadius, blob.radius);
      placed.push({
        index,
        band,
        x,
        y,
        size: blob.size,
        rotation: blobs.rotation(index),
        opacity: blobs.opacity(index),
        slot: blobs.slot(index),
        shape: blob.shape,
        radius: blob.radius,
      });
      pending = undefined;
    }
  }

  return {
    width,
    height,
    bandHeight,
    palette: blobs.palette,
    // Rendering stops at the container's height: keep only blobs that reach into it.
    placements: placed.filter((p) => p.y - p.radius < height),
  };
}

interface Rules {
  minDistance: number;
  minGap: number;
  spacing: number;
  /** Largest radius placed so far; bounds how far up a conflict can be. */
  maxRadius: number;
}

function fits(placed: Placement[], x: number, y: number, radius: number, rules: Rules): boolean {
  const { minDistance, minGap, spacing } = rules;
  const reach = Math.max(minDistance, spacing, rules.maxRadius + radius + minGap);
  // Placements are sorted by y: walk back from the newest until nothing above can be close enough.
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i]!;
    const dy = y - p.y;
    if (dy >= reach) break;
    if (Math.hypot(x - p.x, dy) < Math.max(minDistance, spacing, p.radius + radius + minGap)) return false;
  }
  return true;
}


function maxValue(dist: NumberDist): number {
  if (typeof dist === "number") return dist;
  const [a, b] = "random" in dist ? dist.random : dist.even;
  return Math.max(a, b);
}

// ── Width modes ──────────────────────────────────────────────────────────

export type WidthMode = "fixed" | "fluid";

/**
 * Maps a canvas x to container x.
 * - fixed: the canvas keeps its width, centered; narrow screens crop both sides equally.
 * - fluid: x scales with the container, so blobs move closer together as it narrows.
 */
export function toContainerX(x: number, canvasWidth: number, containerWidth: number, mode: WidthMode = "fixed"): number {
  return mode === "fluid" ? (x * containerWidth) / canvasWidth : x + (containerWidth - canvasWidth) / 2;
}

function nonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`blobscape: ${name} must be a finite number >= 0, got ${value}`);
  return value;
}

function positive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`blobscape: ${name} must be a finite number > 0, got ${value}`);
  return value;
}
