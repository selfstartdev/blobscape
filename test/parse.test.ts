import { describe, expect, it } from "vitest";
import { bounds, formatPath, parsePath, userShape } from "../src";

describe("parsePath", () => {
  it("parses absolute lines and drops the explicit closing segment", () => {
    const o = parsePath("M0 0 L1 0 L1 1 L0 0 Z");
    expect(o.start).toEqual({ x: 0, y: 0 });
    expect(o.segments.map((s) => s.to)).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }]);
  });

  it("handles relative commands, H/V, and implicit L after M", () => {
    const o = parsePath("m1 1 1 0 v1 h-1 z");
    expect(formatPath(o)).toBe("M1 1L2 1L2 2L1 2Z");
  });

  it("handles compact number syntax", () => {
    expect(formatPath(parsePath("M0,0L.5-.5L1e0 0z"))).toBe("M0 0L0.5 -0.5L1 0Z");
  });

  it("converts S and T using reflected control points", () => {
    const o = parsePath("M0 0 C0 1 1 1 1 0 S2 -1 2 0 Q2.5 1 3 0 T4 0 Z");
    expect(o.segments.map((s) => s.type)).toEqual(["C", "C", "Q", "Q"]);
    const s = o.segments[1]!;
    expect(s.type === "C" && s.c1).toEqual({ x: 1, y: -1 });
    const t = o.segments[3]!;
    expect(t.type === "Q" && t.control).toEqual({ x: 3.5, y: -1 });
  });

  it("converts arcs to cubics that trace the ellipse", () => {
    const o = parsePath("M0 0.5 A0.5 0.5 0 0 1 1 0.5 A0.5 0.5 0 0 1 0 0.5 Z");
    expect(o.segments.every((s) => s.type === "C")).toBe(true);
    const b = bounds(o);
    expect(b.minX).toBeCloseTo(0, 3);
    expect(b.maxX).toBeCloseTo(1, 3);
    expect(b.minY).toBeCloseTo(0, 3);
    expect(b.maxY).toBeCloseTo(1, 3);
  });

  it("reads arc flags written without separators", () => {
    expect(() => parsePath("M0 0.5a.5.5 0 011 0a.5.5 0 01-1 0z")).not.toThrow();
  });

  it("rejects multiple subpaths and junk", () => {
    expect(() => parsePath("M0 0 L1 0 L1 1 Z M2 2 L3 2 L3 3 Z")).toThrow(/single closed path/);
    expect(() => parsePath("L1 1")).toThrow(SyntaxError);
    expect(() => parsePath("M0 0 L1 0 X")).toThrow(SyntaxError);
    expect(() => parsePath("M0 0 L1")).toThrow(SyntaxError);
    expect(() => parsePath("M0 0 L1 1 Z")).toThrow(/at least 3 points/);
  });
});

describe("userShape", () => {
  it("maps a 0–1 box onto the unit box centered on the origin", () => {
    const s = userShape({ d: "M0 0 L1 0 L1 1 L0 1 Z" });
    expect(bounds(s)).toEqual({ minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 });
    expect(s.radius).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it("respects a custom viewBox, keeping the shape's place inside it", () => {
    const s = userShape({ d: "M12 2 L22 12 L12 22 L2 12 Z", viewBox: [0, 0, 24, 24] });
    const b = bounds(s);
    expect(b.minX).toBeCloseTo(-10 / 24, 9);
    expect(b.maxX).toBeCloseTo(10 / 24, 9);
  });

  it("rejects a bad viewBox", () => {
    expect(() => userShape({ d: "M0 0 L1 0 L1 1 Z", viewBox: [0, 0, 0, 1] })).toThrow(RangeError);
  });
});
