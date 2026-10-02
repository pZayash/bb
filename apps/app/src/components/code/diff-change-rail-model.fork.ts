// bb-fork(diff-rail): diff change-map geometry, scroll math, and hooks live here
// bb-fork(diff-rail): instead of in DiffChangeRail.fork.tsx, so that module
// bb-fork(diff-rail): exports components only and React Fast Refresh can update
// bb-fork(diff-rail): the rail without forcing a full page reload.
import { useEffect, useMemo, useState } from "react";
import {
  collectDiffChangeRows,
  observeDiffRows,
} from "./diff-change-rows.fork";

const CHANGE_LINE_TYPES = new Set(["change-addition", "change-deletion"]);
const MARK_MEASURE_DEBOUNCE_MS = 120;
const MINIMUM_BAND_HEIGHT_PX = 2;

export type DiffChangeRailBandKind = "addition" | "deletion" | "mixed";

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

export function clampRailFraction(fraction: number): number {
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

export function readDiffChangeRailViewport(
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

export function useDiffChangeRailModel(
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
