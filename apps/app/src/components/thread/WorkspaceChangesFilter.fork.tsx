// bb-fork(changed-files-filter): the changed-files list with a path filter field.
import { useDeferredValue, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  COARSE_POINTER_COMPACT_ICON_SIZE_CLASS,
  COARSE_POINTER_TEXT_SM_CLASS,
} from "@bb/shared-ui/coarse-pointer-sizing";
import { EmptyState } from "@bb/shared-ui/empty-state";
import { Icon } from "@bb/shared-ui/icon";
import { Input } from "@bb/shared-ui/input";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  WorkspaceChangesList,
  type WorkspaceChangedFile,
} from "@/components/thread/WorkspaceChangesList";
import {
  filterWorkspaceChangedFiles,
  WORKSPACE_CHANGES_FILTER_MIN_FILES,
  WORKSPACE_CHANGES_FILTER_PLACEHOLDER,
} from "@/components/thread/workspace-changes-filter.fork";

type WorkspaceChangedFileClickHandler = (file: WorkspaceChangedFile) => void;

export interface WorkspaceChangesFilteredListProps {
  files: readonly WorkspaceChangedFile[];
  className?: string;
  limit?: number;
  onFileClick?: WorkspaceChangedFileClickHandler;
  onOpenDiffClick?: WorkspaceChangedFileClickHandler;
}

interface WorkspaceChangesFilterFieldProps {
  matchCount: number;
  onChange: (value: string) => void;
  totalCount: number;
  value: string;
}

function WorkspaceChangesFilterField({
  matchCount,
  onChange,
  totalCount,
  value,
}: WorkspaceChangesFilterFieldProps) {
  return (
    <div className="relative px-3 pb-1 pt-1">
      <span className="pointer-events-none absolute inset-y-0 left-5.25 flex w-8 items-center justify-center text-muted-foreground">
        <Icon name="Filter" className="size-3.5" />
      </span>
      <Input
        aria-label="Filter changed files by path"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          "h-8 rounded-lg border-border pl-12 focus-visible:ring-0 max-md:pointer-coarse:h-10",
          COARSE_POINTER_TEXT_SM_CLASS,
          value ? "pr-20" : "pr-8",
        )}
        placeholder={WORKSPACE_CHANGES_FILTER_PLACEHOLDER}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onChange("");
          }
        }}
      />
      {value ? (
        <>
          <span
            aria-live="polite"
            className={cn(
              "pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground",
              COARSE_POINTER_TEXT_SM_CLASS,
            )}
          >
            {matchCount} / {totalCount}
          </span>
          <button
            type="button"
            className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center text-muted-foreground hover:text-foreground"
            aria-label="Clear file filter"
            onClick={() => onChange("")}
          >
            <Icon name="X" className={COARSE_POINTER_COMPACT_ICON_SIZE_CLASS} />
          </button>
        </>
      ) : null}
    </div>
  );
}

export function WorkspaceChangesFilteredList({
  files,
  className,
  limit,
  onFileClick,
  onOpenDiffClick,
}: WorkspaceChangesFilteredListProps) {
  const threadId = useParams<{ threadId?: string }>().threadId ?? "";
  const [queryByThreadId, setQueryByThreadId] = useState<
    Readonly<Record<string, string>>
  >({});
  const query = queryByThreadId[threadId] ?? "";
  const deferredQuery = useDeferredValue(query);
  const filteredFiles = useMemo(
    () => filterWorkspaceChangedFiles(files, deferredQuery),
    [files, deferredQuery],
  );
  const isFiltering = query.trim() !== "";
  const list = (
    <WorkspaceChangesList
      className={className}
      files={filteredFiles}
      limit={limit}
      onFileClick={onFileClick}
      onOpenDiffClick={onOpenDiffClick}
    />
  );

  if (files.length < WORKSPACE_CHANGES_FILTER_MIN_FILES) {
    return list;
  }

  return (
    <div className="min-w-0">
      <WorkspaceChangesFilterField
        matchCount={filteredFiles.length}
        onChange={(value) =>
          setQueryByThreadId((previous) => ({
            ...previous,
            [threadId]: value,
          }))
        }
        totalCount={files.length}
        value={query}
      />
      {isFiltering && filteredFiles.length === 0 ? (
        <div className="px-3 pb-2">
          <EmptyState message={`No changed files match “${query.trim()}”.`} />
        </div>
      ) : (
        list
      )}
    </div>
  );
}
