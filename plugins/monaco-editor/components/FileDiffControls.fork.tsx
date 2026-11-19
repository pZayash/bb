// bb-fork(file-diff): toolbar controls for the editor's diff mode and change marks.
import {
  experimental_DiffChangeNav,
  experimental_DiffChangeRailToggle,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { DiffCommit, FileDiffOption, FileDiffState } from "../lib/file-diff.fork.js";
import { DiffBasePicker } from "./DiffBasePicker.fork.js";

export type FileDiffViewMode = "split" | "unified";

const HostDiffChangeNav = experimental_DiffChangeNav;
const HostDiffChangeRailToggle = experimental_DiffChangeRailToggle;

// bb-fork(file-diff): prev/next stepping through the editor's change marks.
export interface EditorChangeNav {
  currentIndex: number;
  markCount: number;
  onNext: () => void;
  onPrevious: () => void;
}

interface FileDiffControlsProps {
  changeNav?: EditorChangeNav | null;
  commits: readonly DiffCommit[];
  commitsLoading: boolean;
  isActive: boolean;
  onSelectionChange: (value: string) => void;
  onToggle: () => void;
  onViewModeChange: (mode: FileDiffViewMode) => void;
  options: readonly FileDiffOption[];
  scrollElement: HTMLDivElement | null;
  selection: string | null;
  state: FileDiffState;
  viewMode: FileDiffViewMode;
}

export function FileDiffControls({
  changeNav = null,
  commits,
  commitsLoading,
  isActive,
  onSelectionChange,
  onToggle,
  onViewModeChange,
  options,
  scrollElement,
  selection,
  state,
  viewMode,
}: FileDiffControlsProps) {
  const label = isActive ? "Hide changes" : "Show changes";
  const hasBase = options.length > 0 || commits.length > 0;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {hasBase ? (
        <DiffBasePicker
          commits={commits}
          commitsLoading={commitsLoading}
          onSelect={onSelectionChange}
          options={options}
          selection={selection}
        />
      ) : null}
      {isActive && options.length > 0 ? (
        <div
          className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5"
          role="tablist"
          aria-label="Diff view mode"
        >
          <ModeButton
            isPressed={viewMode === "unified"}
            onClick={() => onViewModeChange("unified")}
            title="Show the diff stacked"
          >
            Unified
          </ModeButton>
          <ModeButton
            isPressed={viewMode === "split"}
            onClick={() => onViewModeChange("split")}
            title="Show the diff side by side"
          >
            Split
          </ModeButton>
        </div>
      ) : null}
      {isActive ? <HostDiffChangeNav scrollElement={scrollElement} /> : null}
      {isActive ? (
        <HostDiffChangeRailToggle
          className={cn("size-6 shrink-0 text-muted-foreground")}
        />
      ) : null}
      {!isActive && changeNav !== null ? (
        <div
          data-editor-change-nav=""
          className="inline-flex shrink-0 items-center gap-0.5"
        >
          <NavButton
            ariaLabel="Previous change"
            disabled={changeNav.markCount === 0}
            icon="ChevronUp"
            onClick={changeNav.onPrevious}
          />
          <span
            aria-hidden
            className="min-w-7 shrink-0 text-center text-xs tabular-nums text-muted-foreground"
          >
            {changeNav.markCount === 0
              ? "0/0"
              : `${changeNav.currentIndex + 1}/${changeNav.markCount}`}
          </span>
          <NavButton
            ariaLabel="Next change"
            disabled={changeNav.markCount === 0}
            icon="ChevronDown"
            onClick={changeNav.onNext}
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        title={state.status === "unavailable" ? state.message : label}
        aria-label={label}
        aria-pressed={isActive}
        className={cn(
          "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md",
          "transition-colors hover:bg-state-hover hover:text-foreground",
          "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
          isActive ? "bg-state-hover text-foreground" : "text-muted-foreground",
        )}
      >
        <DiffGlyph />
      </button>
    </div>
  );
}

function NavButton({
  ariaLabel,
  disabled,
  icon,
  onClick,
}: {
  ariaLabel: string;
  disabled: boolean;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md",
        "transition-colors hover:bg-state-hover hover:text-foreground",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        "text-muted-foreground",
      )}
    >
      <Icon name={icon} className="size-3.5" aria-hidden />
    </button>
  );
}

function ModeButton({
  children,
  isPressed,
  onClick,
  title,
}: {
  children: React.ReactNode;
  isPressed: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={isPressed}
      className={cn(
        "flex h-5 shrink-0 cursor-pointer items-center justify-center rounded-sm px-1.5 text-xs",
        "transition-colors hover:bg-state-hover hover:text-foreground",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        isPressed ? "bg-state-hover text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DiffGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden>
      <path
        d="M11 5.5H5.5A1.5 1.5 0 004 7v10a1.5 1.5 0 001.5 1.5H11M13 5.5h5.5A1.5 1.5 0 0120 7v10a1.5 1.5 0 01-1.5 1.5H13M12 3v18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 11.5h3M15 10v3M13.5 11.5h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
