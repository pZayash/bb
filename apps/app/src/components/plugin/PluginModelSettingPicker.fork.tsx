// bb-fork(compaction-model): settings field that picks a model from a route
// provider's catalog instead of typing the provider/model-id string by hand.
import { useMemo, useRef, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { Input } from "@bb/shared-ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bb/shared-ui/popover";
import { LIST_HOVER_TRANSITION } from "@bb/shared-ui/motion";
import { cn } from "@bb/shared-ui/lib/utils";
import { useSystemExecutionOptions } from "@/hooks/queries/system-queries";
import { searchPickerOptions } from "@/components/pickers/picker-search";
import { PickerLoadingRows } from "@/components/pickers/PickerLoadingRows";
import { useResetPickerScroll } from "@/components/pickers/useResetPickerScroll";
import { formatModelLabel } from "@/hooks/useThreadCreationOptions";

interface PluginModelSettingPickerProps {
  providerId: string;
  value: string;
  onSelect: (value: string) => void;
  ariaLabel: string;
  ariaDescribedBy: string | undefined;
  ariaInvalid: boolean;
}

interface ModelOption {
  value: string;
  label: string;
  qualifier: string | undefined;
}

export function PluginModelSettingPicker({
  providerId,
  value,
  onSelect,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
}: PluginModelSettingPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useResetPickerScroll<HTMLDivElement>(query);
  const searchRef = useRef<HTMLInputElement>(null);
  const catalog = useSystemExecutionOptions({ providerId });

  const options = useMemo<ModelOption[]>(() => {
    const seen = new Set<string>();
    const result: ModelOption[] = [];
    for (const model of [
      ...(catalog.data?.models ?? []),
      ...(catalog.data?.selectedOnlyModels ?? []),
    ]) {
      if (seen.has(model.model)) continue;
      seen.add(model.model);
      result.push({
        value: model.model,
        label: formatModelLabel(model.displayName || model.model),
        qualifier: model.routeProviderId,
      });
    }
    return result;
  }, [catalog.data]);

  const filtered = useMemo(
    () =>
      searchPickerOptions({
        options,
        query,
        getLabel: (option) => option.label,
        getAliases: (option) => [option.value],
      }),
    [options, query],
  );

  const selectedOption = options.find((option) => option.value === value);
  const valueLabel =
    selectedOption?.label ??
    (value.length > 0 ? value : "Thread's own model");
  const isLoading = catalog.isLoading || catalog.isPlaceholderData;
  const loadFailed = catalog.isError || catalog.data?.modelLoadError != null;

  function select(next: string): void {
    onSelect(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full justify-between gap-2 px-2 text-xs font-normal sm:w-64"
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
        >
          <span className="min-w-0 truncate">{valueLabel}</span>
          <Icon
            name="ChevronDown"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        mobileTitle={ariaLabel}
        autoFocusRef={searchRef}
        className="flex min-h-0 w-72 flex-col p-0"
      >
        <div className="shrink-0 border-b border-border px-1.5 py-1">
          <div className="relative">
            <Icon
              name="Search"
              className="pointer-events-none absolute left-1.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
              aria-label="Search models"
              className="h-7 border-0 bg-transparent pl-8 pr-2 text-xs text-foreground shadow-none placeholder:text-subtle-foreground focus-visible:ring-0"
            />
          </div>
        </div>
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1 pt-0 max-h-64"
        >
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-[0.3125rem] text-left text-xs",
              LIST_HOVER_TRANSITION,
              "text-muted-foreground hover:bg-state-hover hover:text-foreground",
            )}
            onClick={() => select("")}
          >
            Thread's own model
          </button>
          {isLoading ? (
            <PickerLoadingRows
              label="Loading models"
              rowDataAttribute="data-model-setting-loading-row"
            />
          ) : loadFailed ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Could not load the model catalog
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-[0.3125rem] text-xs text-muted-foreground">
              {query.trim().length > 0
                ? "No models match your search"
                : "No models available"}
            </div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.value}
                className={cn(
                  "flex w-full items-baseline gap-2 rounded-sm px-2 py-[0.3125rem] text-left text-xs",
                  LIST_HOVER_TRANSITION,
                  "text-foreground hover:bg-state-hover",
                )}
                onClick={() => select(option.value)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {option.label}
                </span>
                {option.qualifier ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {option.qualifier}
                  </span>
                ) : null}
                {option.value === value ? (
                  <Icon
                    name="Check"
                    className="size-3.5 shrink-0 self-center text-foreground"
                  />
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
