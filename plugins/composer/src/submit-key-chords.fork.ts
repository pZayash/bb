// bb-fork(windows): Enter inserts a newline; the primary submit moves to the
// bb-fork(windows): deliberate Mod+Alt+Enter chord so a stray Enter cannot
// bb-fork(windows): send a half-written prompt. Mod+Enter keeps the modifier action.
export const FORK_ENTER_SUBMITS = false;

export function isForkPrimarySubmitKeyEvent(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    event.altKey &&
    !event.shiftKey
  );
}

export function forkPrimarySubmitAriaKeyshortcut(): string {
  return `${isAppleKeyboardPlatform() ? "Meta" : "Control"}+Alt+Enter`;
}

export function forkPrimarySubmitShortcutLabel(): string {
  return isAppleKeyboardPlatform() ? "⌥ ⌘ Enter" : "Ctrl + Alt + Enter";
}

function isAppleKeyboardPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad/i.test(navigator.platform ?? "")
  );
}
