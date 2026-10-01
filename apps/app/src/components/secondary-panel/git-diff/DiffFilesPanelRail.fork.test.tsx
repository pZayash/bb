// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderWithChangeRailPreference,
  restoreRailHeight,
  stubRailPointerEvents,
  stubRailHeight,
  stubScrollGeometry,
} from "@/test/diff-change-rail-harness";
import { DiffFilesPanelRail } from "./DiffFilesPanelRail.fork";

const TOTAL_SIZE = 1200;

function renderPanelRail({
  items = [
    { additions: 4, deletions: 1, start: 0, end: 300 },
    { additions: 0, deletions: 9, start: 600, end: 900 },
  ],
  changeRail = "true",
  onScrollToOffset = vi.fn(),
  scrollElement = (() => {
    const element = document.createElement("div");
    stubScrollGeometry(element, { scrollHeight: TOTAL_SIZE });
    document.body.append(element);
    return element;
  })(),
}: {
  items?: {
    additions: number;
    deletions: number;
    start: number;
    end: number;
  }[];
  changeRail?: string;
  onScrollToOffset?: (offset: number) => void;
  scrollElement?: HTMLElement;
} = {}) {
  return renderWithChangeRailPreference(
    <DiffFilesPanelRail
      items={items}
      onScrollToOffset={onScrollToOffset}
      scrollElement={scrollElement}
      totalSize={TOTAL_SIZE}
    />,
    { changeRail },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  restoreRailHeight();
  vi.restoreAllMocks();
});

describe("DiffFilesPanelRail", () => {
  it("bands one file per changed entry", () => {
    stubRailHeight();
    const { container } = renderPanelRail();
    expect(screen.getByRole("scrollbar").getAttribute("aria-label")).toBe(
      "Diff change map, 2 changed files",
    );
    const bands = container.querySelectorAll("[data-diff-change-rail-band]");
    expect(bands).toHaveLength(2);
    expect(bands[0]?.getAttribute("data-diff-change-rail-band")).toBe("mixed");
    expect(bands[1]?.getAttribute("data-diff-change-rail-band")).toBe(
      "deletion",
    );
  });

  it("jumps to the file list offset under the pointer", () => {
    stubRailHeight();
    const onScrollToOffset = vi.fn();
    renderPanelRail({ onScrollToOffset });
    const rail = screen.getByRole("scrollbar");
    stubRailPointerEvents(rail);

    fireEvent.pointerDown(rail, { button: 0, pointerId: 1, clientY: 200 });

    expect(onScrollToOffset).toHaveBeenCalledWith(TOTAL_SIZE / 2);
  });

  it("stays hidden without the change map preference", () => {
    renderPanelRail({ changeRail: "false" });
    expect(screen.queryByRole("scrollbar")).toBeNull();
  });

  it("stays hidden when the file list fits without scrolling", () => {
    const element = document.createElement("div");
    stubScrollGeometry(element, { clientHeight: TOTAL_SIZE });
    renderPanelRail({ scrollElement: element });
    expect(screen.queryByRole("scrollbar")).toBeNull();
  });
});
