import type { WorkspaceStatus } from "@bb/domain";
import { DiffStatsTally } from "@/components/ui/diff-stats-tally.js";
import { EmptyState } from "@bb/shared-ui/empty-state";
import { FilePathLink } from "@/components/ui/file-path-link.js";
import { Icon } from "@bb/shared-ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@bb/shared-ui/tooltip";
import { cn } from "@bb/shared-ui/lib/utils";
import { formatWorkspaceFileStatus } from "@/components/workspace/workspace-change-summary";

export type WorkspaceChangedFile =
  WorkspaceStatus["workingTree"]["files"][number];

type WorkspaceChangedFileClickHandler = (file: WorkspaceChangedFile) => void;

interface WorkspaceChangesListProps {
  files: readonly WorkspaceChangedFile[];
  className?: string;
  // bb-fork(diff-action): callers may add a split-diff hover action per row.
  onFileClick?: WorkspaceChangedFileClickHandler;
  onOpenDiffClick?: WorkspaceChangedFileClickHandler;
  limit?: number;
}

interface WorkspaceChangesListItemProps {
  file: WorkspaceChangedFile;
  onFileClick?: WorkspaceChangedFileClickHandler;
  onOpenDiffClick?: WorkspaceChangedFileClickHandler;
}

const WORKSPACE_CHANGE_ROW_CLASS =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3";

const WORKSPACE_CHANGE_ROW_ACTION_CLASS =
  "inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100";

export const WORKSPACE_CHANGES_LIST_MAX_ROWS = 200;

function formatHiddenFileCount(count: number): string {
  return `${count.toLocaleString()} more ${count === 1 ? "file" : "files"} not shown`;
}

function fileKey(file: WorkspaceChangedFile): string {
  return `${file.status}:${file.path}`;
}

function WorkspaceChangesListItem({
  file,
  onFileClick,
  onOpenDiffClick,
}: WorkspaceChangesListItemProps) {
  const rowContent = (
    <>
      <span className="text-xs leading-5 text-muted-foreground opacity-70">
        {formatWorkspaceFileStatus(file.status)}
      </span>
      <FilePathLink
        path={file.path}
        className={cn(
          "opacity-70",
          onFileClick ? "group-hover:underline" : undefined,
        )}
      />
      {file.insertions !== null && file.deletions !== null ? (
        <DiffStatsTally
          insertions={file.insertions}
          deletions={file.deletions}
          hideZero
          className="text-xs leading-5"
        />
      ) : null}
    </>
  );

  // bb-fork(diff-action): the optional diff action floats beside the row name.
  const diffAction = onOpenDiffClick ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={WORKSPACE_CHANGE_ROW_ACTION_CLASS}
          aria-label={`Open split diff for ${file.path}`}
          onClick={() => onOpenDiffClick(file)}
        >
          <Icon name="Columns2" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">Open split diff</TooltipContent>
    </Tooltip>
  ) : null;

  if (!onFileClick) {
    return (
      <div className="group flex items-start gap-1">
        <div className={cn(WORKSPACE_CHANGE_ROW_CLASS, "min-w-0 flex-1")}>
          {rowContent}
        </div>
        {diffAction}
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1">
      <button
        type="button"
        className={cn(
          WORKSPACE_CHANGE_ROW_CLASS,
          "min-w-0 flex-1 rounded px-1 text-left transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label={`Open ${file.path}`}
        onClick={() => onFileClick(file)}
      >
        {rowContent}
      </button>
      {diffAction}
    </div>
  );
}

export function WorkspaceChangesList({
  files,
  className = "max-h-32",
  onFileClick,
  onOpenDiffClick,
  limit,
}: WorkspaceChangesListProps) {
  if (!files || files.length === 0) {
    return <EmptyState message="No changed files detected." />;
  }

  const maxRows = limit ?? WORKSPACE_CHANGES_LIST_MAX_ROWS;
  const visibleFiles =
    files.length > maxRows ? files.slice(0, maxRows) : files;
  const hiddenFileCount = files.length - visibleFiles.length;

  return (
    <TooltipProvider>
      <ul className={cn("space-y-1 overflow-auto", className)}>
        {visibleFiles.map((file) => (
          <li key={fileKey(file)}>
            <WorkspaceChangesListItem
              file={file}
              onFileClick={onFileClick}
              onOpenDiffClick={onOpenDiffClick}
            />
          </li>
        ))}
        {hiddenFileCount > 0 ? (
          <li className="px-1 text-xs leading-5 text-muted-foreground">
            {formatHiddenFileCount(hiddenFileCount)}
          </li>
        ) : null}
      </ul>
    </TooltipProvider>
  );
}
