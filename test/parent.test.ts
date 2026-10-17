import { describe, expect, it } from "vitest";
import { blobscapeParentStyle } from "../src";
import { blobscapeParentStyle as fromReact } from "../src/react";

describe("blobscapeParentStyle", () => {
  it("is exported from the core, so server components get the real object", () => {
    expect(blobscapeParentStyle).toEqual({ position: "relative", isolation: "isolate" });
  });

  it("is the same object from blobscape/react", () => {
    expect(fromReact).toBe(blobscapeParentStyle);
  });
});
