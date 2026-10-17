/**
 * Renderer: scene → plain render data (one path per blob, plus gradients),
 * and render data → SVG string. blobscape/react maps the same data to elements.
 *
 * Rotation is applied to the path coordinates, so each gradient can use
 * userSpaceOnUse units sized to the blob's on-screen bounding box and stays
 * upright however the blob is rotated.
 */
import type { Fill, Stop } from "../distribution";
import { bounds, formatNumber, formatPath, transformOutline, type Bounds } from "../geometry";
import { toContainerX, type Placement, type WidthMode } from "../positioner";
import { hashString } from "../random";

export interface Scene {
  width: number;
  height: number;
  mode: WidthMode;
  palette: Fill[];
  placements: Placement[];
}

export interface RenderOptions {
  /**
   * Width of the element the scene is drawn into, in px. Defaults to the
   * canvas width. In fixed mode the canvas is centered and cropped; in fluid
   * mode x positions scale to it.
   */
  containerWidth?: number;
  /** Prefix for gradient ids. React passes useId() here. Default "blobscape". */
  idPrefix?: string;
  /** Decimal places for coordinates. Default 2, which keeps output byte-stable. */
  precision?: number;
}

export interface RenderedGradient {
  id: string;
  type: "linear" | "radial";
  /** x1/y1/x2/y2 for linear, cx/cy/r for radial; gradientUnits is always userSpaceOnUse. */
  attrs: Record<string, string>;
  stops: { offset: string; color: string }[];
}

export interface RenderedPath {
  /** Blob index; stable, so usable as a React key. */
  key: number;
  d: string;
  /** A color, or url(#id) for a gradient. */
  fill: string;
  opacity: number;
}

export interface RenderedScene {
  width: number;
  height: number;
  gradients: RenderedGradient[];
  paths: RenderedPath[];
}

export function render(scene: Scene, { containerWidth = scene.width, idPrefix = "blobscape", precision = 2 }: RenderOptions = {}): RenderedScene {
  const fmt = (n: number) => formatNumber(n, precision);
  const gradients = new Map<string, RenderedGradient>();

  const paths = scene.placements.map((p): RenderedPath => {
    const outline = transformOutline(p.shape, {
      x: toContainerX(p.x, scene.width, containerWidth, scene.mode),
      y: p.y,
      scale: p.size,
      rotation: p.rotation,
    });
    const fill = scene.palette[p.slot];
    if (fill === undefined) throw new RangeError(`blobscape: placement ${p.index} uses palette slot ${p.slot}, but the palette has ${scene.palette.length} fills`);

    let paint: string;
    if (typeof fill === "string") {
      paint = fill;
    } else {
      const g = gradient(fill, bounds(outline), fmt, idPrefix);
      gradients.set(g.id, g); // identical gradients share one definition
      paint = `url(#${g.id})`;
    }
    return { key: p.index, d: formatPath(outline, precision), fill: paint, opacity: p.opacity };
  });

  return { width: containerWidth, height: scene.height, gradients: [...gradients.values()], paths };
}

function gradient(fill: Exclude<Fill, string>, b: Bounds, fmt: (n: number) => string, idPrefix: string): Omit<RenderedGradient, "id"> & { id: string } {
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  let type: RenderedGradient["type"];
  let attrs: Record<string, string>;
  let stops: Stop[];

  if ("linear" in fill) {
    // CSS convention: 0deg points up, 90deg points right. The line is long
    // enough that 0% and 100% land on the box's corners, as in CSS.
    const a = (fill.linear.angle * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    type = "linear";
    attrs = { x1: fmt(cx - dx * half), y1: fmt(cy - dy * half), x2: fmt(cx + dx * half), y2: fmt(cy + dy * half) };
    stops = fill.linear.stops;
  } else {
    // Circle reaching the middle of the box's longer sides.
    type = "radial";
    attrs = { cx: fmt(cx), cy: fmt(cy), r: fmt(Math.max(w, h) / 2) };
    stops = fill.radial.stops;
  }

  const rendered = {
    type,
    attrs,
    stops: stops.map((s) => ({ offset: fmt(Math.min(1, Math.max(0, s.offset))), color: s.color })),
  };
  // Content-addressed id: two scenes on one page can never clash, and equal ids mean equal gradients.
  const id = `${idPrefix}-${hashString(JSON.stringify(rendered)).toString(36)}`;
  return { id, ...rendered };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
const attrs = (a: Record<string, string | number>) =>
  Object.entries(a)
    .map(([k, v]) => ` ${k}="${escape(String(v))}"`)
    .join("");

/** Serializes a rendered scene to a standalone SVG string. */
export function serialize(r: RenderedScene): string {
  let defs = "";
  for (const g of r.gradients) {
    const tag = g.type === "linear" ? "linearGradient" : "radialGradient";
    defs += `<${tag}${attrs({ id: g.id, gradientUnits: "userSpaceOnUse", ...g.attrs })}>`;
    defs += g.stops.map((s) => `<stop${attrs({ offset: s.offset, "stop-color": s.color })}/>`).join("");
    defs += `</${tag}>`;
  }
  const paths = r.paths
    .map((p) => `<path${attrs({ d: p.d, fill: p.fill, ...(p.opacity === 1 ? {} : { opacity: formatNumber(p.opacity, 4) }) })}/>`)
    .join("");
  const head = attrs({
    xmlns: "http://www.w3.org/2000/svg",
    width: formatNumber(r.width),
    height: formatNumber(r.height),
    viewBox: `0 0 ${formatNumber(r.width)} ${formatNumber(r.height)}`,
    "aria-hidden": "true",
    focusable: "false",
  });
  return `<svg${head}>${defs ? `<defs>${defs}</defs>` : ""}${paths}</svg>`;
}

/** Renders a scene to an SVG string: for email, Node servers and static files. */
export function toSvg(scene: Scene, options?: RenderOptions): string {
  return serialize(render(scene, options));
}
