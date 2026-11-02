// bb-fork(diff-rail): the change-map preference is fork-local; upstream moved the
// bb-fork(diff-rail): other git diff preferences into the git plugin.
import { useAtom } from "jotai";
import { createBooleanPreferenceAtom } from "./browser-storage";

export const GIT_DIFF_CHANGE_RAIL_STORAGE_KEY = "bb.thread.gitDiff.changeRail";

const gitDiffChangeRailPreferenceAtom = createBooleanPreferenceAtom(
  GIT_DIFF_CHANGE_RAIL_STORAGE_KEY,
  true,
);

export function useGitDiffChangeRailPreference() {
  return useAtom(gitDiffChangeRailPreferenceAtom);
}
