// bb-fork(md-preview): source/preview switch for Markdown files.
import { cn } from "@/lib/utils";
import type { MarkdownPreviewViewMode } from "../lib/markdown-preview.fork.js";

interface MarkdownPreviewToggleProps {
  onViewModeChange: (viewMode: MarkdownPreviewViewMode) => void;
  viewMode: MarkdownPreviewViewMode;
}

const OPTIONS: readonly {
  label: string;
  viewMode: MarkdownPreviewViewMode;
}[] = [
  { label: "Source", viewMode: "source" },
  { label: "Preview", viewMode: "preview" },
];

export function MarkdownPreviewToggle({
  onViewModeChange,
  viewMode,
}: MarkdownPreviewToggleProps) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5"
      role="tablist"
      aria-label="Markdown view mode"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.viewMode}
          type="button"
          onClick={() => onViewModeChange(option.viewMode)}
          aria-pressed={viewMode === option.viewMode}
          className={cn(
            "h-5 cursor-pointer rounded-sm px-2 text-xs transition-colors",
            "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            viewMode === option.viewMode
              ? "bg-state-hover text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
