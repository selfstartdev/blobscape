---
"blobscape": patch
---

Fix the issues a code review found:

- Path numbers out of range (`1e400`) are rejected; they used to make the layout loop forever.
- Single-curve shapes such as `M0 0 Q1 1 2 0 Z` are accepted.
- `layout: { density: undefined }` (or any other layout key) keeps the default instead of throwing.
- `density: 0` now packs as densely as the spacing minimums allow; it used to give far fewer blobs than a high density.
- Size distributions are checked on their bounds, so `size: { random: [0, 600] }` throws on every page, not only on unlucky seeds.
- An `even` choice with a `groupSize` that isn't a multiple of the item count rounds it up, so every item gets an equal share.
- Explicit placements check `width`, `height`, `bandHeight` and each placement's `size`, `rotation` and `opacity`, like automatic layout does. A shape shared by several placements is parsed once.
- `<Blobscape>` measures its layout size, so a transform at mount (an entrance animation) no longer leaves it the wrong height.
- `fullBleed` spans the viewport even when the parent isn't centred.
- The development warning about the parent's setup now shows in Vite apps, and no longer fires for parents that already form a stacking context (sticky, fixed, transformed, translucent and so on).
- Path parsing is linear in the path's length, and resizing the width in fixed mode no longer re-renders every path.

Output for existing options is unchanged, apart from layouts that use `density: 0` or an `even` choice whose `groupSize` isn't a multiple of its item count.
