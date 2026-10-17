/**
 * Distributions: one shared system for every setting that varies per blob.
 *
 * Samplers take a blob's index in top-to-bottom order. A blob's value never
 * depends on how many blobs come after it, so a taller page only adds values.
 */
import type { Random } from "../random";

// ── Numbers ──────────────────────────────────────────────────────────────

export type NumberDist =
  | number
  | { random: [min: number, max: number] }
  | { even: [min: number, max: number]; groupSize?: number };

export const DEFAULT_GROUP_SIZE = 8;

export type NumberSampler = (index: number) => number;

/**
 * Builds a sampler for a number distribution. `random` should be a stream
 * dedicated to this property (e.g. root.fork("size")).
 */
export function numberSampler(dist: NumberDist, random: Random): NumberSampler {
  if (typeof dist === "number") {
    finite("value", dist);
    return () => dist;
  }
  if ("random" in dist) {
    const [min, max] = range(dist.random);
    return (index) => min + random.value("blob", index) * (max - min);
  }
  if ("even" in dist) {
    const [min, max] = range(dist.even);
    const n = groupSize(dist.groupSize, DEFAULT_GROUP_SIZE);
    const slots = groupSlots(n, random);
    // One value per slice of the range: min + (k + u) / n · (max − min).
    return (index) => min + ((slots(index) + random.value("blob", index)) / n) * (max - min);
  }
  throw new TypeError(`blobscape: unknown number distribution ${JSON.stringify(dist)}`);
}

// ── Fills ────────────────────────────────────────────────────────────────

export interface Stop {
  offset: number;
  color: string;
}

export type Fill =
  | string
  | { linear: { angle: number; stops: Stop[] } }
  | { radial: { stops: Stop[] } };

/** Picks one item per blob from a list: random by weight, equal shares per group, or cycling top to bottom. */
export type ChoiceDist<T> =
  | { weighted: T[]; weights?: number[] }
  | { even: T[]; groupSize?: number }
  | { sequence: T[] };

export type FillDist = Fill | ChoiceDist<Fill>;

export interface ChoiceSampler<T> {
  /** The items, indexed by slot. */
  items: T[];
  /** The item slot for a blob. */
  slot: (index: number) => number;
}

export interface FillSampler {
  /** The fills, indexed by slot. */
  palette: Fill[];
  /** The palette slot for a blob. Placements store this, never the fill itself. */
  slot: (index: number) => number;
}

export function isFill(value: unknown): value is Fill {
  return typeof value === "string" || (typeof value === "object" && value !== null && ("linear" in value || "radial" in value));
}

export function isChoiceDist(value: unknown): value is ChoiceDist<unknown> {
  return typeof value === "object" && value !== null && ("weighted" in value || "even" in value || "sequence" in value);
}

export function fillSampler(dist: FillDist, random: Random): FillSampler {
  if (isFill(dist)) return { palette: [validFill(dist)], slot: () => 0 };
  const { items, slot } = choiceSampler(dist, random, "fill");
  return { palette: items.map(validFill), slot };
}

export function choiceSampler<T>(dist: ChoiceDist<T>, random: Random, what = "item"): ChoiceSampler<T> {
  const nonEmpty = (items: T[]) => {
    if (!Array.isArray(items) || items.length === 0) throw new RangeError(`blobscape: a ${what} distribution needs at least one ${what}`);
    return items;
  };

  if ("weighted" in dist) {
    const items = nonEmpty(dist.weighted);
    const weights = dist.weights ?? items.map(() => 1);
    if (weights.length !== items.length) {
      throw new RangeError(`blobscape: weighted ${what} has ${items.length} items but ${weights.length} weights`);
    }
    if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError("blobscape: weights must be finite and >= 0");
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) throw new RangeError("blobscape: weights must not all be 0");
    return {
      items,
      slot: (index) => {
        let target = random.value("blob", index) * total;
        for (let i = 0; i < weights.length; i++) {
          target -= weights[i]!;
          if (target < 0) return i;
        }
        // Float rounding can leave target at exactly 0; land on the last non-zero weight.
        let last = weights.length - 1;
        while (weights[last] === 0) last--;
        return last;
      },
    };
  }

  if ("even" in dist) {
    const items = nonEmpty(dist.even);
    // Default: the smallest multiple of the item count that is at least 8, so every item gets an equal share.
    const fallback = Math.ceil(DEFAULT_GROUP_SIZE / items.length) * items.length;
    const slots = groupSlots(groupSize(dist.groupSize, fallback), random);
    return { items, slot: (index) => slots(index) % items.length };
  }

  if ("sequence" in dist) {
    const items = nonEmpty(dist.sequence);
    return { items, slot: (index) => index % items.length };
  }

  throw new TypeError(`blobscape: unknown ${what} distribution ${JSON.stringify(dist)}`);
}

// ── Shared ───────────────────────────────────────────────────────────────

/**
 * Splits indexes into consecutive groups of n and gives each index a slot in
 * 0..n-1, shuffled per group. A partial last group uses the first slots of its
 * full shuffle, so it fills in consistently as the page grows.
 */
function groupSlots(n: number, random: Random): (index: number) => number {
  const cache = new Map<number, number[]>();
  return (index) => {
    const group = Math.floor(index / n);
    let perm = cache.get(group);
    if (!perm) {
      perm = shuffle(Array.from({ length: n }, (_, k) => k), random.fork("group", group));
      cache.set(group, perm);
    }
    return perm[index - group * n]!;
  };
}

function shuffle<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`blobscape: ${name} must be a finite number, got ${value}`);
  return value;
}

function range([min, max]: [number, number]): [number, number] {
  return [finite("min", min), finite("max", max)];
}

function groupSize(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`blobscape: groupSize must be a positive integer, got ${value}`);
  return value;
}

function validFill(fill: Fill): Fill {
  if (typeof fill === "string") {
    if (fill.trim() === "") throw new RangeError("blobscape: fill color must not be empty");
    return fill;
  }
  const stops = "linear" in fill ? fill.linear.stops : fill.radial.stops;
  if (stops.length === 0) throw new RangeError("blobscape: gradient fills need at least one stop");
  if ("linear" in fill) finite("gradient angle", fill.linear.angle);
  return fill;
}

