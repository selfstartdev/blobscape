import { describe, expect, it } from "vitest";
import { bounds, generateShape } from "../src";

const count = (shape: ReturnType<typeof generateShape>, type: "L" | "Q") =>
  shape.segments.filter((s) => s.type === type).length;

describe("generateShape", () => {
  it("is deterministic for a seed", () => {
    expect(generateShape({}, "x")).toEqual(generateShape({}, "x"));
  });

  it("roundness 0 is a polygon with one vertex per point", () => {
    const s = generateShape({ points: 6, roundness: 0 }, "x");
    expect(count(s, "Q")).toBe(0);
    expect(s.segments).toHaveLength(5); // closing edge comes from Z
  });

  it("roundness 1 is fully curved", () => {
    const s = generateShape({ points: 6, roundness: 1 }, "x");
    expect(count(s, "Q")).toBe(6);
    expect(count(s, "L")).toBe(0);
  });

  it("roundness between 0 and 1 mixes corners and straight runs", () => {
    const s = generateShape({ points: 6, roundness: 0.5 }, "x");
    expect(count(s, "Q")).toBe(6);
    expect(count(s, "L")).toBe(5);
  });

  it("irregularity 0 gives a regular polygon", () => {
    const s = generateShape({ points: 5, irregularity: 0, roundness: 0 }, "x");
    const pts = [s.start, ...s.segments.map((seg) => seg.to)];
    const sides = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    for (const side of sides) expect(side).toBeCloseTo(sides[0]!, 9);
  });

  it.each([
    [3, 0, 0], [5, 1, 0], [8, 0.5, 0.5], [12, 1, 1], [4, 0.3, 1],
  ])("fits a centered unit box (points %i, irregularity %f, roundness %f)", (points, irregularity, roundness) => {
    for (const seed of ["a", "b", "c", "d"]) {
      const s = generateShape({ points, irregularity, roundness }, seed);
      const b = bounds(s);
      expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeCloseTo(1, 9);
      expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 9);
      expect((b.minY + b.maxY) / 2).toBeCloseTo(0, 9);
      expect(s.radius).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(s.radius).toBeLessThanOrEqual(Math.SQRT1_2 + 1e-9);
    }
  });

  it("clamps out-of-range settings and enforces at least 3 points", () => {
    expect(generateShape({ points: 1, irregularity: 5, roundness: -1 }, "x")).toEqual(
      generateShape({ points: 3, irregularity: 1, roundness: 0 }, "x"),
    );
  });

  it("rejects non-finite settings", () => {
    expect(() => generateShape({ points: NaN })).toThrow(RangeError);
    expect(() => generateShape({ roundness: Infinity })).toThrow(RangeError);
  });
});
