// bb-fork(file-diff): unified/split diff of one workspace file inside its tab.
import { useRef } from "react";
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
}

export function FileDiffView({
  controller,
  onSelectionAddToChat,
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
    displayModePreference ??
    (width >= FILE_DIFF_SPLIT_VIEW_MIN_WIDTH_PX ? "split" : "unified");

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <FileDiffToolbar
        displayMode={displayMode}
        lineOverflowMode={lineOverflowMode}
        onDisplayModeChange={setDisplayModePreference}
        onLineOverflowModeChange={setLineOverflowMode}
        onSelectionChange={controller.onSelectionChange}
        options={controller.options}
        selectionValue={controller.selectionValue}
      />
      <FileDiffBody
        bodyState={controller.bodyState}
        displayMode={displayMode}
        lineOverflowMode={lineOverflowMode}
        onRequestFileContents={controller.onRequestFileContents}
        onSelectionAddToChat={onSelectionAddToChat}
      />
    </div>
  );
}

function FileDiffBody({
  bodyState,
  displayMode,
  lineOverflowMode,
  onRequestFileContents,
  onSelectionAddToChat,
}: {
  bodyState: FileDiffController["bodyState"];
  displayMode: GitDiffDisplayMode;
  lineOverflowMode: CodeOverflowMode;
  onRequestFileContents: RequestDiffFileContents | undefined;
  onSelectionAddToChat?: (text: string) => void;
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto" data-file-diff-body="">
        <FileDiffReadyBody
          displayMode={displayMode}
          fileDiff={bodyState.fileDiff}
          lineOverflowMode={lineOverflowMode}
          onRequestFileContents={onRequestFileContents}
          onSelectionAddToChat={onSelectionAddToChat}
          patchText={bodyState.truncated ? undefined : bodyState.patchText}
        />
      </div>
      {bodyState.truncated ? (
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
  onSelectionChange,
  options,
  selectionValue,
}: {
  displayMode: GitDiffDisplayMode;
  lineOverflowMode: CodeOverflowMode;
  onDisplayModeChange: (mode: GitDiffDisplayMode) => void;
  onLineOverflowModeChange: (mode: CodeOverflowMode) => void;
  onSelectionChange: (value: string) => void;
  options: readonly GitDiffSelectionOption[];
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
