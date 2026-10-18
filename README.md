# blobscape

Seeded, organic background shapes for the web. Same page, same blobs, every time.

blobscape scatters large, soft shapes behind a page. The layout comes from a seed, usually the URL path, so each page keeps its own blobs on every visit, and the server and the browser draw exactly the same thing. Longer pages get more blobs below; the ones above never move.

**[Docs and playground →](https://blobscape.selfstartdev.com)**

```sh
npm install blobscape
```

- `blobscape`: the core. No dependencies; runs in Node, the browser, build scripts and edge runtimes. Writes SVG strings.
- `blobscape/react`: the `<Blobscape>` component. React 18 or 19, an optional peer dependency.

## React

`<Blobscape>` is a layer, not a wrapper. Put it inside the element it should sit behind, and give that element `blobscapeParentStyle`:

```tsx
import { blobscapeParentStyle } from "blobscape";
import { Blobscape } from "blobscape/react";

<div style={blobscapeParentStyle}>
  <Blobscape seed={pathname} />
  {children}
</div>
```

`blobscapeParentStyle` is `{ position: "relative", isolation: "isolate" }`: the layer covers this element and can't slip behind its background. In development, `<Blobscape>` warns if either is missing.

Import `blobscapeParentStyle` from `blobscape`, not `blobscape/react`. `blobscape/react` is a client module, so a React Server Component importing a plain value from it gets an empty reference, and the styles silently drop out.

### A content column with full-width blobs

The common layout: a narrow column of content, blobs across the whole browser. Put `<Blobscape>` in the column and add `fullBleed`. The layer keeps the column's height and breaks out to the full viewport width.

```tsx
<main style={{ ...blobscapeParentStyle, maxWidth: 720, margin: "0 auto" }}>
  <Blobscape seed={pathname} fullBleed />
  <article>…</article>
</main>
```

Before hydration a full-bleed layer is `100vw` wide, which includes the scrollbar where one is shown. Add `overflow-x: clip` to `body` to rule out a brief horizontal scrollbar.

### Next.js

`<Blobscape>` ships with `"use client"` and renders on the server too. Pass the seed explicitly, for example from `usePathname()`:

```tsx
"use client";
import { usePathname } from "next/navigation";
import { Blobscape } from "blobscape/react";

export function Blobs() {
  return <Blobscape seed={usePathname()} fullBleed />;
}
```

On the server and the first client render, `<Blobscape>` draws 4000px of blobs (`initialHeight`). After mount it measures the real height and adds blobs below as the page grows, with no hydration mismatch.

## SVG, without React

```ts
import { writeFileSync } from "node:fs";
import { scene, toSvg } from "blobscape";

const svg = toSvg(scene({ seed: "/about", height: 3200, fill: "#fde4ec" }));
writeFileSync("about-background.svg", svg);
```

One `<svg>`, one `<path>` per blob, coordinates rounded to two decimals: the same input always gives the same bytes. `render()` returns the same scene as plain data if you'd rather draw it yourself.

## Presets

```tsx
import { presets } from "blobscape";

<Blobscape seed={pathname} {...presets.polygons} fill="#8a5cf6" />
```

| Preset | Look |
|---|---|
| `blobs` | Smooth organic blobs, 600–1200px. |
| `polygons` | Sharp angular shards, 600–1200px, about one per 800px of height. |
| `pebbles` | Polygons with softened corners, a little smaller and closer. |
| `confetti` | Many small shapes: a light texture rather than accents. |
| `bubbles` | Near-circles of mixed sizes, 120–520px, closer together than blobs. |

## Options

| Option | Default | Meaning |
|---|---|---|
| `seed` | required | Any string or number. Usually the URL path. |
| `height` | required in `scene()` | Height to cover, in px. `<Blobscape>` measures it. |
| `width` | `1440` | Canvas width in px. Spacing is computed at this width. |
| `mode` | `"fixed"` | `"fixed"`: the canvas stays at `width`, centered; narrow screens crop the sides. `"fluid"`: x positions scale with the container. |
| `shapes` | smooth, 7 points | `{ points, irregularity, roundness }`, or your own SVG paths. |
| `size` | `{ random: [600, 1200] }` | Blob size in px. |
| `rotation` | `{ random: [0, 360] }` | Degrees. |
| `opacity` | `0.4` | 0 to 1. |
| `fill` | `"currentColor"` | Colours, palettes and gradients. |
| `layout` | `{ density: 1.25, minDistance: 600, minGap: 150 }` | Target blobs per 1000px, and the hard spacing minimums. Blobs never overlap. |
| `placements` | none | Explicit positions; skips automatic layout. |

`<Blobscape>` also takes `attach` (`"scroll"` or `"fixed"` to pin to the viewport), `fullBleed`, `initialHeight`, `className` and `style`.

Anything that varies per blob takes a distribution:

```ts
size: 800                                         // every blob
size: { random: [600, 1200] }                     // uniform random
size: { even: [600, 1200] }                       // evenly spread, shuffled
fill: { sequence: ["#fde4ec", "#eef0fb"] }        // cycles top to bottom
fill: { weighted: ["#fde4ec", "#eef0fb"], weights: [3, 1] }
fill: { linear: { angle: 135, stops: [{ offset: 0, color: "#f9b4c8" }, { offset: 1, color: "#f7c6a3" }] } }
shapes: { points: { even: [5, 9] }, irregularity: { random: [0.2, 0.8] }, roundness: 0 }
shapes: [{ d: "M0.5 0 L1 1 L0 1 Z" }, { d: "M12 2 …", viewBox: [0, 0, 24, 24] }]
```

The [docs](https://blobscape.selfstartdev.com/docs/options/) cover every option in detail.

## Accessibility

The layer is decorative: `aria-hidden="true"` and `pointer-events: none`. Check contrast for your colours; the default opacity is 0.4.

## Stability

The same seed and options always produce the same output on the server and in the browser.

From 1.0, the same seed, options and major version produce byte-identical output: any change to generated output, presets included, is a major release, so upgrading within a major version never moves your blobs. Before 1.0, a minor version (0.x → 0.y) may still change output; patch versions never do.

## License

MIT © SelfStartDev
