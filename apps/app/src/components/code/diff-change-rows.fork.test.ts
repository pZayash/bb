// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectDiffChangeRows,
  observeDiffRows,
} from "./diff-change-rows.fork";

function makeRow(lineType: string, top: number, height = 18): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("data-line", "1");
  row.setAttribute("data-line-type", lineType);
  Object.defineProperty(row, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top, height }) as DOMRect,
  });
  return row;
}

function shadowHost(rows: HTMLElement[]): HTMLElement {
  const host = document.createElement("diffs-container");
  const shadowRoot = host.shadowRoot;
  if (shadowRoot === null) {
    throw new Error("diffs-container did not attach its shadow root");
  }
  for (const row of rows) shadowRoot.append(row);
  return host;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collectDiffChangeRows", () => {
  it("finds rows rendered inside a diffs-container shadow root", () => {
    const container = document.createElement("div");
    container.append(
      shadowHost([makeRow("context", 0), makeRow("change-addition", 18)]),
    );
    expect(collectDiffChangeRows(container)).toHaveLength(2);
  });

  it("finds rows that are not wrapped in a shadow root", () => {
    const container = document.createElement("div");
    container.append(makeRow("change-deletion", 0));
    expect(collectDiffChangeRows(container)).toHaveLength(1);
  });

  it("does not descend into unrelated custom elements", () => {
    const container = document.createElement("div");
    const other = document.createElement("some-other-widget");
    other.attachShadow({ mode: "open" }).append(makeRow("change-addition", 0));
    container.append(other);
    expect(collectDiffChangeRows(container)).toEqual([]);
  });
});

describe("observeDiffRows", () => {
  it("reports rows added to a shadow root after the observer attaches", async () => {
    const container = document.createElement("div");
    const host = shadowHost([]);
    container.append(host);
    const onChange = vi.fn();
    const stop = observeDiffRows(container, onChange);

    host.shadowRoot?.append(makeRow("change-addition", 0));
    await Promise.resolve();
    expect(onChange).toHaveBeenCalled();
    expect(collectDiffChangeRows(container)).toHaveLength(1);
    stop();
  });

  it("starts observing a host whose shadow root appears later", async () => {
    const container = document.createElement("div");
    const onChange = vi.fn();
    const stop = observeDiffRows(container, onChange);

    const host = shadowHost([]);
    container.append(host);
    await Promise.resolve();
    onChange.mockClear();

    host.shadowRoot?.append(makeRow("change-deletion", 0));
    await Promise.resolve();
    expect(onChange).toHaveBeenCalled();
    stop();
  });

  it("reports a replacement of the observed content", async () => {
    const container = document.createElement("div");
    const skeleton = document.createElement("div");
    container.append(skeleton);
    const onChange = vi.fn();
    const stop = observeDiffRows(container, onChange);

    container.replaceChildren(shadowHost([makeRow("change-addition", 0)]));
    await Promise.resolve();
    expect(onChange).toHaveBeenCalled();
    stop();
  });

  it("stops reporting once the observer is disposed", async () => {
    const container = document.createElement("div");
    const host = shadowHost([]);
    container.append(host);
    const onChange = vi.fn();
    observeDiffRows(container, onChange)();

    host.shadowRoot?.append(makeRow("change-addition", 0));
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
});
