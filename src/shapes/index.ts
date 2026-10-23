/**
 * Which shape each blob gets: generated from settings, or picked from
 * user-supplied path data. Either way it's keyed by blob index.
 */
import { choiceSampler, isChoiceDist, numberSampler, type ChoiceDist, type NumberDist } from "../distribution";
import { generateShape, SHAPE_DEFAULTS, type Shape } from "../generator";
import { boundingRadius, mapOutline } from "../geometry";
import { parsePath } from "../geometry/parse";
import type { Random } from "../random";

/** Generator settings; each may be any number distribution. */
export interface ShapeSettings {
  points?: NumberDist;
  irregularity?: NumberDist;
  roundness?: NumberDist;
}

/**
 * A user-supplied shape: one closed SVG path. By default the path is drawn in a
 * 0–1 box (viewBox "0 0 1 1"); pass `viewBox` for paths drawn at another size,
 * e.g. [0, 0, 24, 24] for an icon.
 */
export interface UserShape {
  d: string;
  viewBox?: [minX: number, minY: number, width: number, height: number];
}

/**
 * Generator settings, one user shape, a list of user shapes (each blob gets
 * one, in equal shares), or a weighted / even / sequence pick of user shapes.
 */
export type ShapeDist = ShapeSettings | UserShape | UserShape[] | ChoiceDist<UserShape>;

export function isUserShape(value: unknown): value is UserShape {
  return typeof value === "object" && value !== null && typeof (value as UserShape).d === "string";
}

/** Parses a user shape and maps its box onto the unit box centered on the origin. */
export function userShape({ d, viewBox = [0, 0, 1, 1] }: UserShape): Shape {
  const [minX, minY, w, h] = viewBox;
  if (![minX, minY, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    throw new RangeError(`blobscape: invalid viewBox ${JSON.stringify(viewBox)}`);
  }
  const cx = minX + w / 2, cy = minY + h / 2, s = 1 / Math.max(w, h);
  const outline = mapOutline(parsePath(d), (p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s }));
  const radius = boundingRadius(outline);
  if (!Number.isFinite(radius)) throw new RangeError(`blobscape: shape "${d}" has coordinates out of range`);
  return { ...outline, radius };
}

export interface ShapeSampler {
  at: (index: number) => Shape;
  /** Upper bound on any shape's radius, in unit-box units. */
  maxRadius: number;
  /** Lower bound on any shape's radius, in unit-box units. */
  minRadius: number;
}

export function shapeSampler(dist: ShapeDist, root: Random): ShapeSampler {
  const random = root.fork("shape");

  if (isUserShape(dist)) {
    const shape = userShape(dist);
    return { at: () => shape, maxRadius: shape.radius, minRadius: shape.radius };
  }
  if (Array.isArray(dist) || isChoiceDist(dist)) {
    const choice = choiceSampler(Array.isArray(dist) ? { even: dist } : dist, random.fork("pick"), "shape");
    const shapes = choice.items.map(userShape); // parse once, up front, so bad paths fail early
    const radii = shapes.map((s) => s.radius);
    return { at: (index) => shapes[choice.slot(index)]!, maxRadius: Math.max(...radii), minRadius: Math.min(...radii) };
  }

  const points = numberSampler(dist.points ?? SHAPE_DEFAULTS.points, random.fork("points"));
  const irregularity = numberSampler(dist.irregularity ?? SHAPE_DEFAULTS.irregularity, random.fork("irregularity"));
  const roundness = numberSampler(dist.roundness ?? SHAPE_DEFAULTS.roundness, random.fork("roundness"));
  return {
    at: (index) =>
      generateShape(
        { points: points(index), irregularity: irregularity(index), roundness: roundness(index) },
        random.fork("outline", index),
      ),
    // Generated shapes fit a unit box centered on the origin, touching two opposite sides.
    maxRadius: Math.SQRT1_2,
    minRadius: 0.5,
  };
}
