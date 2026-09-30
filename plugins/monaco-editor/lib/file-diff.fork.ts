// bb-fork(file-diff): diff-mode state for the file the editor is showing.
import { useEffect, useRef, useState } from "react";
import type {
  PluginFileOpenerProps,
  PluginRpcClient,
  PluginRpcResult,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server.js";

type FileDiffResponse = PluginRpcResult<typeof rpcContract.diff>;

export type FileDiffOption = Extract<
  FileDiffResponse,
  { outcome: "available" }
>["options"][number];
export type FileDiffContents = Extract<
  FileDiffResponse,
  { outcome: "available" }
>["contents"];

export type FileDiffState =
  | { status: "idle" }
  | { status: "loading"; options: FileDiffOption[] }
  | {
      status: "ready";
      contents: FileDiffContents;
      options: FileDiffOption[];
      patch: string;
      selection: string;
      truncated: boolean;
    }
  | { status: "unavailable"; message: string };

const IDLE_STATE: FileDiffState = { status: "idle" };

function loadingState(current: FileDiffState): FileDiffState {
  const options =
    current.status === "ready" || current.status === "loading"
      ? current.options
      : [];
  return { status: "loading", options };
}

function toFileDiffState(response: FileDiffResponse): FileDiffState {
  return response.outcome === "available"
    ? {
        status: "ready",
        contents: response.contents ?? null,
        options: response.options,
        patch: response.patch,
        selection: response.selection,
        truncated: response.truncated,
      }
    : { status: "unavailable", message: response.message };
}

interface UseFileDiffArgs {
  enabled: boolean;
  path: string;
  rpc: PluginRpcClient<typeof rpcContract>;
  selection: string | null;
  source: PluginFileOpenerProps["source"];
}

export function useFileDiff({
  enabled,
  path,
  rpc,
  selection,
  source,
}: UseFileDiffArgs): FileDiffState {
  const [state, setState] = useState<FileDiffState>(IDLE_STATE);
  const requestIdRef = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sourceKey = [
    source.kind,
    source.environmentId ?? "",
    source.threadId ?? "",
    source.projectId ?? "",
  ].join("\u0000");
  const requestKey = [
    enabled ? "enabled" : "disabled",
    path,
    selection ?? "",
    sourceKey,
  ].join("\u0000");

  useEffect(() => {
    if (!enabled) {
      setState(IDLE_STATE);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState(loadingState);
    void rpc
      .call("diff", { path, selection, source: sourceRef.current })
      .then((response) => {
        if (requestIdRef.current !== requestId) return;
        setState(toFileDiffState(response));
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setState({
          status: "unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Could not load this file's diff.",
        });
      });
  }, [enabled, path, requestKey, rpc, selection]);

  return state;
}
