// bb-fork(windows): the primary submit chord is Mod+Alt+Enter, not Enter.
// bb-fork(windows): Enter inserts a newline in the composer; the editor flag
// bb-fork(windows): lives in plugins/composer/src/submit-key-chords.fork.ts.
import type { AppShortcut } from "@bb/domain";
import { browserPlatform, presentAppShortcut } from "@/lib/app-keybindings";

export const FORK_ENTER_SUBMITS = false;

const PRIMARY_SUBMIT_SHORTCUT: AppShortcut = {
  key: "Enter",
  mod: true,
  meta: false,
  control: false,
  alt: true,
  shift: false,
};

export function forkPrimarySubmitShortcut(): {
  label: string;
  ariaKeyshortcuts: string;
} {
  return presentAppShortcut(PRIMARY_SUBMIT_SHORTCUT, browserPlatform());
}

export function forkPrimarySubmitShortcutLabel(): string {
  return forkPrimarySubmitShortcut().label;
}
