// @vitest-environment jsdom
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Blobscape, blobscapeParentStyle, type BlobscapeProps } from "../src/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout or ResizeObserver: stub both so tests control the measured size.
let layerSize = { width: 1200, height: 9000 };
const observers = new Set<() => void>();
class FakeResizeObserver {
  constructor(private readonly cb: () => void) {}
  observe() {
    observers.add(this.cb);
  }
  disconnect() {
    observers.delete(this.cb);
  }
}

beforeEach(() => {
  layerSize = { width: 1200, height: 9000 };
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: layerSize.width, height: layerSize.height, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  observers.clear();
  document.body.innerHTML = "";
});

function page(props: BlobscapeProps) {
  return createElement("main", { style: blobscapeParentStyle }, createElement(Blobscape, props), createElement("p", null, "content"));
}

async function hydrate(props: BlobscapeProps) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(page(props));
  document.body.appendChild(container);
  const errors: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
  await act(async () => {
    hydrateRoot(container, page(props), { onRecoverableError: (e) => errors.push(e) });
  });
  return { container, errors };
}

const pathsOf = (el: Element) => [...el.querySelectorAll("path")].map((p) => p.getAttribute("d"));

describe("<Blobscape>", () => {
  it("server-renders an SVG at the initial height", () => {
    const html = renderToString(page({ seed: "/ssr" }));
    expect(html).toContain("<svg");
    expect(html).toContain('height="4000"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events:none");
    // The layer clips; the SVG must not, or blobs get cut at the canvas edge on wide screens.
    expect(html).toMatch(/<svg[^>]*overflow:visible/);
  });

  it.each<BlobscapeProps>([
    { seed: "/a" },
    { seed: "/b", fullBleed: true, mode: "fluid" },
    { seed: "/c", fill: { even: ["#abc", { linear: { angle: 45, stops: [{ offset: 0, color: "red" }] } }] } },
    { seed: "/d", attach: "fixed" },
  ])("hydrates without warnings (%j)", async (props) => {
    const { errors } = await hydrate(props);
    expect(errors).toEqual([]);
  });

  it("grows after measuring: blobs are added below, existing ones never move", async () => {
    const before = pathsOf(new DOMParser().parseFromString(renderToString(page({ seed: "/grow" })), "text/html").body);
    const { container } = await hydrate({ seed: "/grow" });
    const after = pathsOf(container);
    expect(container.querySelector("svg")!.getAttribute("height")).toBe("9000");
    expect(after.length).toBeGreaterThan(before.length);
    // Every blob that reached into the first 4000px is unchanged (the fixed-mode canvas is not re-centered).
    for (const d of before) expect(after).toContain(d);
  });

  it("re-renders when the layer is resized", async () => {
    const { container } = await hydrate({ seed: "/resize" });
    layerSize = { width: 1200, height: 15000 };
    await act(async () => observers.forEach((cb) => cb()));
    expect(container.querySelector("svg")!.getAttribute("height")).toBe("15000");
  });

  it("fluid mode scales the SVG to the measured width", async () => {
    layerSize = { width: 700, height: 3000 };
    const { container } = await hydrate({ seed: "/fluid", mode: "fluid" });
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("700");
  });

  it("fixed width mode keeps the canvas width and centers it", async () => {
    layerSize = { width: 700, height: 3000 };
    const { container } = await hydrate({ seed: "/fixed" });
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("1440");
    expect(svg.style.transform).toBe("translateX(-50%)");
  });

  it("attach=fixed pins the layer to the viewport", () => {
    const html = renderToString(page({ seed: "/pin", attach: "fixed" }));
    expect(html).toContain("position:fixed");
  });

  it("gives gradient ids a per-instance prefix", () => {
    const fill = { linear: { angle: 0, stops: [{ offset: 0, color: "red" }] } };
    const html = renderToString(
      createElement("div", null, createElement(Blobscape, { seed: "/same", fill }), createElement(Blobscape, { seed: "/same", fill })),
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids.map((id) => id!.split("-")[0])).size).toBe(2);
  });

  it("warns in development when the parent is not set up", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { createRoot } = await import("react-dom/client");
    await act(async () => createRoot(container).render(createElement("section", null, createElement(Blobscape, { seed: "/w" }))));
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain("blobscapeParentStyle");
  });

  it("does not warn when the parent uses blobscapeParentStyle", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await hydrate({ seed: "/ok" });
    expect(warn).not.toHaveBeenCalled();
  });
});
