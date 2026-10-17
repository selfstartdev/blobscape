/**
 * Golden tests: the stability promise.
 *
 * Same seed + same options + same major version = identical output. If a golden
 * file changes, the generated output changed, and that is a MAJOR release.
 * Never update these with `vitest -u` to make a failure go away; treat it as a
 * deliberate decision and record it in a changeset.
 */
import { describe, expect, it } from "vitest";
import { createRandom, fillSampler, generateShape, numberSampler, place, presets, scene, toPathData, toSvg, type PlaceOptions } from "../src";

describe("golden", () => {
  it("random streams", async () => {
    const r = createRandom("blobscape");
    const fixture = {
      next: Array.from({ length: 5 }, r.next),
      forked: [r.value("band", 0, "blob", 0, "rotation"), r.value("band", 3, "blob", 1, "size")],
    };
    await expect(JSON.stringify(fixture, null, 2) + "\n").toMatchFileSnapshot("golden/random.json");
  });

  it("shapes", async () => {
    const cases = [
      { seed: "/", points: 5, irregularity: 0, roundness: 0 },
      { seed: "/", points: 7, irregularity: 0.5, roundness: 1 },
      { seed: "/meta/2026-09-14", points: 6, irregularity: 0.4, roundness: 0 },
      { seed: "/meta/2026-09-14", points: 9, irregularity: 0.7, roundness: 0.35 },
      { seed: "relicsurge", points: 4, irregularity: 1, roundness: 0 },
      { seed: "selfstartdev", points: 8, irregularity: 1, roundness: 1 },
    ];
    const fixture = cases.map(({ seed, ...options }) => {
      const shape = generateShape(options, seed);
      return {
        seed,
        options,
        radius: Number(shape.radius.toFixed(6)),
        // At 1000px with a 30° rotation, the way the renderer will use it.
        d: toPathData(shape, { scale: 1000, rotation: 30 }),
      };
    });
    await expect(JSON.stringify(fixture, null, 2) + "\n").toMatchFileSnapshot("golden/shapes.json");
  });

  it("distributions", async () => {
    const root = createRandom("/meta/2026-09-14");
    const indexes = Array.from({ length: 20 }, (_, i) => i);
    const numbers = (dist: Parameters<typeof numberSampler>[0], key: string) =>
      indexes.map(numberSampler(dist, root.fork(key))).map((v) => Number(v.toFixed(6)));
    const slots = (dist: Parameters<typeof fillSampler>[0], key: string) => indexes.map(fillSampler(dist, root.fork(key)).slot);
    const fixture = {
      random: numbers({ random: [600, 1200] }, "size"),
      even: numbers({ even: [0, 360] }, "rotation"),
      evenGroup5: numbers({ even: [0.2, 0.7], groupSize: 5 }, "irregularity"),
      weighted: slots({ weighted: ["a", "b", "c"], weights: [2, 1, 1] }, "fill"),
      evenFill: slots({ even: ["a", "b", "c"] }, "fill"),
      sequence: slots({ sequence: ["a", "b"] }, "fill"),
    };
    await expect(JSON.stringify(fixture, null, 2) + "\n").toMatchFileSnapshot("golden/distributions.json");
  });

  it("placements", async () => {
    const round = (n: number) => Number(n.toFixed(2));
    const layouts = ([
      { seed: "/", height: 6400 },
      { seed: "/meta/2026-09-14", height: 3000, width: 1200, fill: { sequence: ["#fde4ec", "#eef0fb"] } },
      { seed: "relicsurge", height: 5000, shapes: { roundness: 0, points: { even: [4, 7] } }, layout: { density: 2 } },
    ] satisfies PlaceOptions[]).map((options) => ({
      options,
      placements: place(options).placements.map((p) => ({
        index: p.index,
        band: p.band,
        x: round(p.x),
        y: round(p.y),
        size: round(p.size),
        rotation: round(p.rotation),
        opacity: round(p.opacity),
        slot: p.slot,
        radius: round(p.radius),
      })),
    }));
    await expect(JSON.stringify(layouts, null, 2) + "\n").toMatchFileSnapshot("golden/placements.json");
  });

  it.each([
    ["default", { seed: "/", height: 4000 }],
    [
      "relicsurge",
      { seed: "/meta/2026-09-14", height: 5000, shapes: { roundness: 0, points: { even: [4, 7] } }, fill: { sequence: ["#fde4ec", "#eef0fb"] } },
    ],
    [
      "gradients",
      {
        seed: "gradients",
        height: 3000,
        fill: {
          even: [
            { linear: { angle: 135, stops: [{ offset: 0, color: "#f7c873" }, { offset: 1, color: "#f08a6c" }] } },
            { radial: { stops: [{ offset: 0, color: "#9fb1f2" }, { offset: 1, color: "#eef0fb" }] } },
          ],
        },
      },
    ],
    ["user-shapes", { seed: "user", height: 3000, shapes: [{ d: "M0.5 0 L1 1 L0 1 Z" }, { d: "M0 0.5a.5.5 0 011 0a.5.5 0 01-1 0z" }] }],
  ] satisfies [string, Parameters<typeof scene>[0]][])("svg: %s", async (name, options) => {
    await expect(toSvg(scene(options)) + "\n").toMatchFileSnapshot(`golden/svg/${name}.svg`);
  });

  it.each(Object.keys(presets) as (keyof typeof presets)[])("preset: %s", async (name) => {
    await expect(toSvg(scene({ seed: "/preset", height: 3000, ...presets[name] })) + "\n").toMatchFileSnapshot(
      `golden/presets/${name}.svg`,
    );
  });
});
