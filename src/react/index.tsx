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
  const [bleedWidth, setBleedWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setMeasured((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
      // 100vw includes the vertical scrollbar; the document's client width does not.
      if (fullBleed) setBleedWidth(document.documentElement.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (fullBleed) observer.observe(document.documentElement);
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
  const rendered = useMemo(
    () => render(s, { idPrefix, containerWidth: fluid ? measured.width : s.width }),
    [s, idPrefix, fluid, measured?.width],
  );

  const layer: CSSProperties = {
    position: attach === "fixed" ? "fixed" : "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: -1,
    pointerEvents: "none",
    ...(fullBleed && attach === "scroll"
      ? { left: "50%", right: "auto", width: bleedWidth ?? "100vw", transform: "translateX(-50%)" }
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

function isDev(): boolean {
  // Bundlers replace process.env.NODE_ENV; guard for environments without `process`.
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

const warned = new WeakSet<Element>();

function warnAboutParent(el: HTMLElement | null) {
  const parent = el?.parentElement;
  if (!parent || warned.has(parent)) return;
  const cs = getComputedStyle(parent);
  const problems: string[] = [];
  if (cs.position === "static") problems.push("is not positioned (the layer will cover the wrong element)");
  const stacking = cs.isolation === "isolate" || (cs.position !== "static" && cs.zIndex !== "auto");
  if (!stacking) problems.push("has no stacking context (the layer can disappear behind backgrounds)");
  if (problems.length === 0) return;
  warned.add(parent);
  console.warn(
    `blobscape: the parent of <Blobscape> ${problems.join(" and ")}. Give it blobscapeParentStyle ` +
      `({ position: "relative", isolation: "isolate" }).`,
    parent,
  );
}
