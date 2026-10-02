// bb-fork(diff-rail): change-region stepping math lives here instead of in
// bb-fork(diff-rail): DiffChangeNav.fork.tsx, so that module exports components
// bb-fork(diff-rail): only and React Fast Refresh can update it without a full
// bb-fork(diff-rail): page reload.
import type { DiffChangeRailMark } from "./diff-change-rail-model.fork";

const CHANGE_REGION_MATCH_TOLERANCE_PX = 1;

export function findDiffChangeRegionIndex({
  marks,
  scrollTop,
}: {
  marks: readonly DiffChangeRailMark[];
  scrollTop: number;
}): number {
  let current = -1;
  for (const [index, mark] of marks.entries()) {
    if (mark.top <= scrollTop + CHANGE_REGION_MATCH_TOLERANCE_PX) {
      current = index;
    }
  }
  return current;
}

export function scrollTopForDiffChangeRegion({
  mark,
  viewport,
}: {
  mark: DiffChangeRailMark;
  viewport: { clientHeight: number; scrollHeight: number };
}): number {
  const maxScrollTop = Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight,
  );
  return Math.min(maxScrollTop, Math.max(0, mark.top));
}

// bb-fork(diff-rail): the stepper's own cursor, because the last changes cannot be scrolled to the top.
export function nextDiffChangeRegionIndex({
  currentIndex,
  direction,
  markCount,
}: {
  currentIndex: number;
  direction: "next" | "previous";
  markCount: number;
}): number | null {
  if (markCount === 0) return null;
  if (direction === "next") {
    const next = Math.max(currentIndex + 1, 0);
    return next < markCount ? next : null;
  }
  if (currentIndex <= 0) return null;
  return currentIndex - 1;
}
