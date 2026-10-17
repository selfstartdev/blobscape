import { describe, expect, it } from "vitest";
import { createRandom } from "../src";

const take = (n: number, next: () => number) => Array.from({ length: n }, next);

describe("createRandom", () => {
  it("is deterministic for a seed", () => {
    expect(take(5, createRandom("seed").next)).toEqual(take(5, createRandom("seed").next));
  });

  it("differs between seeds", () => {
    expect(createRandom("a").next()).not.toEqual(createRandom("b").next());
  });

  it("returns floats in [0, 1)", () => {
    for (const v of take(10_000, createRandom("range").next)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int is inclusive and covers the range", () => {
    const r = createRandom("int");
    const seen = new Set(take(1000, () => r.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it("forking does not consume the parent stream", () => {
    const a = createRandom("s");
    const b = createRandom("s");
    a.fork("x").next();
    a.value("y");
    expect(a.next()).toEqual(b.next());
  });

  it("sub-streams are independent of sibling order and count", () => {
    const r = createRandom("s");
    const direct = r.value("blob", 5, "rotation");
    for (let i = 0; i < 5; i++) r.value("blob", i, "rotation");
    expect(r.value("blob", 5, "rotation")).toEqual(direct);
    expect(r.fork("blob", 5).value("rotation")).toEqual(direct);
  });

  it("key parts cannot collide through separators in the seed", () => {
    expect(createRandom("a/b").next()).not.toEqual(createRandom("a").fork("b").next());
  });
});
