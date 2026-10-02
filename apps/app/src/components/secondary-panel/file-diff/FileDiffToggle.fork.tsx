// bb-fork(file-diff): header toggle that swaps a file preview for its diff.
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@bb/shared-ui/tooltip";
import { cn } from "@bb/shared-ui/lib/utils";

const FILE_DIFF_TOGGLE_BUTTON_CLASS =
  "h-5 w-5 shrink-0 rounded-sm p-0 text-muted-foreground hover:bg-state-hover hover:text-foreground [&_[data-icon-root]]:size-3 max-md:pointer-coarse:h-9 max-md:pointer-coarse:w-9 max-md:pointer-coarse:[&_[data-icon-root]]:size-5";

interface FileDiffToggleProps {
  isActive: boolean;
  onToggle: () => void;
}

export function FileDiffToggle({ isActive, onToggle }: FileDiffToggleProps) {
  const label = isActive ? "Hide changes" : "Show changes";
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              FILE_DIFF_TOGGLE_BUTTON_CLASS,
              isActive && "bg-state-hover text-foreground",
            )}
            aria-label={label}
            aria-pressed={isActive}
            onClick={onToggle}
          >
            <Icon name="FileDiff" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
