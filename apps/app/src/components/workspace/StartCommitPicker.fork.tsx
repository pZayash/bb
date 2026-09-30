// bb-fork(thread-start-ref): choose which commit a thread compares against.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BRANCH_PICKER_CONTENT_CLASS_NAME,
  BranchPickerRow,
  BranchPickerSearch,
  BranchPickerSectionHeader,
} from "@bb/shared-ui/branch-picker-primitives";
import { Icon } from "@bb/shared-ui/icon";
import { MenuHoverProvider } from "@bb/shared-ui/menu-item-hover";
import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";
import { cn } from "@bb/shared-ui/lib/utils";
import { useEnvironmentCommits } from "@/hooks/queries/environment-queries";
import { PromptBannerActionButton } from "@/components/promptbox/banner/prompt-banner-actions";
import { searchPickerOptions } from "@/components/pickers/picker-search";

interface StartCommitPickerProps {
  environmentId: string | null | undefined;
  isActive: boolean;
  isSaving: boolean;
  onSelect: (ref: string) => void;
  onToggle: () => void;
  startRef: string | null;
}

const COMMIT_ROW_META_CLASS = "shrink-0 text-muted-foreground text-xs";

export function StartCommitPicker({
  environmentId,
  isActive,
  isSaving,
  onSelect,
  onToggle,
  startRef,
}: StartCommitPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitsQuery = useEnvironmentCommits(environmentId, {
    enabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const commits = useMemo(
    () =>
      commitsQuery.data?.outcome === "available"
        ? commitsQuery.data.commits
        : [],
    [commitsQuery.data],
  );
  const filteredCommits = useMemo(
    () =>
      searchPickerOptions({
        options: commits,
        query: deferredQuery,
        getLabel: (commit) => `${commit.shortSha} ${commit.subject}`,
      }),
    [commits, deferredQuery],
  );
  const selectedCommit = commits.find((commit) => commit.sha === startRef);
  const triggerLabel = isActive ? "Since start" : "Start commit";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <PromptBannerActionButton
          type="button"
          aria-pressed={isActive}
          title={
            startRef === null
              ? "Choose the commit this thread compares from"
              : `Compare with the commit this thread started from (${startRef.slice(0, 7)})`
          }
          className={cn(isActive && "bg-state-hover text-foreground")}
        >
          <Icon name="GitBranch" className="size-3.5 shrink-0" aria-hidden />
          <span className="shrink-0">{triggerLabel}</span>
          <Icon name="ChevronDown" className="size-3 shrink-0" aria-hidden />
        </PromptBannerActionButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={16}
        mobileTitle="Start commit"
        autoFocusRef={inputRef}
        className={cn(BRANCH_PICKER_CONTENT_CLASS_NAME, "md:min-w-64")}
      >
        <MenuHoverProvider>
          <div className="shrink-0 border-b border-border p-1">
            <BranchPickerRow
              disabled={isSaving}
              icon="GitBranch"
              selected={isActive}
              title="Compare the workspace against the start commit"
              onSelect={onToggle}
            >
              <span className="min-w-0 flex-1 truncate">
                Compare since the start commit
              </span>
            </BranchPickerRow>
          </div>
          <BranchPickerSearch
            inputRef={inputRef}
            query={query}
            enterSelection={filteredCommits[0]?.sha ?? null}
            onEnterSelection={onSelect}
            onQueryChange={setQuery}
            ariaLabel="Search commits"
            placeholder="Search commits"
          />
          <div className="min-h-0 max-h-[60vh] overflow-y-auto overscroll-contain px-1 pb-1 pt-0 md:max-h-80">
            <BranchPickerSectionHeader
              label={
                startRef === null
                  ? "Start commit"
                  : `Start commit · ${startRef.slice(0, 7)}${
                      selectedCommit === undefined
                        ? ""
                        : ` ${selectedCommit.subject}`
                    }`
              }
            />
            {commitsQuery.isLoading ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Loading commits…
              </p>
            ) : commitsQuery.isError ? (
              <p className="px-2 py-3 text-center text-xs text-destructive">
                Could not load commits.
              </p>
            ) : filteredCommits.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No commits found.
              </p>
            ) : (
              filteredCommits.map((commit) => (
                <BranchPickerRow
                  key={commit.sha}
                  disabled={isSaving}
                  icon="GitBranch"
                  selected={commit.sha === startRef}
                  title={`${commit.shortSha} ${commit.subject}`}
                  onSelect={() => {
                    onSelect(commit.sha);
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
              ))
            )}
          </div>
        </MenuHoverProvider>
      </PopoverContent>
    </Popover>
  );
}
