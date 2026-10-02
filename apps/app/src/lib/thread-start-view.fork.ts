// bb-fork(thread-start-view): remember the "compare since the start commit" view per environment.
import { useCallback } from "react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { createJsonLocalStorage } from "./browser-storage";

const STORAGE_KEY = "bb.thread.startCommitView";

type StartCommitViewMap = Record<string, boolean>;

function isStartCommitViewMap(value: unknown): value is StartCommitViewMap {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

const startCommitViewAtom = atomWithStorage<StartCommitViewMap>(
  STORAGE_KEY,
  {},
  createJsonLocalStorage<StartCommitViewMap>(isStartCommitViewMap),
  { getOnInit: true },
);

export function useThreadStartCommitView(
  environmentId: string | null | undefined,
): readonly [boolean, (active: boolean) => void] {
  const [viewByEnvironment, setViewByEnvironment] = useAtom(startCommitViewAtom);
  const isActive =
    environmentId !== null &&
    environmentId !== undefined &&
    viewByEnvironment[environmentId] === true;
  const setActive = useCallback(
    (active: boolean) => {
      if (environmentId === null || environmentId === undefined) return;
      setViewByEnvironment((previous) => ({
        ...previous,
        [environmentId]: active,
      }));
    },
    [environmentId, setViewByEnvironment],
  );
  return [isActive, setActive];
}
