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
      patchPath: string;
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
        patchPath: response.patchPath,
        selection: response.selection,
        truncated: response.truncated,
      }
    : { status: "unavailable", message: response.message };
}

interface UseFileDiffArgs {
  enabled: boolean;
  // bb-fork(file-diff-base): the indicator marks need the patch, not the sides.
  includeContents?: boolean;
  path: string;
  // bb-fork(file-diff): bump to refetch after the file on disk changed.
  revision?: number;
  rpc: PluginRpcClient<typeof rpcContract>;
  selection: string | null;
  source: PluginFileOpenerProps["source"];
}

export function useFileDiff({
  enabled,
  includeContents = true,
  path,
  revision = 0,
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
    includeContents ? "contents" : "no-contents",
    String(revision),
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
      .call("diff", {
        includeContents,
        path,
        selection,
        source: sourceRef.current,
      })
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
  }, [enabled, includeContents, path, requestKey, rpc, selection]);

  return state;
}

// bb-fork(file-diff-base): recent workspace commits for the base picker.
export interface DiffCommit {
  sha: string;
  shortSha: string;
  subject: string;
}

export interface DiffCommitsState {
  commits: DiffCommit[];
  isLoading: boolean;
}

const NO_COMMITS: DiffCommit[] = [];

export function useDiffCommits({
  enabled,
  rpc,
  source,
}: {
  enabled: boolean;
  rpc: PluginRpcClient<typeof rpcContract>;
  source: PluginFileOpenerProps["source"];
}): DiffCommitsState {
  const [state, setState] = useState<DiffCommitsState>({
    commits: NO_COMMITS,
    isLoading: false,
  });
  const requestIdRef = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sourceKey = [
    source.kind,
    source.environmentId ?? "",
    source.threadId ?? "",
    source.projectId ?? "",
  ].join("\u0000");

  useEffect(() => {
    if (!enabled) {
      setState({ commits: NO_COMMITS, isLoading: false });
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ commits: NO_COMMITS, isLoading: true });
    void rpc
      .call("commits", { source: sourceRef.current })
      .then((response) => {
        if (requestIdRef.current !== requestId) return;
        setState({
          commits:
            response.outcome === "available" ? response.commits : NO_COMMITS,
          isLoading: false,
        });
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setState({ commits: NO_COMMITS, isLoading: false });
      });
  }, [enabled, rpc, sourceKey]);

  return state;
}
