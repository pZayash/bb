// bb-fork(file-diff): unified/split diff of one workspace file inside its tab.
import { useCallback, useRef, useState } from "react";
import { useResizeObserver } from "usehooks-ts";
import { Button } from "@bb/shared-ui/button";
import {
  COARSE_POINTER_COMPACT_ICON_BUTTON_CLASS,
  COARSE_POINTER_TEXT_SM_CLASS,
} from "@bb/shared-ui/coarse-pointer-sizing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bb/shared-ui/dropdown-menu";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { DiffLoadingSkeleton } from "@/components/code/code-loading-skeletons";
// bb-fork(diff-rail): change map and change navigation beside the file diff.
import { DiffChangeNav } from "@/components/code/DiffChangeNav.fork";
import {
  DiffChangeRail,
  DiffChangeRailToggle,
} from "@/components/code/DiffChangeRail.fork";
import type { DiffPresentation } from "@/components/code/code-rendering";
import {
  GitDiffCardBody,
  useGitDiffCardBody,
  type RequestDiffFileContents,
} from "@/components/git-diff/GitDiffCardBody";
import {
  getGitDiffFileChangeKind,
  type ParsedGitDiffFile,
} from "@/components/git-diff/git-diff-parsing";
import {
  useGitDiffDisplayModePreference,
  useGitDiffLineOverflowModePreference,
} from "@/lib/git-diff-view-preferences";
import {
  getNextCodeOverflowMode,
  type CodeOverflowMode,
} from "@/lib/code-overflow-mode";
import type {
  GitDiffDisplayMode,
  GitDiffSelectionOption,
} from "../GitDiffToolbar";
import type { FileDiffController } from "./useFileDiff.fork";

const FILE_DIFF_SPLIT_VIEW_MIN_WIDTH_PX = 760;

const FILE_DIFF_VIEW_MODE_BUTTON_CLASS =
  "h-5 rounded-sm px-2 text-muted-foreground max-md:pointer-coarse:h-[30px]";

interface FileDiffViewProps {
  controller: FileDiffController;
  onSelectionAddToChat?: (text: string) => void;
  // bb-fork(file-diff-open): a view mode an open request asked for.
  requestedViewMode?: GitDiffDisplayMode | null;
  onRequestedViewModeUsed?: () => void;
}

export function FileDiffView({
  controller,
  onSelectionAddToChat,
  requestedViewMode = null,
  onRequestedViewModeUsed,
}: FileDiffViewProps) {
  const rootRef = useRef<HTMLDivElement>(null!);
  const { width = 0 } = useResizeObserver({
    ref: rootRef,
    box: "content-box",
  });
  const [displayModePreference, setDisplayModePreference] =
    useGitDiffDisplayModePreference();
  const [lineOverflowMode, setLineOverflowMode] =
    useGitDiffLineOverflowModePreference();
  const displayMode: GitDiffDisplayMode =
    requestedViewMode ??
    displayModePreference ??
    (width >= FILE_DIFF_SPLIT_VIEW_MIN_WIDTH_PX ? "split" : "unified");
  const handleDisplayModeChange = useCallback(
    (mode: GitDiffDisplayMode) => {
      onRequestedViewModeUsed?.();
      setDisplayModePreference(mode);
    },
    [onRequestedViewModeUsed, setDisplayModePreference],
  );
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <FileDiffToolbar
        displayMode={displayMode}
        lineOverflowMode={lineOverflowMode}
        onDisplayModeChange={handleDisplayModeChange}
        onLineOverflowModeChange={setLineOverflowMode}
        onScrollElementChange={setScrollElement}
        onSelectionChange={controller.onSelectionChange}
        options={controller.options}
        scrollElement={scrollElement}
        selectionValue={controller.selectionValue}
      />
      <FileDiffBody
        bodyState={controller.bodyState}
        displayMode={displayMode}
        lineOverflowMode={lineOverflowMode}
        onRequestFileContents={controller.onRequestFileContents}
        onScrollElementChange={setScrollElement}
        onSelectionAddToChat={onSelectionAddToChat}
        scrollElement={scrollElement}
      />
    </div>
  );
}

function FileDiffBody({
  bodyState,
  displayMode,
  lineOverflowMode,
  onRequestFileContents,
  onScrollElementChange,
  onSelectionAddToChat,
  scrollElement,
}: {
  bodyState: FileDiffController["bodyState"];
  displayMode: GitDiffDisplayMode;
  lineOverflowMode: CodeOverflowMode;
  onRequestFileContents: RequestDiffFileContents | undefined;
  onScrollElementChange: (element: HTMLDivElement | null) => void;
  onSelectionAddToChat?: (text: string) => void;
  scrollElement: HTMLDivElement | null;
}) {
  if (bodyState.status === "loading") {
    return <DiffLoadingSkeleton />;
  }
  if (bodyState.status !== "ready") {
    return (
      <div
        role="status"
        className="px-4 py-3 text-xs text-muted-foreground"
        data-file-diff-message=""
      >
        {bodyState.message}
      </div>
    );
  }
  return (
    <FileDiffReadyPanel
      displayMode={displayMode}
      fileDiff={bodyState.fileDiff}
      lineOverflowMode={lineOverflowMode}
      onRequestFileContents={onRequestFileContents}
      onScrollElementChange={onScrollElementChange}
      onSelectionAddToChat={onSelectionAddToChat}
      patchText={bodyState.truncated ? undefined : bodyState.patchText}
      scrollElement={scrollElement}
      truncated={bodyState.truncated}
    />
  );
}

function FileDiffReadyPanel({
  displayMode,
  fileDiff,
  lineOverflowMode,
  onRequestFileContents,
  onScrollElementChange,
  onSelectionAddToChat,
  patchText,
  scrollElement,
  truncated,
}: {
  displayMode: GitDiffDisplayMode;
  fileDiff: ParsedGitDiffFile;
  lineOverflowMode: CodeOverflowMode;
  onRequestFileContents: RequestDiffFileContents | undefined;
  onScrollElementChange: (element: HTMLDivElement | null) => void;
  onSelectionAddToChat?: (text: string) => void;
  patchText: string | undefined;
  scrollElement: HTMLDivElement | null;
  truncated: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div
          ref={onScrollElementChange}
          className="min-h-0 flex-1 overflow-auto"
          data-file-diff-body=""
        >
          <FileDiffReadyBody
            displayMode={displayMode}
            fileDiff={fileDiff}
            lineOverflowMode={lineOverflowMode}
            onRequestFileContents={onRequestFileContents}
            onSelectionAddToChat={onSelectionAddToChat}
            patchText={patchText}
          />
        </div>
        <DiffChangeRail scrollElement={scrollElement} />
      </div>
      {truncated ? (
        <div
          role="status"
          className="border-t border-border px-4 py-2 text-xs text-muted-foreground"
        >
          This diff was truncated for display.
        </div>
      ) : null}
    </div>
  );
}

function FileDiffReadyBody({
  displayMode,
  fileDiff,
  lineOverflowMode,
  onRequestFileContents,
  onSelectionAddToChat,
  patchText,
}: {
  displayMode: GitDiffDisplayMode;
  fileDiff: ParsedGitDiffFile;
  lineOverflowMode: CodeOverflowMode;
  onRequestFileContents: RequestDiffFileContents | undefined;
  onSelectionAddToChat?: (text: string) => void;
  patchText: string | undefined;
}) {
  const bodyState = useGitDiffCardBody({
    changeKind: getGitDiffFileChangeKind(fileDiff),
    fileDiff,
    onRequestFileContents,
    patchText,
  });
  const presentation: DiffPresentation = {
    expandUnchanged: true,
    overflow: lineOverflowMode,
    showLineNumbers: true,
    view: displayMode,
  };
  return (
    <GitDiffCardBody
      onSelectionAddToChat={onSelectionAddToChat}
      presentation={presentation}
      reservesCollapseGutter={false}
      state={bodyState}
      svgDisplayMode="preview"
    />
  );
}

function FileDiffToolbar({
  displayMode,
  lineOverflowMode,
  onDisplayModeChange,
  onLineOverflowModeChange,
  onScrollElementChange,
  onSelectionChange,
  options,
  scrollElement,
  selectionValue,
}: {
  displayMode: GitDiffDisplayMode;
  lineOverflowMode: CodeOverflowMode;
  onDisplayModeChange: (mode: GitDiffDisplayMode) => void;
  onLineOverflowModeChange: (mode: CodeOverflowMode) => void;
  onScrollElementChange: (element: HTMLDivElement | null) => void;
  onSelectionChange: (value: string) => void;
  options: readonly GitDiffSelectionOption[];
  scrollElement: HTMLDivElement | null;
  selectionValue: string;
}) {
  const selectedOption = options.find(
    (option) => option.value === selectionValue,
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-4 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 min-w-0 max-w-full justify-between gap-2 rounded-lg border border-border bg-transparent px-2.5 font-normal max-md:pointer-coarse:h-10",
              COARSE_POINTER_TEXT_SM_CLASS,
            )}
            aria-label="Diff base"
          >
            <span className="truncate">
              {selectedOption?.label ?? "Changes"}
            </span>
            <Icon name="ChevronDown" className="size-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onSelectionChange(option.value)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                {option.monoPrefix ? (
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {option.monoPrefix}
                  </span>
                ) : null}
                <span className="truncate">{option.label}</span>
              </span>
              <Icon
                name="Check"
                className={cn(
                  "size-3.5 shrink-0",
                  option.value === selectionValue ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <DiffChangeNav scrollElement={scrollElement} />
        <DiffChangeRailToggle />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            COARSE_POINTER_COMPACT_ICON_BUTTON_CLASS,
            "text-muted-foreground",
          )}
          aria-label={
            lineOverflowMode === "wrap"
              ? "Disable line wrap"
              : "Wrap long lines"
          }
          aria-pressed={lineOverflowMode === "wrap"}
          onClick={() =>
            onLineOverflowModeChange(getNextCodeOverflowMode(lineOverflowMode))
          }
        >
          <Icon name="TextWrap" />
        </Button>
        <div
          className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5"
          role="tablist"
          aria-label="Diff view mode"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              FILE_DIFF_VIEW_MODE_BUTTON_CLASS,
              COARSE_POINTER_TEXT_SM_CLASS,
            )}
            onClick={() => onDisplayModeChange("unified")}
            aria-pressed={displayMode === "unified"}
          >
            Unified
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              FILE_DIFF_VIEW_MODE_BUTTON_CLASS,
              COARSE_POINTER_TEXT_SM_CLASS,
            )}
            onClick={() => onDisplayModeChange("split")}
            aria-pressed={displayMode === "split"}
          >
            Split
          </Button>
        </div>
      </div>
    </div>
  );
}
