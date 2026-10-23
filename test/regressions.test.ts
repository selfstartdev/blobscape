// Inputs from the code review that once hung, crashed, or gave wrong output.
import { describe, expect, it } from "vitest";
import { createRandom, fillSampler, parsePath, place, presets, scene, userShape, type UserShape } from "../src";

describe("path numbers out of range", () => {
  it("rejects a literal that overflows to Infinity", () => {
    // Its radius was Infinity, so place() generated bands forever.
    expect(() => parsePath("M0 0 L1e400 0 L1 1 Z")).toThrow(RangeError);
  });

  it("rejects relative coordinates that add up past the largest number", () => {
    expect(() => userShape({ d: "M0 0 l1e308 0 l1e308 0 l0 1 Z" })).toThrow(RangeError);
  });
});

describe("single-curve shapes", () => {
  it.each(["M0 0 Q1 1 2 0 Z", "M0 0 C1 1 -1 1 0 0 Z"])("accepts %s", (d) => {
    expect(parsePath(d).segments).toHaveLength(1);
  });

  it("still rejects a single straight edge", () => {
    expect(() => parsePath("M0 0 L1 1 Z")).toThrow(SyntaxError);
  });
});

describe("layout options", () => {
  it("keeps the default for a key passed as undefined", () => {
    const layout = { density: undefined, minGap: undefined, minDistance: undefined, bandHeight: undefined };
    expect(place({ seed: "l", height: 4000, layout }).placements).toEqual(place({ seed: "l", height: 4000 }).placements);
  });

  it.each([
    ["confetti", presets.confetti, 100],
    ["the defaults", {}, 5],
  ] as const)("density 0 is at least as dense as a high density (%s)", (_, preset, high) => {
    const count = (density: number) =>
      place({ ...preset, seed: "dense", height: 10000, layout: { ...("layout" in preset ? preset.layout : {}), density } }).placements.length;
    expect(count(0)).toBeGreaterThanOrEqual(count(high));
  });
});

describe("size distributions", () => {
  it.each([{ random: [0, 600] as [number, number] }, { even: [0, 600] as [number, number] }, { random: [-100, 600] as [number, number] }])(
    "rejects %j on every seed, not only unlucky ones",
    (size) => {
      expect(() => place({ seed: "any", height: 1000, size })).toThrow(RangeError);
    },
  );
});

describe("even choices with a groupSize", () => {
  it("gives every item an equal share when groupSize is not a multiple of the item count", () => {
    const { slot } = fillSampler({ even: ["#a", "#b", "#c"], groupSize: 5 }, createRandom("g").fork("fill"));
    const counts = [0, 0, 0];
    for (let i = 0; i < 9000; i++) counts[slot(i)]!++;
    expect(counts).toEqual([3000, 3000, 3000]);
  });
});

describe("explicit placements", () => {
  const at = [{ x: 10, y: 10 }];

  it("validates width, height and bandHeight like place() does", () => {
    expect(() => scene({ seed: "p", height: 1000, width: 0, mode: "fluid", placements: at })).toThrow(RangeError);
    expect(() => scene({ seed: "p", height: undefined as unknown as number, placements: at })).toThrow(RangeError);
    expect(() => scene({ seed: "p", height: 1000, layout: { bandHeight: 0 }, placements: at })).toThrow(RangeError);
  });

  it.each([{ size: NaN }, { size: -100 }, { size: 0 }, { opacity: NaN }, { rotation: Infinity }])("rejects %j", (override) => {
    expect(() => scene({ seed: "p", height: 1000, placements: [{ x: 10, y: 10, ...override }] })).toThrow(RangeError);
  });

  it("parses a shape shared by several placements once", () => {
    const icon: UserShape = { d: "M0.5 0 L1 1 L0 1 Z" };
    const s = scene({ seed: "p", height: 1000, placements: [0, 1, 2].map((i) => ({ x: 100 * i, y: 100, shape: icon })) });
    expect(new Set(s.placements.map((p) => p.shape)).size).toBe(1);
  });

  it("matches the sampled blob when nothing is overridden", () => {
    const sampled = scene({ seed: "p", height: 1000, placements: [{ x: 0, y: 0 }] }).placements[0]!;
    const auto = place({ seed: "p", height: 1000 });
    // Sizes, shapes and rotations are keyed by index, so blob 0 matches whichever mode built it.
    expect(sampled.size).toBe(auto.placements[0]!.size);
    expect(sampled.shape).toEqual(auto.placements[0]!.shape);
    expect(sampled.rotation).toBe(auto.placements[0]!.rotation);
  });
});
