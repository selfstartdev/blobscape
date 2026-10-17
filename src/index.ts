// Main API
export { scene, type PlacementInput, type SceneOptions } from "./scene";
export { presets, type Preset, type PresetName } from "./presets";
export { blobscapeParentStyle } from "./parent";
export {
  render,
  serialize,
  toSvg,
  type RenderedGradient,
  type RenderedPath,
  type RenderedScene,
  type RenderOptions,
  type Scene,
} from "./renderer";

// Building blocks, for advanced use
export { createRandom, hashString, mulberry32, toRandom, type KeyPart, type Random } from "./random";
export {
  bounds,
  boundingRadius,
  formatPath,
  toPathData,
  transformOutline,
  type Bounds,
  type Outline,
  type PathTransform,
  type Point,
  type Segment,
  type Transform,
} from "./geometry";
export { parsePath } from "./geometry/parse";
export { generateShape, SHAPE_DEFAULTS, type Shape, type ShapeOptions } from "./generator";
export { shapeSampler, userShape, type ShapeDist, type ShapeSampler, type ShapeSettings, type UserShape } from "./shapes";
export {
  choiceSampler,
  DEFAULT_GROUP_SIZE,
  fillSampler,
  isFill,
  numberSampler,
  type ChoiceDist,
  type ChoiceSampler,
  type Fill,
  type FillDist,
  type FillSampler,
  type NumberDist,
  type NumberSampler,
  type Stop,
} from "./distribution";
export {
  blobSamplers,
  place,
  PLACE_DEFAULTS,
  toContainerX,
  type BlobSamplers,
  type BlobSpec,
  type Layout,
  type LayoutOptions,
  type PlaceOptions,
  type Placement,
  type WidthMode,
} from "./positioner";
