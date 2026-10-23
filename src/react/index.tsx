"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { render, scene, type SceneOptions } from "blobscape";

// Everything in the core is also available from "blobscape/react", including blobscapeParentStyle
// (though server components should import that from "blobscape"; see src/parent.ts).
export * from "blobscape";

export interface BlobscapeProps extends Omit<SceneOptions, "height"> {
  /**
   * "scroll" (default): the layer covers its parent and scrolls with the page.
   * "fixed": the layer is pinned to the viewport.
   */
  attach?: "scroll" | "fixed";
  /** Break out of the parent's width to the full viewport width (the parent's height is kept). */
  fullBleed?: boolean;
  /**
   * Height rendered on the server and on the first client render, before the
   * layer is measured. Default 4000. Taller content adds blobs below after mount.
   */
  initialHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_INITIAL_HEIGHT = 4000;

interface Size {
  width: number;
  height: number;
}

/**
 * A decorative layer of blobs behind its parent's content.
 *
 * Place it inside the element it should sit behind; give that element
 * `blobscapeParentStyle` (position: relative; isolation: isolate).
 */
export function Blobscape({ attach = "scroll", fullBleed = false, initialHeight = DEFAULT_INITIAL_HEIGHT, className, style, ...options }: BlobscapeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const idPrefix = "blobscape" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // Unmeasured until mount, so server and first client render match exactly.
  const [measured, setMeasured] = useState<Size | null>(null);
  const [bleed, setBleed] = useState<Bleed | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // The layout size: getBoundingClientRect includes transforms (an entrance animation's scale), and
      // ResizeObserver doesn't fire again when only the transform changes, so a skewed size would stick.
      const next = { width: el.offsetWidth, height: el.offsetHeight };
      setMeasured((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
      if (fullBleed) {
        const next = bleedBox(el);
        setBleed((prev) => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (fullBleed) {
      observer.observe(document.documentElement);
      // The containing block can move sideways without the layer or the page resizing.
      if (el.offsetParent) observer.observe(el.offsetParent);
    }
    return () => observer.disconnect();
  }, [fullBleed]);

  useEffect(() => {
    if (isDev() && attach === "scroll") warnAboutParent(ref.current);
  }, [attach]);

  // Options are plain data, so a serialized key keeps inline objects from rebuilding the scene every render.
  const optionsKey = JSON.stringify(options);
  const height = measured?.height ?? initialHeight;
  const s = useMemo(() => scene({ ...options, height }), [optionsKey, height]);
  const fluid = s.mode === "fluid" && measured !== null;
  // Fixed mode ignores the measured width, so a width-only resize must not re-render every path.
  const containerWidth = fluid ? measured.width : s.width;
  const rendered = useMemo(() => render(s, { idPrefix, containerWidth }), [s, idPrefix, containerWidth]);

  const layer: CSSProperties = {
    position: attach === "fixed" ? "fixed" : "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: -1,
    pointerEvents: "none",
    // Before measuring (and on the server), centering on the parent is right for the usual centered column.
    ...(fullBleed && attach === "scroll"
      ? bleed
        ? { left: bleed.left, right: "auto", width: bleed.width }
        : { left: "50%", right: "auto", width: "100vw", transform: "translateX(-50%)" }
      : {}),
    ...style,
  };

  // Fixed width mode: the canvas keeps its width and is centered, so narrow screens crop both sides.
  // Fluid mode (after measuring): the SVG matches the layer and x positions are already scaled.
  // overflow: visible lets blobs run past the canvas edges on screens wider than
  // the canvas; the layer is what clips.
  const svgStyle: CSSProperties = fluid
    ? { position: "absolute", top: 0, left: 0, display: "block", overflow: "visible" }
    : { position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", display: "block", overflow: "visible" };

  return (
    <div ref={ref} aria-hidden="true" className={className} style={layer} data-blobscape="">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={rendered.width}
        height={rendered.height}
        viewBox={`0 0 ${rendered.width} ${rendered.height}`}
        focusable="false"
        style={svgStyle}
      >
        {rendered.gradients.length > 0 && (
          <defs>
            {rendered.gradients.map((g) => {
              const Tag = g.type === "linear" ? "linearGradient" : "radialGradient";
              return (
                <Tag key={g.id} id={g.id} gradientUnits="userSpaceOnUse" {...g.attrs}>
                  {g.stops.map((stop, i) => <stop key={i} offset={stop.offset} stopColor={stop.color} />)}
                </Tag>
              );
            })}
          </defs>
        )}
        {rendered.paths.map((p) => (
          <path key={p.key} d={p.d} fill={p.fill} opacity={p.opacity === 1 ? undefined : p.opacity} />
        ))}
      </svg>
    </div>
  );
}

interface Bleed {
  /** The layer's left, in px from its containing block's padding edge. */
  left: number;
  width: number;
}

/** Where the layer must sit to span the viewport, whatever the parent's horizontal position. */
function bleedBox(el: HTMLElement): Bleed {
  const block = el.offsetParent ?? document.documentElement;
  // The padding edge, which is what `left` is measured from, in page coordinates.
  const edge = block.getBoundingClientRect().left + block.clientLeft + window.scrollX;
  // 100vw includes the vertical scrollbar; the document's client width does not.
  return { left: Math.round(-edge), width: document.documentElement.clientWidth };
}

function isDev(): boolean {
  // Written out in full so bundlers can replace it. Where nothing did and there's no `process`
  // (Vite and other browser builds), reading it throws: that's development too.
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

const warned = new WeakSet<Element>();

function warnAboutParent(el: HTMLElement | null) {
  const parent = el?.parentElement;
  if (!parent || warned.has(parent)) return;
  const cs = getComputedStyle(parent);
  const problems: string[] = [];
  if (cs.position === "static") problems.push("is not positioned (the layer will cover the wrong element)");
  if (!formsStackingContext(parent, cs)) problems.push("has no stacking context (the layer can disappear behind backgrounds)");
  if (problems.length === 0) return;
  warned.add(parent);
  console.warn(
    `blobscape: the parent of <Blobscape> ${problems.join(" and ")}. Give it blobscapeParentStyle ` +
      `({ position: "relative", isolation: "isolate" }).`,
    parent,
  );
}

/** The common ways an element forms a stacking context (CSS Positioned Layout, plus the properties that force one). */
function formsStackingContext(el: Element, cs: CSSStyleDeclaration): boolean {
  const value = (prop: string) => cs.getPropertyValue(prop).trim();
  if (value("isolation") === "isolate") return true;
  if (cs.position === "fixed" || cs.position === "sticky") return true;
  if (cs.zIndex !== "auto" && cs.zIndex !== "") {
    if (cs.position !== "static") return true;
    // Flex and grid items take z-index without being positioned.
    const outer = el.parentElement && getComputedStyle(el.parentElement).display;
    if (outer && /flex|grid/.test(outer)) return true;
  }
  if (cs.opacity !== "" && Number(cs.opacity) < 1) return true;
  for (const prop of ["transform", "translate", "rotate", "scale", "filter", "backdrop-filter", "perspective", "clip-path", "mask", "mask-image"]) {
    const v = value(prop);
    if (v !== "" && v !== "none") return true;
  }
  const blend = value("mix-blend-mode");
  if (blend !== "" && blend !== "normal") return true;
  if (/\b(layout|paint|strict|content)\b/.test(value("contain"))) return true;
  if (/size/.test(value("container-type"))) return true;
  return /\b(transform|translate|rotate|scale|opacity|filter|isolation|z-index|perspective|clip-path|mask)\b/.test(value("will-change"));
}
