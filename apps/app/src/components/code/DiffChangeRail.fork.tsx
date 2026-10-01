// bb-fork(diff-rail): maps a diff's changed regions and doubles as its scroll control.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@bb/shared-ui/tooltip";
import { cn } from "@bb/shared-ui/lib/utils";
import { useGitDiffChangeRailPreference } from "@/lib/git-diff-view-preferences";
import {
  collectDiffChangeRows,
  observeDiffRows,
} from "./diff-change-rows.fork";

const CHANGE_LINE_TYPES = new Set(["change-addition", "change-deletion"]);
const MARK_MEASURE_DEBOUNCE_MS = 120;
const MINIMUM_BAND_HEIGHT_PX = 2;
const MINIMUM_THUMB_HEIGHT_PX = 18;
const KEYBOARD_SCROLL_STEP_PX = 40;

type DiffChangeRailBandKind = "addition" | "deletion" | "mixed";

export interface DiffChangeRailMark {
  top: number;
  height: number;
  additions: number;
  deletions: number;
}

interface DiffChangeRailBand {
  top: number;
  height: number;
  kind: DiffChangeRailBandKind;
}

export interface DiffChangeRailViewport {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

interface DiffChangeRailModel {
  marks: DiffChangeRailMark[];
  viewport: DiffChangeRailViewport;
}

const EMPTY_VIEWPORT: DiffChangeRailViewport = {
  scrollTop: 0,
  clientHeight: 0,
  scrollHeight: 0,
};

const NO_MARKS: DiffChangeRailMark[] = [];

const MIXED_BAND_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, var(--color-diff-removed) 0 50%, var(--color-diff-added) 50% 100%)",
};

const BAND_KIND_CLASS: Record<
  Exclude<DiffChangeRailBandKind, "mixed">,
  string
> = {
  addition: "bg-diff-added",
  deletion: "bg-diff-removed",
};

function clampRailFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

export function buildDiffChangeRailBands(
  marks: readonly DiffChangeRailMark[],
  scale: number,
): DiffChangeRailBand[] {
  if (!(scale > 0)) return [];
  const bands: {
    top: number;
    bottom: number;
    hasAddition: boolean;
    hasDeletion: boolean;
  }[] = [];
  for (const mark of marks) {
    const top = Math.round(mark.top * scale);
    const bottom = Math.max(
      top + MINIMUM_BAND_HEIGHT_PX,
      Math.round((mark.top + mark.height) * scale),
    );
    const current = bands[bands.length - 1];
    if (current !== undefined && top <= current.bottom) {
      current.bottom = Math.max(current.bottom, bottom);
    } else {
      bands.push({
        top,
        bottom,
        hasAddition: false,
        hasDeletion: false,
      });
    }
    const band = bands[bands.length - 1];
    if (band === undefined) continue;
    if (mark.additions > 0) band.hasAddition = true;
    if (mark.deletions > 0) band.hasDeletion = true;
  }
  return bands.map((band) => ({
    top: band.top,
    height: band.bottom - band.top,
    kind:
      band.hasAddition && band.hasDeletion
        ? "mixed"
        : band.hasAddition
          ? "addition"
          : "deletion",
  }));
}

function readDiffChangeRailViewport(
  scrollElement: HTMLElement,
): DiffChangeRailViewport {
  return {
    scrollTop: scrollElement.scrollTop,
    clientHeight: scrollElement.clientHeight,
    scrollHeight: scrollElement.scrollHeight,
  };
}

export function readDiffChangeRailMarks(
  scrollElement: HTMLElement,
): DiffChangeRailMark[] {
  const scrollRect = scrollElement.getBoundingClientRect();
  const scrollTop = scrollElement.scrollTop;
  const rows = collectDiffChangeRows(scrollElement);
  const marks: DiffChangeRailMark[] = [];
  let top = 0;
  let bottom = 0;
  let additions = 0;
  let deletions = 0;
  let isOpen = false;
  const flush = () => {
    if (!isOpen) return;
    marks.push({ top, height: bottom - top, additions, deletions });
    isOpen = false;
    additions = 0;
    deletions = 0;
  };
  for (const row of rows) {
    const lineType = row.getAttribute("data-line-type");
    if (lineType === null || !CHANGE_LINE_TYPES.has(lineType)) continue;
    const rect = row.getBoundingClientRect();
    if (rect.height <= 0) continue;
    const rowTop = rect.top - scrollRect.top + scrollTop;
    const rowBottom = rowTop + rect.height;
    if (isOpen && rowTop <= bottom + 0.5) {
      bottom = Math.max(bottom, rowBottom);
    } else {
      flush();
      isOpen = true;
      top = rowTop;
      bottom = rowBottom;
    }
    if (lineType === "change-addition") additions += 1;
    else deletions += 1;
  }
  flush();
  return marks;
}

export function useDiffChangeRailViewport(
  scrollElement: HTMLElement | null,
): DiffChangeRailViewport {
  const [viewport, setViewport] =
    useState<DiffChangeRailViewport>(EMPTY_VIEWPORT);
  useEffect(() => {
    if (scrollElement === null) return;
    let isDisposed = false;
    let frame: number | null = null;
    const read = () => {
      if (isDisposed) return;
      setViewport(readDiffChangeRailViewport(scrollElement));
    };
    const schedule = () => {
      if (isDisposed || frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        read();
      });
    };
    read();
    scrollElement.addEventListener("scroll", schedule, { passive: true });
    const stopObserving = observeDiffRows(scrollElement, schedule);
    return () => {
      isDisposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      scrollElement.removeEventListener("scroll", schedule);
      stopObserving();
    };
  }, [scrollElement]);
  return scrollElement === null ? EMPTY_VIEWPORT : viewport;
}

export function useDiffChangeRailMarks(
  scrollElement: HTMLElement | null,
): DiffChangeRailMark[] {
  const [marks, setMarks] = useState<DiffChangeRailMark[]>(NO_MARKS);
  useEffect(() => {
    if (scrollElement === null) return;
    let isDisposed = false;
    let measureTimer: number | null = null;
    const measure = () => {
      if (isDisposed) return;
      setMarks(readDiffChangeRailMarks(scrollElement));
    };
    const scheduleMeasure = () => {
      if (isDisposed || measureTimer !== null) return;
      measureTimer = window.setTimeout(() => {
        measureTimer = null;
        measure();
      }, MARK_MEASURE_DEBOUNCE_MS);
    };
    measure();
    const stopObserving = observeDiffRows(scrollElement, scheduleMeasure);
    return () => {
      isDisposed = true;
      if (measureTimer !== null) window.clearTimeout(measureTimer);
      stopObserving();
    };
  }, [scrollElement]);
  return scrollElement === null ? NO_MARKS : marks;
}

function useDiffChangeRailModel(
  scrollElement: HTMLElement | null,
): DiffChangeRailModel {
  const viewport = useDiffChangeRailViewport(scrollElement);
  const marks = useDiffChangeRailMarks(scrollElement);
  return useMemo(() => ({ marks, viewport }), [marks, viewport]);
}

export function scrollTopForRailFraction(
  fraction: number,
  viewport: DiffChangeRailViewport,
): number {
  const maxScrollTop = Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight,
  );
  if (maxScrollTop === 0) return 0;
  const centered =
    clampRailFraction(fraction) * viewport.scrollHeight -
    viewport.clientHeight / 2;
  return Math.min(maxScrollTop, Math.max(0, centered));
}

export function diffChangeRailAriaValue(
  viewport: DiffChangeRailViewport,
): number {
  const maxScrollTop = Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight,
  );
  if (maxScrollTop === 0) return 0;
  return Math.round((viewport.scrollTop / maxScrollTop) * 100);
}

interface DiffChangeRailThumb {
  top: number;
  height: number;
}

function buildThumb(
  railHeight: number,
  viewport: DiffChangeRailViewport,
): DiffChangeRailThumb | null {
  if (railHeight <= 0 || viewport.scrollHeight <= 0) return null;
  const height = Math.min(
    railHeight,
    Math.max(
      MINIMUM_THUMB_HEIGHT_PX,
      Math.round((viewport.clientHeight / viewport.scrollHeight) * railHeight),
    ),
  );
  const top = Math.min(
    Math.max(0, railHeight - height),
    Math.round((viewport.scrollTop / viewport.scrollHeight) * railHeight),
  );
  return { top, height };
}

export interface DiffChangeRailFrameProps {
  ariaLabel: string;
  className?: string;
  contentHeight: number;
  marks: readonly DiffChangeRailMark[];
  onScrollByPixels: (deltaPx: number) => void;
  onScrollToFraction: (fraction: number) => void;
  viewport: DiffChangeRailViewport;
}

export function DiffChangeRailFrame({
  ariaLabel,
  className,
  contentHeight,
  marks,
  onScrollByPixels,
  onScrollToFraction,
  viewport,
}: DiffChangeRailFrameProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const [railHeight, setRailHeight] = useState(0);
  const measureRailHeight = useCallback(() => {
    const node = rootRef.current;
    if (node === null) return;
    const nextHeight = node.clientHeight;
    setRailHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);
  useEffect(() => {
    measureRailHeight();
    const node = rootRef.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureRailHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureRailHeight]);
  const scale =
    railHeight > 0 && contentHeight > 0 ? railHeight / contentHeight : 0;
  const bands = useMemo(
    () => buildDiffChangeRailBands(marks, scale),
    [marks, scale],
  );
  const thumb = useMemo(
    () => buildThumb(railHeight, viewport),
    [railHeight, viewport],
  );
  const handlePointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.height <= 0) return;
      onScrollToFraction(
        clampRailFraction((event.clientY - rect.top) / rect.height),
      );
    },
    [onScrollToFraction],
  );
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      isDraggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      handlePointer(event);
    },
    [handlePointer],
  );
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      handlePointer(event);
    },
    [handlePointer],
  );
  const handlePointerRelease = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [],
  );
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const steps: Record<string, number> = {
        ArrowDown: KEYBOARD_SCROLL_STEP_PX,
        ArrowUp: -KEYBOARD_SCROLL_STEP_PX,
        PageDown: viewport.clientHeight,
        PageUp: -viewport.clientHeight,
        End: viewport.scrollHeight,
        Home: -viewport.scrollHeight,
      };
      const delta = steps[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      onScrollByPixels(delta);
    },
    [onScrollByPixels, viewport.clientHeight, viewport.scrollHeight],
  );

  return (
    <div
      ref={rootRef}
      role="scrollbar"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={diffChangeRailAriaValue(viewport)}
      data-diff-change-rail=""
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      className={cn(
        "relative w-5 shrink-0 cursor-pointer touch-none select-none",
        "border-l border-border bg-surface-recessed/60",
        "hover:bg-state-hover",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-x-1 inset-y-0">
        {bands.map((band) => (
          <span
            key={band.top}
            data-diff-change-rail-band={band.kind}
            style={{
              top: band.top,
              height: band.height,
              ...(band.kind === "mixed" ? MIXED_BAND_STYLE : undefined),
            }}
            className={cn(
              "absolute inset-x-0 rounded-full",
              band.kind !== "mixed" && BAND_KIND_CLASS[band.kind],
            )}
          />
        ))}
      </span>
      {thumb === null ? null : (
        <span
          aria-hidden
          data-diff-change-rail-thumb=""
          style={{ top: thumb.top, height: thumb.height }}
          className="pointer-events-none absolute inset-x-1 rounded-full bg-muted-foreground/40"
        />
      )}
    </div>
  );
}

interface DiffChangeRailProps {
  className?: string;
  scrollElement: HTMLElement | null;
}

export function DiffChangeRail({
  className,
  scrollElement,
}: DiffChangeRailProps) {
  const [isChangeRailEnabled] = useGitDiffChangeRailPreference();
  const model = useDiffChangeRailModel(
    isChangeRailEnabled ? scrollElement : null,
  );
  const scrollToFraction = useCallback(
    (fraction: number) => {
      if (scrollElement === null) return;
      scrollElement.scrollTop = scrollTopForRailFraction(
        fraction,
        readDiffChangeRailViewport(scrollElement),
      );
    },
    [scrollElement],
  );
  const scrollByPixels = useCallback(
    (deltaPx: number) => {
      if (scrollElement === null) return;
      const maxScrollTop = Math.max(
        0,
        scrollElement.scrollHeight - scrollElement.clientHeight,
      );
      scrollElement.scrollTop = Math.min(
        maxScrollTop,
        Math.max(0, scrollElement.scrollTop + deltaPx),
      );
    },
    [scrollElement],
  );
  if (
    !isChangeRailEnabled ||
    model.marks.length === 0 ||
    model.viewport.scrollHeight <= model.viewport.clientHeight
  ) {
    return null;
  }
  return (
    <DiffChangeRailFrame
      ariaLabel={`Diff change map, ${model.marks.length} changed ${
        model.marks.length === 1 ? "region" : "regions"
      }`}
      className={className}
      contentHeight={model.viewport.scrollHeight}
      marks={model.marks}
      onScrollByPixels={scrollByPixels}
      onScrollToFraction={scrollToFraction}
      viewport={model.viewport}
    />
  );
}

const DIFF_CHANGE_RAIL_TOGGLE_BUTTON_CLASS =
  "size-6 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-state-hover hover:text-foreground [&_[data-icon-root]]:size-3.5 max-md:pointer-coarse:size-9 max-md:pointer-coarse:[&_[data-icon-root]]:size-5";

interface DiffChangeRailToggleProps {
  className?: string;
}

export function DiffChangeRailToggle({ className }: DiffChangeRailToggleProps) {
  const [isChangeRailEnabled, setIsChangeRailEnabled] =
    useGitDiffChangeRailPreference();
  const label = isChangeRailEnabled ? "Hide change map" : "Show change map";
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              DIFF_CHANGE_RAIL_TOGGLE_BUTTON_CLASS,
              className,
              isChangeRailEnabled && "bg-state-hover text-foreground",
            )}
            aria-label={label}
            aria-pressed={isChangeRailEnabled}
            onClick={() => setIsChangeRailEnabled(!isChangeRailEnabled)}
          >
            <Icon name="AlignLeft" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
