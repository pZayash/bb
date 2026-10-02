// bb-fork(file-diff-view): remember an open file diff per workspace file across panel remounts.
import { useCallback } from "react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { FilePreviewDiffBase, FilePreviewDiffView } from "@bb/client-core";
import { createJsonLocalStorage } from "./browser-storage";

const STORAGE_KEY = "bb.thread.fileDiffView";

export interface FileDiffTabView {
  base?: FilePreviewDiffBase;
  isActive: boolean;
  view?: FilePreviewDiffView;
}

type FileDiffTabViewMap = Record<string, FileDiffTabView>;

function isFileDiffTabView(value: unknown): value is FileDiffTabView {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.isActive === "boolean" &&
    (candidate.base === undefined ||
      candidate.base === "merge_base" ||
      candidate.base === "thread_start") &&
    (candidate.view === undefined ||
      candidate.view === "unified" ||
      candidate.view === "split")
  );
}

function isFileDiffTabViewMap(value: unknown): value is FileDiffTabViewMap {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isFileDiffTabView)
  );
}

const fileDiffTabViewAtom = atomWithStorage<FileDiffTabViewMap>(
  STORAGE_KEY,
  {},
  createJsonLocalStorage<FileDiffTabViewMap>(isFileDiffTabViewMap),
  { getOnInit: true },
);

interface FileDiffTabSite {
  environmentId: string | null | undefined;
  path: string;
}

function siteKey({
  environmentId,
  path,
}: FileDiffTabSite): string | null {
  if (environmentId === null || environmentId === undefined) return null;
  return `${environmentId}\u0000${path}`;
}

export function useFileDiffTabView({
  environmentId,
  path,
}: FileDiffTabSite): {
  setStoredView: (next: FileDiffTabView) => void;
  storedView: FileDiffTabView | undefined;
} {
  const [views, setViews] = useAtom(fileDiffTabViewAtom);
  const key = siteKey({ environmentId, path });
  const setStoredView = useCallback(
    (next: FileDiffTabView) => {
      if (key === null) return;
      setViews((previous) => ({ ...previous, [key]: next }));
    },
    [key, setViews],
  );
  return {
    setStoredView,
    storedView: key === null ? undefined : views[key],
  };
}
