// bb-fork(thread-detail): fork controls rendered by ThreadDetailView through
// single-element seams fed by useThreadDetailForkState.
import type { Environment } from "@bb/domain";
import { TerminalShellSelector } from "@/components/secondary-panel/TerminalShellSelector";
import { StartCommitPicker } from "@/components/workspace/StartCommitPicker.fork";
import type { ThreadDetailForkState } from "./useThreadDetailForkState.fork";

export function ThreadStartCommitControl({
  canUseGitUi,
  environment,
  forkState,
}: {
  canUseGitUi: boolean;
  environment: Environment | undefined;
  forkState: ThreadDetailForkState;
}) {
  if (!canUseGitUi || environment === undefined) {
    return null;
  }
  return (
    <StartCommitPicker
      environmentId={environment.id}
      isActive={forkState.isSinceThreadStart}
      isSaving={forkState.updateEnvironment.isPending}
      onSelect={(ref) => {
        forkState.setIsSinceThreadStart(true);
        forkState.updateEnvironment.mutate({
          id: environment.id,
          startRef: ref,
        });
      }}
      onToggle={() =>
        forkState.setIsSinceThreadStart(!forkState.isSinceThreadStart)
      }
      startRef={forkState.threadStartRef}
    />
  );
}

export function ThreadTerminalShellControl({
  disabled,
  forkState,
}: {
  disabled: boolean;
  forkState: ThreadDetailForkState;
}) {
  const { terminalShellChoice } = forkState;
  return (
    <TerminalShellSelector
      defaultShell={terminalShellChoice.defaultShell}
      disabled={disabled}
      isLoading={terminalShellChoice.isLoading}
      onChange={terminalShellChoice.setSelectedShellId}
      selectedShellId={terminalShellChoice.selectedShellId}
      shells={terminalShellChoice.shells}
    />
  );
}
