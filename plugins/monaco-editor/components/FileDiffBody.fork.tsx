// bb-fork(file-diff): the editor's diff body, rendered with the host diff viewer.
import {
  experimental_Diff,
  experimental_DiffChangeRail,
} from "@get-bb/plugin-sdk/app";
import type { FileDiffState } from "../lib/file-diff.fork.js";
import type { FileDiffViewMode } from "./FileDiffControls.fork.js";

const HostDiffView = experimental_Diff;
const HostDiffChangeRail = experimental_DiffChangeRail;

interface FileDiffBodyProps {
  onScrollElementChange: (element: HTMLDivElement | null) => void;
  path: string;
  scrollElement: HTMLDivElement | null;
  state: FileDiffState;
  viewMode: FileDiffViewMode;
}

export function FileDiffBody({
  onScrollElementChange: setScrollElement,
  path,
  scrollElement,
  state,
  viewMode,
}: FileDiffBodyProps) {
  if (state.status === "ready") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div
            ref={setScrollElement}
            className="min-h-0 flex-1 overflow-auto"
            data-file-diff-body=""
          >
            <HostDiffView
              patch={state.patch}
              path={path}
              view={viewMode}
              overflow="scroll"
              showLineNumbers
              {...(state.contents === null
                ? {}
                : {
                    experimental_expandUnchanged: true,
                    experimental_fullFileContents: {
                      new: { content: state.contents.new, path },
                      old: { content: state.contents.old, path },
                    },
                  })}
            />
          </div>
          <HostDiffChangeRail scrollElement={scrollElement} />
        </div>
        {state.truncated ? (
          <div
            role="status"
            className="border-t border-border px-4 py-2 text-xs text-muted-foreground"
          >
            This diff was truncated for display.
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      role="status"
      data-file-diff-message=""
      className="min-h-0 flex-1 px-4 py-3 text-xs text-muted-foreground"
    >
      {state.status === "unavailable" ? state.message : "Loading changes…"}
    </div>
  );
}
