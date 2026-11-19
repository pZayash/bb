// bb-fork(file-diff-base): popover base picker mirroring the composer's
// bb-fork(file-diff-base): start-commit picker; commit rows select since_commit:.
import { useDeferredValue, useMemo, useRef, useState } from "react";
import {
  BRANCH_PICKER_CONTENT_CLASS_NAME,
  BranchPickerRow,
  BranchPickerSearch,
  BranchPickerSectionHeader,
} from "@/components/ui/branch-picker-primitives";
import { Icon } from "@/components/ui/icon";
import { MenuHoverProvider } from "@/components/ui/menu-item-hover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DiffCommit, FileDiffOption } from "../lib/file-diff.fork.js";
import { SINCE_COMMIT_PREFIX } from "../lib/file-diff-selection.fork.js";

interface DiffBasePickerProps {
  commits: readonly DiffCommit[];
  commitsLoading: boolean;
  onSelect: (value: string) => void;
  options: readonly FileDiffOption[];
  selection: string | null;
}

const COMMIT_ROW_META_CLASS = "shrink-0 text-muted-foreground text-xs";

function optionLabel(option: FileDiffOption): string {
  return option.monoPrefix === undefined
    ? option.label
    : `${option.monoPrefix} ${option.label}`;
}

export function DiffBasePicker({
  commits,
  commitsLoading,
  onSelect,
  options,
  selection,
}: DiffBasePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommits = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (needle.length === 0) return commits;
    return commits.filter((commit) =>
      `${commit.shortSha} ${commit.subject}`.toLowerCase().includes(needle),
    );
  }, [commits, deferredQuery]);

  const selectedOption = options.find((option) => option.value === selection);
  const sinceSelection =
    selectedOption === undefined &&
    selection !== null &&
    selection.startsWith(SINCE_COMMIT_PREFIX)
      ? selection.slice(SINCE_COMMIT_PREFIX.length)
      : null;
  const triggerLabel =
    selectedOption !== undefined
      ? optionLabel(selectedOption)
      : sinceSelection !== null
        ? `Since ${sinceSelection.slice(0, 7)}`
        : (selection ?? "Compare");

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Diff base: ${triggerLabel}`}
          title="Choose the base this diff compares against"
          className={cn(
            "flex h-6 max-w-44 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border px-1.5 text-xs",
            "text-muted-foreground hover:text-foreground",
            "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <Icon name="ChevronDown" className="size-3 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={16}
        mobileTitle="Diff base"
        autoFocusRef={inputRef}
        className={cn(BRANCH_PICKER_CONTENT_CLASS_NAME, "md:min-w-64")}
      >
        <MenuHoverProvider>
          {options.length > 0 ? (
            <div className="shrink-0 border-b border-border p-1">
              <BranchPickerSectionHeader label="Compare" />
              {options.map((option) => (
                <BranchPickerRow
                  key={option.value}
                  value={option.value}
                  icon="GitBranch"
                  selected={option.value === selection}
                  title={optionLabel(option)}
                  onSelect={() => {
                    onSelect(option.value);
                    setIsOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  {option.monoPrefix === undefined ? null : (
                    <span className={COMMIT_ROW_META_CLASS}>
                      {option.monoPrefix}
                    </span>
                  )}
                </BranchPickerRow>
              ))}
            </div>
          ) : null}
          <BranchPickerSearch
            inputRef={inputRef}
            query={query}
            onQueryChange={setQuery}
            ariaLabel="Search commits"
            placeholder="Search commits"
          />
          <div className="min-h-0 max-h-[60vh] overflow-y-auto overscroll-contain px-1 pb-1 pt-0 md:max-h-80">
            <BranchPickerSectionHeader label="Base commit" />
            {commitsLoading ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Loading commits…
              </p>
            ) : filteredCommits.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No commits found.
              </p>
            ) : (
              filteredCommits.map((commit) => {
                const value = `${SINCE_COMMIT_PREFIX}${commit.sha}`;
                return (
                  <BranchPickerRow
                    key={commit.sha}
                    value={value}
                    icon="GitBranch"
                    selected={selection === value}
                    title={`${commit.shortSha} ${commit.subject}`}
                    onSelect={() => {
                      onSelect(value);
                      setIsOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {commit.subject}
                    </span>
                    <span className={COMMIT_ROW_META_CLASS}>
                      {commit.shortSha}
                    </span>
                  </BranchPickerRow>
                );
              })
            )}
          </div>
        </MenuHoverProvider>
      </PopoverContent>
    </Popover>
  );
}
