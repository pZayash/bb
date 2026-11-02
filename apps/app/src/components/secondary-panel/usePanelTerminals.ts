import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  closeSecondaryPanelTabInState,
  createNewTabFixedPanelTab,
} from "@bb/client-core";
import type {
  TerminalCreateTarget,
  TerminalSession,
} from "@bb/server-contract";
import { useAppCommandHandler } from "@/components/commands/AppCommandProvider";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from "@/components/thread/terminal/useThreadTerminalController";
import {
  usePendingTerminalIds,
  usePendingTerminals,
} from "@/components/thread/terminal/pending-terminals";
import { applyTerminalSessionUpsert } from "@/hooks/cache-owners/terminal-cache-owner";
// bb-fork(windows): build the start payload for the picked shell.
import { terminalShellStart } from "./terminalShellStart";
import {
  replaceFixedRightTerminalTabInState,
  restoreFixedRightTerminalTabInState,
  useRemoveFixedRightTerminalTab,
  useSetFixedRightTerminalActiveTerminal,
  useUpdateFixedPanelTabsState,
} from "@/lib/fixed-panel-tabs";
import { isVisibleTerminalSession } from "@/lib/terminal-session-visibility";

interface UsePanelTerminalsArgs {
  panelStateId: string | null | undefined;
  // bb-fork(windows): the shell picked beside the Start terminal action.
  shellIdForLaunch?: string | null | undefined;
  syncThreadId: string | null | undefined;
  createTarget: TerminalCreateTarget | null;
  isFocused: boolean;
  acceptsSession: (session: TerminalSession) => boolean;
  tabsCarryTarget: boolean;
  reveal: () => void;
  onCloseLastTab?: () => void;
}

export interface PanelTerminals {
  autoFocusTerminalId: string | null;
  canStart: boolean;
  // bb-fork(windows): a start is in flight for the shell picker's disabled state.
  isStarting: boolean;
  close: (terminalId: string) => void;
  handleAutoFocusHandled: () => void;
  open: (session: TerminalSession) => boolean;
  retryStart: (terminalId: string) => void;
  select: (terminalId: string, target?: TerminalCreateTarget) => void;
  start: () => void;
}

export function terminalTargetForSession(
  session: TerminalSession,
): TerminalCreateTarget {
  if (session.threadId !== null) {
    return { kind: "thread", threadId: session.threadId };
  }
  if (session.environmentId !== null) {
    return { kind: "environment", environmentId: session.environmentId };
  }
  return { kind: "host_path", hostId: session.hostId, cwd: session.initialCwd };
}

export function usePanelTerminals({
  panelStateId,
  shellIdForLaunch,
  syncThreadId,
  createTarget,
  isFocused,
  acceptsSession,
  tabsCarryTarget,
  reveal,
  onCloseLastTab,
}: UsePanelTerminalsArgs): PanelTerminals {
  const [autoFocusTerminalId, setAutoFocusTerminalId] = useState<string | null>(
    null,
  );
  const queryClient = useQueryClient();
  const pendingTerminals = usePendingTerminals();
  const updatePanelState = useUpdateFixedPanelTabsState(
    panelStateId,
    syncThreadId,
  );
  const setActiveTerminal = useSetFixedRightTerminalActiveTerminal(
    panelStateId,
    syncThreadId,
  );
  const removeTerminalTab = useRemoveFixedRightTerminalTab(
    panelStateId,
    syncThreadId,
    onCloseLastTab,
  );

  const select = useCallback(
    (terminalId: string, target?: TerminalCreateTarget) => {
      setAutoFocusTerminalId(terminalId);
      setActiveTerminal(terminalId, target);
      reveal();
    },
    [reveal, setActiveTerminal],
  );

  const open = useCallback(
    (session: TerminalSession) => {
      if (!isVisibleTerminalSession(session) || !acceptsSession(session)) {
        return false;
      }
      applyTerminalSessionUpsert({ queryClient, session });
      select(
        session.id,
        tabsCarryTarget ? terminalTargetForSession(session) : undefined,
      );
      return true;
    },
    [acceptsSession, queryClient, select, tabsCarryTarget],
  );

  const canStart = createTarget !== null;
  // bb-fork(windows): the picker disables while a start is in flight.
  const isStarting = usePendingTerminalIds().starting.size > 0;
  const start = useCallback(() => {
    if (createTarget === null) return;
    const terminalId = pendingTerminals.start({
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
      target: createTarget,
      // bb-fork(windows): launch the shell picked beside the action.
      ...terminalShellStart(shellIdForLaunch ?? null),
    });
    updatePanelState((state) =>
      closeSecondaryPanelTabInState(state, createNewTabFixedPanelTab().id),
    );
    select(terminalId, tabsCarryTarget ? createTarget : undefined);
  }, [
    createTarget,
    select,
    shellIdForLaunch,
    tabsCarryTarget,
    pendingTerminals,
    updatePanelState,
  ]);

  useAppCommandHandler("terminal.open", () => {
    if (!isFocused || !canStart) return false;
    start();
    return true;
  });

  const close = useCallback(
    (terminalId: string) => {
      if (pendingTerminals.discard(terminalId) !== null) {
        removeTerminalTab(terminalId);
        return;
      }
      const removed = removeTerminalTab(terminalId);
      pendingTerminals.close(terminalId, () => {
        if (removed === null) return;
        let reopensPanel = false;
        updatePanelState((state) => {
          reopensPanel = state.secondary.tabs.length === 0;
          return restoreFixedRightTerminalTabInState(state, removed);
        });
        if (reopensPanel) reveal();
      });
    },
    [pendingTerminals, removeTerminalTab, reveal, updatePanelState],
  );

  const retryStart = useCallback(
    (terminalId: string) => {
      const failed = pendingTerminals.discard(terminalId);
      if (failed === null) return;
      const nextTerminalId = pendingTerminals.start(failed.request);
      updatePanelState((state) =>
        replaceFixedRightTerminalTabInState(
          state,
          terminalId,
          nextTerminalId,
          tabsCarryTarget ? failed.request.target : undefined,
        ),
      );
      setAutoFocusTerminalId(nextTerminalId);
    },
    [tabsCarryTarget, pendingTerminals, updatePanelState],
  );

  const handleAutoFocusHandled = useCallback(
    () => setAutoFocusTerminalId(null),
    [],
  );

  return {
    autoFocusTerminalId,
    canStart,
    isStarting,
    close,
    handleAutoFocusHandled,
    open,
    retryStart,
    select,
    start,
  };
}
