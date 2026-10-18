/**
 * Ready-made option sets. Spread one into scene() or <Blobscape>, then override:
 *   <Blobscape seed={pathname} {...presets.polygons} fill="#8a5cf6" />
 *
 * Presets are covered by the stability promise: changing one is a major release.
 */
import type { SceneOptions } from "../scene";

export type Preset = Omit<SceneOptions, "seed" | "height" | "placements">;

export const presets = {
  /** Smooth organic blobs: the default look. */
  blobs: {
    shapes: { points: { even: [5, 9] }, irregularity: { random: [0.3, 0.7] }, roundness: 1 },
    size: { random: [600, 1200] },
    rotation: { random: [0, 360] },
  },
  /** Angular shards: sharp polygons, 600–1200px, ~1 per 800px of height. */
  polygons: {
    shapes: { points: { even: [4, 7] }, irregularity: { random: [0.4, 0.9] }, roundness: 0 },
    size: { random: [600, 1200] },
    rotation: { random: [0, 360] },
    layout: { density: 1.25 },
  },
  /** Polygons with softened corners, between shards and blobs. */
  pebbles: {
    shapes: { points: { even: [5, 8] }, irregularity: { random: [0.2, 0.5] }, roundness: 0.45 },
    size: { random: [400, 900] },
    rotation: { random: [0, 360] },
    layout: { minDistance: 450, minGap: 120, density: 2 },
  },
  /** Many small shapes, evenly sized: a light texture rather than accents. */
  confetti: {
    shapes: { points: { random: [3, 6] }, irregularity: 0.3, roundness: { random: [0, 1] } },
    size: { even: [60, 180] },
    rotation: { random: [0, 360] },
    layout: { minDistance: 140, minGap: 40, density: 14 },
  },
  /** Near-circles of mixed sizes, 120–520px, closer together than blobs. */
  bubbles: {
    shapes: { points: 12, irregularity: { random: [0, 0.06] }, roundness: 1 },
    size: { random: [120, 520] },
    rotation: { random: [0, 360] },
    layout: { minDistance: 160, minGap: 40, density: 7 },
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof presets;
