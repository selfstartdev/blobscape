import { describe, expect, it } from "vitest";
import { place, scene, type UserShape } from "../src";

const triangle: UserShape = { d: "M0.5 0 L1 1 L0 1 Z" };
const square: UserShape = { d: "M0 0 H1 V1 H0 Z" };

describe("scene", () => {
  it("matches place() when no placements are given", () => {
    const options = { seed: "s", height: 5000 };
    expect(scene(options).placements).toEqual(place(options).placements);
  });

  it("supports a single user shape", () => {
    const s = scene({ seed: "u", height: 4000, shapes: triangle });
    expect(new Set(s.placements.map((p) => p.shape)).size).toBe(1);
  });

  it("gives a list of user shapes equal shares", () => {
    const s = scene({ seed: "u", height: 40000, shapes: [triangle, square] });
    const tri = s.placements.filter((p) => p.shape.segments.length === 2).length;
    expect(Math.abs(tri - (s.placements.length - tri))).toBeLessThanOrEqual(s.placements.length * 0.15);
  });

  it("supports sequence picks of user shapes", () => {
    const s = scene({ seed: "u", height: 8000, shapes: { sequence: [triangle, square] } });
    s.placements.forEach((p) => expect(p.shape.segments.length).toBe(p.index % 2 === 0 ? 2 : 3));
  });

  it("explicit placements skip the positioner and fill gaps from distributions", () => {
    const s = scene({
      seed: "x",
      height: 2000,
      fill: { sequence: ["a", "b", "c"] },
      placements: [{ x: 10, y: 20, size: 700, rotation: 45, slot: 2 }, { x: 900, y: 1500 }],
    });
    expect(s.placements).toHaveLength(2);
    expect(s.placements[0]).toMatchObject({ x: 10, y: 20, size: 700, rotation: 45, slot: 2, index: 0 });
    expect(s.placements[1]).toMatchObject({ x: 900, y: 1500, slot: 1, index: 1, band: 1 });
    expect(s.placements[1]!.size).toBeGreaterThanOrEqual(600);
  });

  it("explicit placements can use their own shape", () => {
    const s = scene({ seed: "x", height: 1000, placements: [{ x: 0, y: 0, size: 100, shape: square }] });
    expect(s.placements[0]!.radius).toBeCloseTo(100 * Math.SQRT1_2, 6);
  });

  it("rejects bad input", () => {
    expect(() => scene({ seed: "x", height: 1, placements: [{ x: NaN, y: 0 }] })).toThrow(RangeError);
    expect(() => scene({ seed: "x", height: 1, placements: [{ x: 0, y: 0, slot: 3 }] })).toThrow(RangeError);
    expect(() => scene({ seed: "x", height: 1, shapes: { d: "nope" } })).toThrow(SyntaxError);
    // @ts-expect-error invalid mode
    expect(() => scene({ seed: "x", height: 1, mode: "wide" })).toThrow(RangeError);
  });
});
