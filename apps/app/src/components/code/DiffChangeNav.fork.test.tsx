// @vitest-environment jsdom
import { useCallback, useState, type RefCallback } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rectOf, stubScrollGeometry } from "@/test/diff-change-rail-harness";
import type { DiffChangeRailMark } from "./DiffChangeRail.fork";
import {
  DiffChangeNav,
  DiffChangeNavFrame,
  findDiffChangeRegionIndex,
  nextDiffChangeRegionIndex,
  scrollTopForDiffChangeRegion,
} from "./DiffChangeNav.fork";

function mark(top: number, height = 18): DiffChangeRailMark {
  return { top, height, additions: 1, deletions: 0 };
}

const VIEWPORT = { clientHeight: 300, scrollHeight: 1200 };

describe("diff change navigation maths", () => {
  const marks = [mark(100), mark(500), mark(900)];

  it("finds the region the viewport is inside", () => {
    expect(findDiffChangeRegionIndex({ marks, scrollTop: 0 })).toBe(-1);
    expect(findDiffChangeRegionIndex({ marks, scrollTop: 100 })).toBe(0);
    expect(findDiffChangeRegionIndex({ marks, scrollTop: 640 })).toBe(1);
    expect(findDiffChangeRegionIndex({ marks, scrollTop: 10_000 })).toBe(2);
  });

  it("steps the cursor through the regions and stops at both ends", () => {
    const step = (
      currentIndex: number,
      direction: "next" | "previous",
      markCount = marks.length,
    ) => nextDiffChangeRegionIndex({ currentIndex, direction, markCount });

    expect(step(-1, "next")).toBe(0);
    expect(step(0, "next")).toBe(1);
    expect(step(2, "next")).toBeNull();
    expect(step(0, "previous")).toBeNull();
    expect(step(-1, "previous")).toBeNull();
    expect(step(2, "previous")).toBe(1);
    expect(step(0, "next", 0)).toBeNull();
  });

  it("puts the region on the first visible line, inside the scroll range", () => {
    expect(
      scrollTopForDiffChangeRegion({ mark: mark(500), viewport: VIEWPORT }),
    ).toBe(500);
    expect(
      scrollTopForDiffChangeRegion({ mark: mark(10), viewport: VIEWPORT }),
    ).toBe(10);
    expect(
      scrollTopForDiffChangeRegion({ mark: mark(10_000), viewport: VIEWPORT }),
    ).toBe(900);
  });
});

describe("DiffChangeNavFrame", () => {
  it("disables both buttons without changes", () => {
    render(
      <DiffChangeNavFrame
        currentIndex={-1}
        markCount={0}
        onGoToNext={vi.fn()}
        onGoToPrevious={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Previous change" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Next change" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("0/0")).toBeTruthy();
  });

  it("counts from one and disables the ends", () => {
    const onGoToNext = vi.fn();
    const { rerender } = render(
      <DiffChangeNavFrame
        currentIndex={-1}
        markCount={3}
        onGoToNext={onGoToNext}
        onGoToPrevious={vi.fn()}
      />,
    );

    expect(screen.getByText("1/3")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Previous change" })
        .hasAttribute("disabled"),
    ).toBe(true);

    rerender(
      <DiffChangeNavFrame
        currentIndex={2}
        markCount={3}
        onGoToNext={onGoToNext}
        onGoToPrevious={vi.fn()}
      />,
    );
    expect(screen.getByText("3/3")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Next change" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

interface NavHarnessProps {
  jumpToFirstChange?: boolean;
  rows?: readonly { lineType: string; top: number; height?: number }[];
}

function NavHarness({
  jumpToFirstChange,
  rows = [
    { lineType: "change-addition", top: 400 },
    { lineType: "change-deletion", top: 900 },
  ],
}: NavHarnessProps) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const attachScroll = useCallback<RefCallback<HTMLDivElement>>((element) => {
    if (element !== null) stubScrollGeometry(element, VIEWPORT);
    setScrollElement(element);
  }, []);
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
      <DiffChangeNav
        scrollElement={scrollElement}
        {...(jumpToFirstChange === undefined ? {} : { jumpToFirstChange })}
      />
    </div>
  );
}

afterEach(cleanup);

describe("DiffChangeNav", () => {
  it("opens on the first change", async () => {
    render(<NavHarness />);
    const scroll = screen.getByTestId("scroll");

    await waitFor(() => expect(scroll.scrollTop).toBe(400));
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Previous change" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("can leave the diff where it is", async () => {
    render(<NavHarness jumpToFirstChange={false} />);

    await waitFor(() => expect(screen.getByText("1/2")).toBeTruthy());
    expect(screen.getByTestId("scroll").scrollTop).toBe(0);
  });

  it("follows a manual scroll to another change", async () => {
    render(<NavHarness />);
    const scroll = screen.getByTestId("scroll");
    await waitFor(() => expect(scroll.scrollTop).toBe(400));

    scroll.scrollTop = 900;
    fireEvent.scroll(scroll);

    expect(screen.getByText("2/2")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Previous change" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("steps forward and back through the changes", async () => {
    render(<NavHarness />);
    const scroll = screen.getByTestId("scroll");
    await waitFor(() => expect(scroll.scrollTop).toBe(400));

    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    expect(scroll.scrollTop).toBe(900);
    expect(screen.getByText("2/2")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Next change" })
        .hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Previous change" }));
    expect(scroll.scrollTop).toBe(400);
    expect(screen.getByText("1/2")).toBeTruthy();
  });
});
