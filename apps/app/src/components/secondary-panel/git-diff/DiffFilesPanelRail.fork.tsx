// bb-fork(diff-rail): change map for the whole changed-files list, built from the virtualizer's geometry.
import { useCallback, useMemo } from "react";
import { DiffChangeRailFrame } from "@/components/code/DiffChangeRail.fork";
import { useDiffChangeRailViewport } from "@/components/code/diff-change-rail-model.fork";
import { useGitDiffChangeRailPreference } from "@/lib/git-diff-view-preferences";

export interface DiffFilesPanelRailItem {
  additions: number;
  deletions: number;
  start: number;
  end: number;
}

interface DiffFilesPanelRailProps {
  items: readonly DiffFilesPanelRailItem[];
  onScrollToOffset: (offset: number) => void;
  scrollElement: HTMLElement | null;
  totalSize: number;
}

export function DiffFilesPanelRail({
  items,
  onScrollToOffset,
  scrollElement,
  totalSize,
}: DiffFilesPanelRailProps) {
  const [isChangeRailEnabled] = useGitDiffChangeRailPreference();
  const viewport = useDiffChangeRailViewport(
    isChangeRailEnabled ? scrollElement : null,
  );
  const marks = useMemo(
    () =>
      items.map((item) => ({
        top: item.start,
        height: Math.max(0, item.end - item.start),
        additions: item.additions,
        deletions: item.deletions,
      })),
    [items],
  );
  const scrollToFraction = useCallback(
    (fraction: number) => {
      onScrollToOffset(fraction * totalSize);
    },
    [onScrollToOffset, totalSize],
  );
  const scrollByPixels = useCallback(
    (deltaPx: number) => {
      onScrollToOffset((scrollElement?.scrollTop ?? 0) + deltaPx);
    },
    [onScrollToOffset, scrollElement],
  );
  if (
    !isChangeRailEnabled ||
    marks.length === 0 ||
    viewport.scrollHeight <= viewport.clientHeight
  ) {
    return null;
  }
  return (
    <DiffChangeRailFrame
      ariaLabel={`Diff change map, ${marks.length} changed ${
        marks.length === 1 ? "file" : "files"
      }`}
      contentHeight={totalSize}
      marks={marks}
      onScrollByPixels={scrollByPixels}
      onScrollToFraction={scrollToFraction}
      viewport={viewport}
    />
  );
}
