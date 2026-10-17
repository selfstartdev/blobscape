import { describe, expect, it } from "vitest";
import { place, toContainerX, type Placement, type PlaceOptions } from "../src";

const SEEDS = ["/", "/meta/2026-09-14", "relicsurge", "a", "b"];

function pairs(ps: Placement[]): [Placement, Placement][] {
  const out: [Placement, Placement][] = [];
  for (let i = 0; i < ps.length; i++) for (let j = 0; j < i; j++) out.push([ps[i]!, ps[j]!]);
  return out;
}


describe("place", () => {
  it("is deterministic", () => {
    expect(place({ seed: "x", height: 5000 })).toEqual(place({ seed: "x", height: 5000 }));
  });

  it.each<Partial<PlaceOptions>>([
    {},
    { layout: { density: 3 } },
    { layout: { density: 0 } },
    { size: { random: [200, 400] }, layout: { minDistance: 300, minGap: 50, density: 4 } },
    { width: 800, size: { even: [300, 1500] } },
  ])("never breaks minDistance or minGap (%j)", (opts) => {
    for (const seed of SEEDS) {
      const { placements } = place({ seed, height: 12000, ...opts });
      const minDistance = opts.layout?.minDistance ?? 600;
      const minGap = opts.layout?.minGap ?? 150;
      for (const [a, b] of pairs(placements)) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThanOrEqual(minDistance);
        expect(d - a.radius - b.radius).toBeGreaterThanOrEqual(minGap);
      }
    }
  });

  it("orders placements top to bottom with increasing index", () => {
    const { placements } = place({ seed: "order", height: 20000 });
    for (let i = 1; i < placements.length; i++) {
      expect(placements[i]!.y).toBeGreaterThanOrEqual(placements[i - 1]!.y);
      expect(placements[i]!.index).toBeGreaterThan(placements[i - 1]!.index);
    }
  });

  it("growing the page only adds blobs below; nothing moves", () => {
    for (const seed of SEEDS) {
      const short = place({ seed, height: 3000 }).placements;
      const long = place({ seed, height: 15000 }).placements;
      const byIndex = new Map(long.map((p) => [p.index, p]));
      for (const p of short) expect(byIndex.get(p.index)).toEqual(p);
      // Everything new in the long layout is lower than the short layout's cut.
      const shortIndexes = new Set(short.map((p) => p.index));
      for (const p of long) if (!shortIndexes.has(p.index)) expect(p.y - p.radius).toBeGreaterThanOrEqual(3000 - 1e-9);
    }
  });

  it("includes every blob that reaches into the page, and no others", () => {
    const { placements } = place({ seed: "edge", height: 4321 });
    for (const p of placements) expect(p.y - p.radius).toBeLessThan(4321);
    const longer = place({ seed: "edge", height: 20000 }).placements;
    const missing = longer.filter((p) => p.y - p.radius < 4321 && !placements.some((q) => q.index === p.index));
    expect(missing).toEqual([]);
  });

  it("hits the default density target (~1.25 per 1000px)", () => {
    const height = 40000;
    const perK = SEEDS.map((seed) => place({ seed, height }).placements.filter((p) => p.y < height).length / (height / 1000));
    const mean = perK.reduce((a, b) => a + b, 0) / perK.length;
    expect(mean).toBeGreaterThan(1.1);
    expect(mean).toBeLessThan(1.4);
  });

  it("keeps typical spacing well above the minimums", () => {
    const { placements } = place({ seed: "spacing", height: 40000 });
    const nearest = placements.map((p) =>
      Math.min(...placements.filter((q) => q !== p).map((q) => Math.hypot(p.x - q.x, p.y - q.y) - p.radius - q.radius)),
    );
    const median = [...nearest].sort((a, b) => a - b)[Math.floor(nearest.length / 2)]!;
    expect(median).toBeGreaterThan(150 * 1.5);
  });

  it("ties each blob's properties to its index, not its position", () => {
    // Changing spacing moves blobs, but blob #k keeps the same size, shape and colour.
    const a = place({ seed: "props", height: 8000, fill: { sequence: ["r", "g", "b"] } }).placements;
    const b = place({ seed: "props", height: 8000, fill: { sequence: ["r", "g", "b"] }, layout: { minGap: 400 } }).placements;
    for (const p of b) {
      const q = a.find((x) => x.index === p.index);
      if (!q) continue;
      expect([p.size, p.rotation, p.slot, p.shape]).toEqual([q.size, q.rotation, q.slot, q.shape]);
    }
    expect(b.map((p) => p.slot)).toEqual(b.map((p) => p.index % 3));
  });

  it("keeps blob centers on the canvas", () => {
    for (const p of place({ seed: "bounds", height: 10000, width: 1000 }).placements) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(1000);
    }
  });

  it("covers height 0 with an empty or edge-only layout", () => {
    for (const p of place({ seed: "zero", height: 0 }).placements) expect(p.y - p.radius).toBeLessThan(0);
  });

  it("rejects bad options", () => {
    expect(() => place({ seed: "x", height: -1 })).toThrow(RangeError);
    expect(() => place({ seed: "x", height: 100, width: 0 })).toThrow(RangeError);
    expect(() => place({ seed: "x", height: 100, layout: { minGap: NaN } })).toThrow(RangeError);
    expect(() => place({ seed: "x", height: 100, size: 0 })).toThrow(RangeError);
  });

});

describe("toContainerX", () => {
  it("fixed centers the canvas and crops both sides equally", () => {
    expect(toContainerX(720, 1440, 1000, "fixed")).toBe(500);
    expect(toContainerX(0, 1440, 1000, "fixed")).toBe(-220);
    expect(toContainerX(1440, 1440, 1000, "fixed")).toBe(1220);
  });

  it("fluid scales x with the container", () => {
    expect(toContainerX(720, 1440, 1000, "fluid")).toBe(500);
    expect(toContainerX(1440, 1440, 720, "fluid")).toBe(720);
  });
});
