import type { Shape } from "../generator";
import { blobSamplers, nonNegative, place, PLACE_DEFAULTS, positive, type PlaceOptions, type Placement, type WidthMode } from "../positioner";
import { createRandom } from "../random";
import type { Scene } from "../renderer";
import { userShape, type UserShape } from "../shapes";

/**
 * An explicit blob position. Anything left out comes from the scene's
 * distributions for this blob's index (its position in the array).
 */
export interface PlacementInput {
  x: number;
  y: number;
  size?: number;
  rotation?: number;
  opacity?: number;
  /** Palette slot (index into the fill distribution's fills). */
  slot?: number;
  shape?: UserShape;
}

export interface SceneOptions extends PlaceOptions {
  /** "fixed" (default): canvas centered, sides cropped. "fluid": x scales with the container. */
  mode?: WidthMode;
  /** Explicit placements. Skips the positioner entirely. */
  placements?: PlacementInput[];
}

/** Builds a complete scene: seed → shapes → placements, ready for toSvg() or <Blobscape>. */
export function scene(options: SceneOptions): Scene {
  const mode = options.mode ?? "fixed";
  if (mode !== "fixed" && mode !== "fluid") throw new RangeError(`blobscape: mode must be "fixed" or "fluid", got ${JSON.stringify(mode)}`);
  if (!options.placements) {
    const layout = place(options);
    return { width: layout.width, height: layout.height, mode, palette: layout.palette, placements: layout.placements };
  }

  // The same checks place() makes, so both modes reject bad options the same way.
  const width = positive("width", options.width ?? PLACE_DEFAULTS.width);
  const height = nonNegative("height", options.height);
  const bandHeight = positive("bandHeight", options.layout?.bandHeight ?? PLACE_DEFAULTS.layout.bandHeight);
  const blobs = blobSamplers(options, createRandom(options.seed));
  // Placements often share one shape object: parse each once.
  const parsed = new Map<UserShape, Shape>();
  const placements = options.placements.map((input, index): Placement => {
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) throw new RangeError(`blobscape: placement ${index} needs finite x and y`);
    let shape: Shape;
    if (input.shape) {
      shape = parsed.get(input.shape) ?? userShape(input.shape);
      parsed.set(input.shape, shape);
    } else {
      shape = blobs.shape(index);
    }
    const size = input.size === undefined ? blobs.size(index) : positive(`placement ${index} size`, input.size);
    const rotation = input.rotation === undefined ? blobs.rotation(index) : finite(`placement ${index} rotation`, input.rotation);
    const opacity = input.opacity === undefined ? blobs.opacity(index) : finite(`placement ${index} opacity`, input.opacity);
    const slot = input.slot ?? blobs.slot(index);
    if (!Number.isInteger(slot) || slot < 0 || slot >= blobs.palette.length) {
      throw new RangeError(`blobscape: placement ${index} has slot ${slot}, but there are ${blobs.palette.length} fills`);
    }
    return {
      index,
      band: Math.floor(input.y / bandHeight),
      x: input.x,
      y: input.y,
      size,
      rotation,
      opacity,
      slot,
      shape,
      radius: shape.radius * size,
    };
  });

  return {
    width,
    height,
    mode,
    palette: blobs.palette,
    placements,
  };
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`blobscape: ${name} must be a finite number, got ${value}`);
  return value;
}
