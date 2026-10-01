// @vitest-environment jsdom
import { useCallback, useRef, useState, type RefCallback } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  rectOf,
  renderWithChangeRailPreference,
  restoreRailHeight,
  stubRailHeight,
  stubRailPointerEvents,
  stubScrollGeometry,
} from "@/test/diff-change-rail-harness";
import { GIT_DIFF_CHANGE_RAIL_STORAGE_KEY } from "@/lib/git-diff-view-preferences";
import {
  buildDiffChangeRailBands,
  DiffChangeRail,
  DiffChangeRailToggle,
  diffChangeRailAriaValue,
  readDiffChangeRailMarks,
  scrollTopForRailFraction,
  type DiffChangeRailMark,
  type DiffChangeRailViewport,
} from "./DiffChangeRail.fork";

function makeRow(lineType: string, top: number, height = 18): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("data-line", "1");
  row.setAttribute("data-line-type", lineType);
  Object.defineProperty(row, "getBoundingClientRect", {
    configurable: true,
    value: () => rectOf(top, height),
  });
  return row;
}

function makeScrollContainer(
  rows: readonly { lineType: string; top: number; height?: number }[],
  viewport?: Partial<DiffChangeRailViewport>,
): HTMLElement {
  const container = document.createElement("div");
  stubScrollGeometry(container, viewport);
  Object.defineProperty(container, "getBoundingClientRect", {
    configurable: true,
    value: () => rectOf(0, 600),
  });
  for (const row of rows) {
    container.append(makeRow(row.lineType, row.top, row.height ?? 18));
  }
  return container;
}

function mark(partial: Partial<DiffChangeRailMark>): DiffChangeRailMark {
  return { top: 0, height: 18, additions: 0, deletions: 0, ...partial };
}

describe("buildDiffChangeRailBands", () => {
  it("returns no bands without marks or a scale", () => {
    expect(buildDiffChangeRailBands([], 1)).toEqual([]);
    expect(buildDiffChangeRailBands([mark({ additions: 1 })], 0)).toEqual([]);
  });

  it("scales marks into rail pixels", () => {
    expect(
      buildDiffChangeRailBands(
        [mark({ top: 100, height: 20, additions: 2 })],
        0.5,
      ),
    ).toEqual([{ top: 50, height: 10, kind: "addition" }]);
    expect(
      buildDiffChangeRailBands(
        [mark({ top: 100, height: 20, deletions: 3 })],
        0.5,
      ),
    ).toEqual([{ top: 50, height: 10, kind: "deletion" }]);
  });

  it("marks a region that both adds and removes as mixed", () => {
    expect(
      buildDiffChangeRailBands(
        [mark({ top: 10, height: 40, additions: 1, deletions: 1 })],
        1,
      ),
    ).toEqual([{ top: 10, height: 40, kind: "mixed" }]);
  });

  it("keeps every band at least one visible pixel tall", () => {
    expect(
      buildDiffChangeRailBands(
        [mark({ top: 10_000, height: 18, additions: 1 })],
        0.001,
      ),
    ).toEqual([{ top: 10, height: 2, kind: "addition" }]);
  });

  it("merges regions that collapse onto the same pixel rows", () => {
    expect(
      buildDiffChangeRailBands(
        [
          mark({ top: 0, height: 100, additions: 1 }),
          mark({ top: 100, height: 100, deletions: 1 }),
        ],
        0.01,
      ),
    ).toEqual([{ top: 0, height: 3, kind: "mixed" }]);
  });

  it("keeps separated regions apart", () => {
    expect(
      buildDiffChangeRailBands(
        [
          mark({ top: 0, height: 18, additions: 1 }),
          mark({ top: 900, height: 18, deletions: 1 }),
        ],
        0.5,
      ),
    ).toEqual([
      { top: 0, height: 9, kind: "addition" },
      { top: 450, height: 9, kind: "deletion" },
    ]);
  });
});

describe("readDiffChangeRailMarks", () => {
  it("merges a replaced block into one region", () => {
    const container = makeScrollContainer([
      { lineType: "context", top: 60 },
      { lineType: "change-deletion", top: 78 },
      { lineType: "change-addition", top: 96 },
      { lineType: "context", top: 114 },
      { lineType: "change-addition", top: 132 },
    ]);
    expect(readDiffChangeRailMarks(container)).toEqual([
      { top: 78, height: 36, additions: 1, deletions: 1 },
      { top: 132, height: 18, additions: 1, deletions: 0 },
    ]);
  });

  it("reads a split-view row pair as one changed line", () => {
    const container = makeScrollContainer([
      { lineType: "change-deletion", top: 40 },
      { lineType: "change-addition", top: 40 },
    ]);
    expect(readDiffChangeRailMarks(container)).toEqual([
      { top: 40, height: 18, additions: 1, deletions: 1 },
    ]);
  });

  it("offsets rows by the current scroll position", () => {
    const container = makeScrollContainer(
      [{ lineType: "change-addition", top: 40 }],
      { scrollTop: 120 },
    );
    expect(readDiffChangeRailMarks(container)).toEqual([
      { top: 160, height: 18, additions: 1, deletions: 0 },
    ]);
  });

  it("ignores rows that are not laid out", () => {
    const container = makeScrollContainer([]);
    expect(readDiffChangeRailMarks(container)).toEqual([]);
  });
});

describe("rail scroll maths", () => {
  const viewport: DiffChangeRailViewport = {
    scrollTop: 0,
    clientHeight: 300,
    scrollHeight: 1200,
  };

  it("centers the requested fraction in the viewport", () => {
    expect(scrollTopForRailFraction(0.5, viewport)).toBe(450);
  });

  it("clamps to the scroll range", () => {
    expect(scrollTopForRailFraction(0, viewport)).toBe(0);
    expect(scrollTopForRailFraction(1, viewport)).toBe(900);
    expect(scrollTopForRailFraction(Number.NaN, viewport)).toBe(0);
    expect(
      scrollTopForRailFraction(0.5, { ...viewport, scrollHeight: 300 }),
    ).toBe(0);
  });

  it("reports the scroll position as a percentage", () => {
    expect(diffChangeRailAriaValue(viewport)).toBe(0);
    expect(diffChangeRailAriaValue({ ...viewport, scrollTop: 450 })).toBe(50);
    expect(diffChangeRailAriaValue({ ...viewport, scrollTop: 900 })).toBe(100);
    expect(diffChangeRailAriaValue({ ...viewport, scrollHeight: 300 })).toBe(0);
  });
});

interface RailHarnessProps {
  couldScroll?: boolean;
  rows?: readonly { lineType: string; top: number; height?: number }[];
}

function RailHarness({
  couldScroll = true,
  rows = [
    { lineType: "change-deletion", top: 100 },
    { lineType: "change-addition", top: 118 },
  ],
}: RailHarnessProps) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const attachScroll = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      if (element !== null) {
        stubScrollGeometry(element, {
          scrollHeight: couldScroll ? 1200 : 300,
        });
      }
      setScrollElement(element);
    },
    [couldScroll],
  );
  return (
    <div>
      <div ref={attachScroll} data-testid="scroll">
        {rows.map((row, index) => (
          <div
            key={index}
            ref={(element) => {
              if (element === null) return;
              element.setAttribute("data-line", "1");
              element.setAttribute("data-line-type", row.lineType);
              Object.defineProperty(element, "getBoundingClientRect", {
                configurable: true,
                value: () => rectOf(row.top, row.height ?? 18),
              });
            }}
          />
        ))}
      </div>
      <DiffChangeRail scrollElement={scrollElement} />
    </div>
  );
}

function SwapHarness({
  rows,
}: {
  rows: readonly { lineType: string; top: number; height?: number }[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const attachScroll = useCallback<RefCallback<HTMLDivElement>>((element) => {
    scrollRef.current = element;
    if (element !== null) {
      stubScrollGeometry(element, { scrollHeight: 300 });
    }
    setScrollElement(element);
  }, []);
  return (
    <div>
      <div ref={attachScroll} data-testid="scroll">
        <div />
      </div>
      <DiffChangeRail scrollElement={scrollElement} />
      <button
        type="button"
        onClick={() => {
          const element = scrollRef.current;
          if (element === null) return;
          stubScrollGeometry(element, { scrollHeight: 1200 });
          element.replaceChildren(
            ...rows.map((row, index) => {
              const node = document.createElement("div");
              node.setAttribute("data-line", "1");
              node.setAttribute("data-line-type", row.lineType);
              node.setAttribute("data-index", String(index));
              Object.defineProperty(node, "getBoundingClientRect", {
                configurable: true,
                value: () => rectOf(row.top, row.height ?? 18),
              });
              return node;
            }),
          );
        }}
      >
        grow
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  restoreRailHeight();
});

describe("DiffChangeRail", () => {
  it("hides itself when the change map preference is off", () => {
    renderWithChangeRailPreference(<RailHarness />, { changeRail: "false" });
    expect(screen.queryByRole("scrollbar")).toBeNull();
    expect(document.querySelector("[data-diff-change-rail]")).toBeNull();
  });

  it("hides itself when the diff does not scroll", () => {
    renderWithChangeRailPreference(<RailHarness couldScroll={false} />);
    expect(screen.queryByRole("scrollbar")).toBeNull();
  });

  it("hides itself when the diff has no changed lines", () => {
    renderWithChangeRailPreference(
      <RailHarness rows={[{ lineType: "context", top: 10 }]} />,
    );
    expect(screen.queryByRole("scrollbar")).toBeNull();
  });

  it("draws a band per changed region and a thumb for the viewport", () => {
    stubRailHeight();
    const { container } = renderWithChangeRailPreference(<RailHarness />);
    const rail = screen.getByRole("scrollbar");
    expect(rail.getAttribute("aria-label")).toBe(
      "Diff change map, 1 changed region",
    );
    const bands = container.querySelectorAll("[data-diff-change-rail-band]");
    expect(bands).toHaveLength(1);
    expect(bands[0]?.getAttribute("data-diff-change-rail-band")).toBe("mixed");
    expect((bands[0] as HTMLElement).style.top).toBe("33px");
    expect((bands[0] as HTMLElement).style.height).toBe("12px");
    const thumb = container.querySelector(
      "[data-diff-change-rail-thumb]",
    ) as HTMLElement | null;
    expect(thumb?.style.top).toBe("0px");
    expect(thumb?.style.height).toBe("100px");
  });

  it("scrolls to the pointer and keeps following the drag", () => {
    stubRailHeight();
    renderWithChangeRailPreference(<RailHarness />);
    const rail = screen.getByRole("scrollbar");
    stubRailPointerEvents(rail);
    const scroll = screen.getByTestId("scroll");

    fireEvent.pointerDown(rail, { button: 0, pointerId: 1, clientY: 200 });
    expect(scroll.scrollTop).toBe(450);

    fireEvent.pointerMove(rail, { pointerId: 1, clientY: 100 });
    expect(scroll.scrollTop).toBe(150);

    fireEvent.pointerUp(rail, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(rail, { pointerId: 1, clientY: 300 });
    expect(scroll.scrollTop).toBe(150);
  });

  it("appears once the diff replaces the loading placeholder", async () => {
    stubRailHeight();
    const row = { lineType: "change-addition", top: 40 };
    const { container } = renderWithChangeRailPreference(
      <SwapHarness rows={[row]} />,
    );
    expect(screen.queryByRole("scrollbar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "grow" }));

    await waitFor(() =>
      expect(
        container.querySelectorAll("[data-diff-change-rail-band]"),
      ).toHaveLength(1),
    );
  });

  it("scrolls with the keyboard and reports its range", () => {
    stubRailHeight();
    renderWithChangeRailPreference(<RailHarness />);
    const rail = screen.getByRole("scrollbar");
    stubRailPointerEvents(rail);
    const scroll = screen.getByTestId("scroll");
    scroll.scrollTop = 300;

    fireEvent.keyDown(rail, { key: "ArrowDown" });
    expect(scroll.scrollTop).toBe(340);
    fireEvent.keyDown(rail, { key: "ArrowUp" });
    expect(scroll.scrollTop).toBe(300);
    fireEvent.keyDown(rail, { key: "End" });
    expect(scroll.scrollTop).toBe(900);
    fireEvent.keyDown(rail, { key: "PageUp" });
    expect(scroll.scrollTop).toBe(600);

    expect(rail.getAttribute("aria-valuemin")).toBe("0");
    expect(rail.getAttribute("aria-valuemax")).toBe("100");
  });
});

describe("DiffChangeRailToggle", () => {
  it("shows and hides the change map", () => {
    renderWithChangeRailPreference(
      <>
        <DiffChangeRailToggle />
        <RailHarness />
      </>,
    );
    const toggle = screen.getByRole("button", { name: "Hide change map" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("scrollbar")).toBeTruthy();

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Show change map" }),
    ).toBeTruthy();
    expect(screen.queryByRole("scrollbar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show change map" }));
    expect(screen.getByRole("scrollbar")).toBeTruthy();
    expect(window.localStorage.getItem(GIT_DIFF_CHANGE_RAIL_STORAGE_KEY)).toBe(
      "true",
    );
  });
});
