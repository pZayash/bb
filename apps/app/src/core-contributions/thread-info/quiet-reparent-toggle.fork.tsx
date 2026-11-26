// bb-fork(quiet-reparent): the Info-tab Parent row keeps the fork's quiet switch.
import { Checkbox } from "@bb/shared-ui/checkbox";
import { COARSE_POINTER_TEXT_SM_CLASS } from "@bb/shared-ui/coarse-pointer-sizing";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bb/shared-ui/tooltip";

interface QuietReparentToggleProps {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

export function QuietReparentToggle({
  checked,
  disabled,
  onChange,
}: QuietReparentToggleProps) {
  return (
    <label
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-muted-foreground",
        COARSE_POINTER_TEXT_SM_CLASS,
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
        aria-label="Quiet reparent"
      />
      Quiet reparent
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            <Icon name="Info" className="size-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Reparent without a system turn on the old or new parent
        </TooltipContent>
      </Tooltip>
    </label>
  );
}
