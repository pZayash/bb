// bb-fork(file-diff): toolbar controls for the editor's diff mode.
import { cn } from "@/lib/utils";
import type { FileDiffOption, FileDiffState } from "../lib/file-diff.fork.js";

export type FileDiffViewMode = "split" | "unified";

interface FileDiffControlsProps {
  isActive: boolean;
  onSelectionChange: (value: string) => void;
  onToggle: () => void;
  onViewModeChange: (mode: FileDiffViewMode) => void;
  options: readonly FileDiffOption[];
  selection: string | null;
  state: FileDiffState;
  viewMode: FileDiffViewMode;
}

export function FileDiffControls({
  isActive,
  onSelectionChange,
  onToggle,
  onViewModeChange,
  options,
  selection,
  state,
  viewMode,
}: FileDiffControlsProps) {
  const label = isActive ? "Hide changes" : "Show changes";
  return (
    <div className="flex shrink-0 items-center gap-1">
      {isActive && options.length > 0 ? (
        <>
          <select
            aria-label="Diff base"
            className={cn(
              "h-6 max-w-40 cursor-pointer rounded-md border border-border bg-transparent px-1 text-xs",
              "text-muted-foreground hover:text-foreground",
              "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            )}
            value={selection ?? options[0]?.value ?? ""}
            onChange={(event) => onSelectionChange(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.monoPrefix === undefined
                  ? option.label
                  : `${option.monoPrefix} ${option.label}`}
              </option>
            ))}
          </select>
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
        </>
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
