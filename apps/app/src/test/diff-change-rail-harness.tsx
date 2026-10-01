// bb-fork(diff-rail): layout stubs the rail tests need because jsdom computes no geometry.
import type { ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { vi } from "vitest";
import type { DiffChangeRailViewport } from "@/components/code/diff-change-rail-model.fork";
import { GIT_DIFF_CHANGE_RAIL_STORAGE_KEY } from "@/lib/git-diff-view-preferences";

const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "clientHeight",
);

export const RAIL_HEIGHT_PX = 400;

export function stubRailHeight(railHeight: number = RAIL_HEIGHT_PX): void {
  Object.defineProperty(Element.prototype, "clientHeight", {
    configurable: true,
    get(this: Element) {
      if (
        this instanceof HTMLElement &&
        this.hasAttribute("data-diff-change-rail")
      ) {
        return railHeight;
      }
      return clientHeightDescriptor?.get?.call(this) ?? 0;
    },
  });
}

export function restoreRailHeight(): void {
  if (clientHeightDescriptor === undefined) return;
  Object.defineProperty(
    Element.prototype,
    "clientHeight",
    clientHeightDescriptor,
  );
}

export function rectOf(top: number, height: number, width = 400): DOMRect {
  return {
    top,
    height,
    width,
    left: 0,
    right: width,
    bottom: top + height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

export function stubScrollGeometry(
  element: HTMLElement,
  {
    scrollTop = 0,
    clientHeight = 300,
    scrollHeight = 1200,
  }: Partial<DiffChangeRailViewport> = {},
): void {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
}

export function stubRailPointerEvents(rail: HTMLElement): void {
  Object.defineProperty(rail, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(rail, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(rail, "getBoundingClientRect").mockReturnValue(
    rectOf(0, RAIL_HEIGHT_PX),
  );
}

export function renderWithChangeRailPreference(
  node: ReactNode,
  { changeRail = "true" }: { changeRail?: string } = {},
): RenderResult {
  window.localStorage.setItem(GIT_DIFF_CHANGE_RAIL_STORAGE_KEY, changeRail);
  const store = createStore();
  return render(<JotaiProvider store={store}>{node}</JotaiProvider>);
}
