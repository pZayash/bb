import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { GitDiffDisplayMode } from "@/components/secondary-panel/GitDiffToolbar";
import {
  createBooleanPreferenceAtom,
  createLocalStorageEnumStorage,
  createNullableLocalStorageEnumStorage,
} from "./browser-storage";
import {
  DEFAULT_CODE_OVERFLOW_MODE,
  type CodeOverflowMode,
} from "./code-overflow-mode";

export const GIT_DIFF_DISPLAY_MODE_STORAGE_KEY =
  "bb.thread.gitDiff.displayMode";
export const GIT_DIFF_LINE_OVERFLOW_MODE_STORAGE_KEY =
  "bb.thread.gitDiff.lineOverflowMode";
// bb-fork(diff-rail): show the change map beside a diff.
export const GIT_DIFF_CHANGE_RAIL_STORAGE_KEY = "bb.thread.gitDiff.changeRail";

function isGitDiffDisplayMode(value: string): value is GitDiffDisplayMode {
  return value === "unified" || value === "split";
}

function isCodeOverflowMode(value: string): value is CodeOverflowMode {
  return value === "wrap" || value === "scroll";
}

const gitDiffDisplayModePreferenceAtom =
  atomWithStorage<GitDiffDisplayMode | null>(
    GIT_DIFF_DISPLAY_MODE_STORAGE_KEY,
    null,
    createNullableLocalStorageEnumStorage(isGitDiffDisplayMode),
    { getOnInit: true },
  );

const gitDiffLineOverflowModePreferenceAtom = atomWithStorage<CodeOverflowMode>(
  GIT_DIFF_LINE_OVERFLOW_MODE_STORAGE_KEY,
  DEFAULT_CODE_OVERFLOW_MODE,
  createLocalStorageEnumStorage(isCodeOverflowMode),
  { getOnInit: true },
);

export function useGitDiffDisplayModePreference() {
  return useAtom(gitDiffDisplayModePreferenceAtom);
}

export function useGitDiffLineOverflowModePreference() {
  return useAtom(gitDiffLineOverflowModePreferenceAtom);
}

// bb-fork(diff-rail): the change map defaults to on and persists per client.
const gitDiffChangeRailPreferenceAtom = createBooleanPreferenceAtom(
  GIT_DIFF_CHANGE_RAIL_STORAGE_KEY,
  true,
);

export function useGitDiffChangeRailPreference() {
  return useAtom(gitDiffChangeRailPreferenceAtom);
}
