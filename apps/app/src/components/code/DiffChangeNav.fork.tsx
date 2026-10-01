// bb-fork(diff-rail): step through a diff's changed regions, opening on the first one.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { useDiffChangeRailMarks } from "./diff-change-rail-model.fork";
import {
  findDiffChangeRegionIndex,
  nextDiffChangeRegionIndex,
  scrollTopForDiffChangeRegion,
} from "./diff-change-nav-model.fork";

function readViewport(element: HTMLElement): {
  clientHeight: number;
  scrollHeight: number;
} {
  return {
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  };
}

interface DiffChangeNavFrameProps {
  className?: string;
  currentIndex: number;
  markCount: number;
  onGoToNext: () => void;
  onGoToPrevious: () => void;
}

export function DiffChangeNavFrame({
  className,
  currentIndex,
  markCount,
  onGoToNext,
  onGoToPrevious,
}: DiffChangeNavFrameProps) {
  const hasChanges = markCount > 0;
  const canGoPrevious = hasChanges && currentIndex > 0;
  const canGoNext = hasChanges && currentIndex < markCount - 1;
  return (
    <div
      data-diff-change-nav=""
      className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-state-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_[data-icon-root]]:size-3.5 max-md:pointer-coarse:size-9 max-md:pointer-coarse:[&_[data-icon-root]]:size-5"
        aria-label="Previous change"
        disabled={!canGoPrevious}
        onClick={onGoToPrevious}
      >
        <Icon name="ChevronUp" />
      </Button>
      <span
        data-diff-change-counter=""
        aria-hidden
        className="min-w-7 shrink-0 text-center text-xs tabular-nums text-muted-foreground"
      >
        {hasChanges ? `${Math.max(currentIndex, 0) + 1}/${markCount}` : "0/0"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-state-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_[data-icon-root]]:size-3.5 max-md:pointer-coarse:size-9 max-md:pointer-coarse:[&_[data-icon-root]]:size-5"
        aria-label="Next change"
        disabled={!canGoNext}
        onClick={onGoToNext}
      >
        <Icon name="ChevronDown" />
      </Button>
    </div>
  );
}

interface DiffChangeNavProps {
  className?: string;
  jumpToFirstChange?: boolean;
  scrollElement: HTMLElement | null;
}

export function DiffChangeNav({
  className,
  jumpToFirstChange = true,
  scrollElement,
}: DiffChangeNavProps) {
  const marks = useDiffChangeRailMarks(scrollElement);
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasJumpedRef = useRef(false);
  const ownScrollTopRef = useRef<number | null>(null);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const goToRegion = useCallback(
    (index: number) => {
      const mark = marksRef.current[index];
      if (mark === undefined || scrollElement === null) return;
      const target = scrollTopForDiffChangeRegion({
        mark,
        viewport: readViewport(scrollElement),
      });
      ownScrollTopRef.current = target;
      scrollElement.scrollTop = target;
      setCurrentIndex(index);
    },
    [scrollElement],
  );
  const goToStep = useCallback(
    (direction: "next" | "previous") => {
      const index = nextDiffChangeRegionIndex({
        currentIndex,
        direction,
        markCount: marksRef.current.length,
      });
      if (index !== null) goToRegion(index);
    },
    [currentIndex, goToRegion],
  );
  useEffect(() => {
    const element = scrollElement;
    if (element === null) return;
    const read = () => {
      const ownScrollTop = ownScrollTopRef.current;
      ownScrollTopRef.current = null;
      if (
        ownScrollTop !== null &&
        Math.abs(element.scrollTop - ownScrollTop) <= 1
      ) {
        return;
      }
      setCurrentIndex(
        findDiffChangeRegionIndex({
          marks: marksRef.current,
          scrollTop: element.scrollTop,
        }),
      );
    };
    element.addEventListener("scroll", read, { passive: true });
    return () => element.removeEventListener("scroll", read);
  }, [scrollElement]);
  useEffect(() => {
    if (!jumpToFirstChange || hasJumpedRef.current) return;
    const firstMark = marks[0];
    if (firstMark === undefined || scrollElement === null) return;
    hasJumpedRef.current = true;
    if (firstMark.top <= 0) return;
    goToRegion(0);
  }, [goToRegion, jumpToFirstChange, marks, scrollElement]);
  return (
    <DiffChangeNavFrame
      className={className}
      currentIndex={currentIndex}
      markCount={marks.length}
      onGoToNext={() => goToStep("next")}
      onGoToPrevious={() => goToStep("previous")}
    />
  );
}
