import { describe, expect, it } from "vitest";
import { createRandom, fillSampler, numberSampler, type FillDist, type NumberDist } from "../src";

const rng = () => createRandom("dist").fork("prop");
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const sampleNumbers = (dist: NumberDist, n: number) => range(n).map(numberSampler(dist, rng()));
const sampleSlots = (dist: FillDist, n: number) => range(n).map(fillSampler(dist, rng()).slot);
const counts = (xs: number[]) => xs.reduce<Record<number, number>>((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {});

describe("numberSampler", () => {
  it("fixed returns the value", () => {
    expect(sampleNumbers(42, 5)).toEqual([42, 42, 42, 42, 42]);
  });

  it("random stays in range", () => {
    for (const v of sampleNumbers({ random: [10, 20] }, 500)) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it("even puts exactly one value in each slice of every full group", () => {
    const values = sampleNumbers({ even: [0, 80], groupSize: 8 }, 64);
    for (let g = 0; g < 8; g++) {
      const slices = values.slice(g * 8, g * 8 + 8).map((v) => Math.floor(v / 10)).sort((a, b) => a - b);
      expect(slices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("even uses the default group size of 8", () => {
    const slices = sampleNumbers({ even: [0, 8] }, 8).map(Math.floor).sort((a, b) => a - b);
    expect(slices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("even is shuffled, not ascending", () => {
    const values = sampleNumbers({ even: [0, 1], groupSize: 8 }, 8);
    expect(values).not.toEqual([...values].sort((a, b) => a - b));
  });

  it.each<NumberDist>([{ random: [0, 1] }, { even: [0, 1], groupSize: 5 }])(
    "a blob's value does not depend on how many blobs follow (%j)",
    (dist) => {
      const short = sampleNumbers(dist, 13);
      const long = sampleNumbers(dist, 100);
      expect(long.slice(0, 13)).toEqual(short);
    },
  );

  it("rejects bad input", () => {
    expect(() => numberSampler(NaN, rng())).toThrow(RangeError);
    expect(() => numberSampler({ random: [0, Infinity] }, rng())).toThrow(RangeError);
    expect(() => numberSampler({ even: [0, 1], groupSize: 0 }, rng())).toThrow(RangeError);
    expect(() => numberSampler({ even: [0, 1], groupSize: 2.5 }, rng())).toThrow(RangeError);
  });
});

describe("fillSampler", () => {
  it("single fill always uses slot 0", () => {
    const s = fillSampler("#fff", rng());
    expect(s.palette).toEqual(["#fff"]);
    expect(range(5).map(s.slot)).toEqual([0, 0, 0, 0, 0]);
  });

  it("a gradient is a single fill", () => {
    const gradient = { linear: { angle: 90, stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#000" }] } };
    expect(fillSampler(gradient, rng()).palette).toEqual([gradient]);
  });

  it("sequence cycles top to bottom", () => {
    expect(sampleSlots({ sequence: ["a", "b", "c"] }, 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it("even gives each fill an equal share per group", () => {
    // 3 fills → default group size 9 (smallest multiple of 3 that is ≥ 8).
    const slots = sampleSlots({ even: ["a", "b", "c"] }, 27);
    for (let g = 0; g < 3; g++) expect(counts(slots.slice(g * 9, g * 9 + 9))).toEqual({ 0: 3, 1: 3, 2: 3 });
  });

  it("weighted respects weights", () => {
    const slots = sampleSlots({ weighted: ["a", "b", "c"], weights: [3, 1, 0] }, 4000);
    const c = counts(slots);
    expect(c[2]).toBeUndefined();
    expect(c[0]! / c[1]!).toBeGreaterThan(2.5);
    expect(c[0]! / c[1]!).toBeLessThan(3.5);
  });

  it("weighted defaults to equal weights", () => {
    const c = counts(sampleSlots({ weighted: ["a", "b"] }, 4000));
    expect(c[0]! / 4000).toBeGreaterThan(0.45);
    expect(c[0]! / 4000).toBeLessThan(0.55);
  });

  it("changing the colors never changes the slots", () => {
    const a = sampleSlots({ even: ["#111", "#222"] }, 40);
    const b = sampleSlots({ even: ["red", { radial: { stops: [{ offset: 0, color: "blue" }] } }] }, 40);
    expect(b).toEqual(a);
  });

  it("rejects bad input", () => {
    expect(() => fillSampler({ sequence: [] }, rng())).toThrow(RangeError);
    expect(() => fillSampler("  ", rng())).toThrow(RangeError);
    expect(() => fillSampler({ weighted: ["a", "b"], weights: [1] }, rng())).toThrow(RangeError);
    expect(() => fillSampler({ weighted: ["a"], weights: [0] }, rng())).toThrow(RangeError);
    expect(() => fillSampler({ radial: { stops: [] } }, rng())).toThrow(RangeError);
  });
});
