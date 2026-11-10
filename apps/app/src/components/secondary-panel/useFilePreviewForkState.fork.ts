// bb-fork(file-diff): FilePreview's diff slot + export target funnel here.
import { useMemo, type ReactNode } from "react";
import { resolveExportBaseHref } from "@/lib/document-export";
import type { FileExportTarget } from "./FileExportMenu.js";
import type { FilePreviewState } from "./FilePreview";

export interface FilePreviewDiffSlot {
  content: ReactNode;
  isActive: boolean;
  toggle: ReactNode;
}

export interface FilePreviewForkState {
  diffContent: ReactNode | null;
  diffToggle: ReactNode | null;
  exportTarget: FileExportTarget | null;
  isDiffActive: boolean;
}

export function useFilePreviewForkState({
  exportBaseHref,
  slot,
  state,
}: {
  exportBaseHref: string | null;
  slot: FilePreviewDiffSlot | null;
  state: FilePreviewState;
}): FilePreviewForkState {
  const exportTarget = useMemo((): FileExportTarget | null => {
    if (state.kind === "html") {
      return {
        baseHref: resolveExportBaseHref(state.iframe.url),
        content: state.file.contents,
        fileName: state.file.name,
        sourceKind: "html",
      };
    }
    if (state.kind === "ready" && state.textPreviewKind === "markdown") {
      return {
        baseHref: exportBaseHref,
        content: state.file.contents,
        fileName: state.file.name,
        sourceKind: "markdown",
      };
    }
    return null;
  }, [exportBaseHref, state]);
  return {
    diffContent: slot?.content ?? null,
    diffToggle: slot?.toggle ?? null,
    exportTarget,
    isDiffActive: slot?.isActive === true,
  };
}
