import { describe, expect, it } from "vitest";
import { bounds, parsePath, render, scene, toSvg, type Fill } from "../src";

// True on-screen bounds of a rendered path (control points excluded).
const pathBounds = (d: string) => bounds(parsePath(d));

const linear: Fill = { linear: { angle: 180, stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#000" }] } };

describe("toSvg", () => {
  it("is one <svg> with one <path> per blob and no transforms", () => {
    const s = scene({ seed: "svg", height: 5000 });
    const svg = toSvg(s);
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(svg.match(/<path/g)).toHaveLength(s.placements.length);
    expect(svg).not.toContain("transform");
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('viewBox="0 0 1440 5000"');
  });

  it("is deterministic", () => {
    expect(toSvg(scene({ seed: "d", height: 3000 }))).toBe(toSvg(scene({ seed: "d", height: 3000 })));
  });

  it("rounds coordinates to 2 decimals", () => {
    const numbers = toSvg(scene({ seed: "r", height: 3000 })).match(/-?\d+\.\d+/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) expect(n.split(".")[1]!.length).toBeLessThanOrEqual(4); // 4 only for opacity
  });

  it("writes the default opacity and currentColor fill", () => {
    const svg = toSvg(scene({ seed: "o", height: 2000 }));
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('opacity="0.4"');
  });

  it("escapes attribute values", () => {
    const svg = toSvg(scene({ seed: "e", height: 2000, fill: 'url("x")&<' }));
    expect(svg).toContain('fill="url(&quot;x&quot;)&amp;&lt;"');
  });
});

describe("gradients", () => {
  it("stay upright however the blob is rotated", () => {
    for (const rotation of [0, 37, 90, 211]) {
      const r = render(scene({ seed: "g", height: 1, fill: linear, placements: [{ x: 500, y: 500, size: 800, rotation }] }));
      const g = r.gradients[0]!;
      // angle 180 = top to bottom: the gradient line is vertical in screen space.
      expect(g.attrs.x1).toBe(g.attrs.x2);
      expect(Number(g.attrs.y2)).toBeGreaterThan(Number(g.attrs.y1));
    }
  });

  it("span the blob's on-screen bounding box", () => {
    const r = render(scene({ seed: "g", height: 1, fill: linear, placements: [{ x: 500, y: 500, size: 800, rotation: 0 }] }));
    const b = pathBounds(r.paths[0]!.d);
    const g = r.gradients[0]!;
    expect(Number(g.attrs.y1)).toBeCloseTo(b.minY, 1);
    expect(Number(g.attrs.y2)).toBeCloseTo(b.maxY, 1);
  });

  it("use userSpaceOnUse and reference ids that exist", () => {
    const svg = toSvg(scene({ seed: "ids", height: 4000, fill: { even: ["#abc", linear, { radial: { stops: [{ offset: 0, color: "red" }] } }] } }));
    expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    const ids = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ids.has(ref)).toBe(true);
  });

  it("get ids that differ when the gradient differs, even with the same seed", () => {
    const a = render(scene({ seed: "same", height: 1, fill: linear, placements: [{ x: 0, y: 0, size: 500 }] }));
    const other: Fill = { linear: { angle: 0, stops: [{ offset: 0, color: "red" }] } };
    const b = render(scene({ seed: "same", height: 1, fill: other, placements: [{ x: 0, y: 0, size: 500 }] }));
    expect(a.gradients[0]!.id).not.toBe(b.gradients[0]!.id);
  });

  it("honour idPrefix", () => {
    const r = render(scene({ seed: "p", height: 1, fill: linear, placements: [{ x: 0, y: 0 }] }), { idPrefix: ":r1:" });
    expect(r.gradients[0]!.id.startsWith(":r1:-")).toBe(true);
  });
});

describe("width modes", () => {
  // A square centered on its placement point, so the path's center is the blob's x.
  const square = { d: "M0 0 H1 V1 H0 Z" };
  const base = { seed: "w", height: 1, placements: [{ x: 720, y: 100, size: 100, rotation: 0, shape: square }] };
  const centerX = (svg: string) => {
    const b = pathBounds(svg.match(/d="([^"]+)"/)![1]!);
    return (b.minX + b.maxX) / 2;
  };

  it("fixed centers the canvas in a narrower container", () => {
    const svg = toSvg(scene({ ...base, mode: "fixed" }), { containerWidth: 1000 });
    expect(svg).toContain('width="1000"');
    expect(centerX(svg)).toBeCloseTo(500, 0);
  });

  it("fluid scales x to the container", () => {
    const s = scene({ ...base, mode: "fluid", placements: [{ x: 1440, y: 100, size: 100, rotation: 0, shape: square }] });
    expect(centerX(toSvg(s, { containerWidth: 720 }))).toBeCloseTo(720, 0);
  });
});
