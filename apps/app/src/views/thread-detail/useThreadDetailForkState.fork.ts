// bb-fork(thread-detail): every fork touchpoint of ThreadDetailView funnels
// through this hook so the upstream file keeps one narrow seam.
import type { Environment } from "@bb/domain";
import { useUpdateEnvironment } from "@/hooks/mutations/environment-mutations.fork";
import { useFileLinkFallbackRoots } from "@/hooks/useProjectSourceRootPath.fork";
import { useQuietReparentPreference } from "@/components/secondary-panel/quiet-reparent.fork";
import {
  useTerminalShellChoice,
  type TerminalShellChoice,
} from "@/components/secondary-panel/useTerminalShellChoice";
import { useThreadStartCommitView } from "@/lib/thread-start-view.fork";

export interface ThreadDetailForkState {
  fileLinkFallbackRoots: readonly string[];
  terminalShellChoice: TerminalShellChoice;
  threadStartRef: string | null;
  isSinceThreadStart: boolean;
  setIsSinceThreadStart: (active: boolean) => void;
  updateEnvironment: ReturnType<typeof useUpdateEnvironment>;
  quietReparent: boolean;
  setQuietReparent: (next: boolean) => void;
}

export function useThreadDetailForkState({
  projectId,
  environment,
}: {
  projectId: string | undefined;
  environment: Environment | undefined;
}): ThreadDetailForkState {
  const fileLinkFallbackRoots = useFileLinkFallbackRoots({
    projectId,
    hostId: environment?.hostId ?? null,
    workspaceRootPath: environment?.path,
  });
  const terminalShellChoice = useTerminalShellChoice(
    environment?.hostId ?? null,
  );
  const [isSinceThreadStart, setIsSinceThreadStart] = useThreadStartCommitView(
    environment?.id,
  );
  const updateEnvironment = useUpdateEnvironment();
  const [quietReparent, setQuietReparent] = useQuietReparentPreference();
  return {
    fileLinkFallbackRoots,
    terminalShellChoice,
    threadStartRef: environment?.startRef ?? null,
    isSinceThreadStart,
    setIsSinceThreadStart,
    updateEnvironment,
    quietReparent,
    setQuietReparent,
  };
}
