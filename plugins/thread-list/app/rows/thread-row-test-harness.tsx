// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import { getDefaultStore } from "jotai";
import { CompactViewportOverrideProvider } from "@/components/ui/hooks/use-compact-viewport";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarRenameProvider } from "./SidebarInlineRename.js";
import type { RenamePresentationOutcome } from "@/components/ui/inline-rename-presentation-cases";
import type {
  PluginProvidersState,
  PluginSidebarProject,
  PluginSidebarSplitLayout,
  PluginSidebarThread,
  PluginSidebarThreadRowStatus,
  PluginThreadActionEntry,
} from "@get-bb/plugin-sdk/app";
import {
  installTestPluginRuntime,
  renderSlot,
  type PluginSdkTestFakes,
  type RenderedSlot,
  type TestThreadActionsResolver,
  type TestThreadBulkActionsResolver,
} from "@get-bb/plugin-sdk/testing/app";
import { makeSidebarThread } from "../model/fixtures.js";
import { sidebarShowProviderIconsAtom } from "../preferences/atoms.js";
import { SidebarProjectsContext } from "../model/use-sidebar-data.js";
import type { ThreadRowOptions } from "./ThreadRow.js";
import {
  CustomizeRowActionsContext,
  ThreadRowActionsCustomizingContext,
} from "../list/customizeRowActionsContext.js";

installTestPluginRuntime();
export const { SidebarDraftPresenceSync } =
  await import("../list/sidebarDraftPresence.js");
export const { ThreadRowNavigationProvider } =
  await import("./threadRowNavigation.js");
export const { ThreadSelectionProvider } =
  await import("../selection/threadSelection.js");
export const {
  resetSidebarTitleDoubleClickForTest,
  SidebarProvidersContext,
  ThreadRow,
} = await import("./ThreadRow.js");

export const DEFAULT_OPTIONS: ThreadRowOptions = {
  kind: "default",
  depth: 1,
  isCompact: false,
};

export function createThread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return makeSidebarThread(overrides);
}

export function activity(
  overrides: Partial<PluginSidebarThread["activity"]>,
): PluginSidebarThread["activity"] {
  return {
    workflows: 0,
    backgroundAgents: 0,
    backgroundCommands: 0,
    planMode: 0,
    ...overrides,
  };
}

export interface HarnessProps {
  thread: PluginSidebarThread;
  projects?: PluginSidebarProject[];
  providers?: PluginProvidersState["providers"];
  isCompactViewport?: boolean;
  crossProjectId?: string | null;
  isActive?: boolean;
  options?: ThreadRowOptions;
  onRowEvent?: () => void;
  onCustomizeRowActions?: (threadId: string) => void;
  onFinishCustomizingRowActions?: (restoreFocus: boolean) => void;
  siblings?: PluginSidebarThread[];
}

export function ThreadRowHarness({
  thread,
  siblings = [],
  projects = [],
  providers = [],
  isCompactViewport,
  crossProjectId = null,
  isActive = false,
  options = DEFAULT_OPTIONS,
  onRowEvent,
  onCustomizeRowActions,
  onFinishCustomizingRowActions,
}: HarnessProps) {
  const row = (
    <ThreadRow
      thread={thread}
      crossProjectId={crossProjectId}
      isActive={isActive}
      options={options}
    />
  );
  const content = (
    <SidebarProjectsContext.Provider value={projects}>
      <SidebarProvidersContext.Provider value={providers}>
        <TooltipProvider>
          <SidebarDraftPresenceSync />
          <ThreadRowNavigationProvider>
            <ThreadSelectionProvider activeThreadId={null}>
              <SidebarRenameProvider>
                <CustomizeRowActionsContext.Provider
                  value={onCustomizeRowActions ?? null}
                >
                  <ThreadRowActionsCustomizingContext.Provider
                    value={
                      onFinishCustomizingRowActions
                        ? {
                            threadId: thread.id,
                            onDone: onFinishCustomizingRowActions,
                          }
                        : null
                    }
                  >
                    <div
                      onPointerDown={onRowEvent}
                      onKeyDown={onRowEvent}
                      onClick={onRowEvent}
                    >
                      {row}
                      {siblings.map((sibling) => (
                        <ThreadRow
                          key={sibling.id}
                          thread={sibling}
                          crossProjectId={crossProjectId}
                          isActive={false}
                          options={options}
                        />
                      ))}
                    </div>
                  </ThreadRowActionsCustomizingContext.Provider>
                </CustomizeRowActionsContext.Provider>
              </SidebarRenameProvider>
            </ThreadSelectionProvider>
          </ThreadRowNavigationProvider>
        </TooltipProvider>
      </SidebarProvidersContext.Provider>
    </SidebarProjectsContext.Provider>
  );
  return isCompactViewport === undefined ? (
    content
  ) : (
    <CompactViewportOverrideProvider isCompactViewport={isCompactViewport}>
      {content}
    </CompactViewportOverrideProvider>
  );
}

export interface RenderThreadRowArgs extends Omit<HarnessProps, "thread"> {
  thread?: PluginSidebarThread;
  hasComposerDraft?: boolean;
  hiddenDraftThreadIds?: string[];
  shortcutKey?: string;
  pluginStatus?: PluginSidebarThreadRowStatus;
  splitLayout?: PluginSidebarSplitLayout;
  projects?: PluginSidebarProject[];
  providers?: PluginProvidersState["providers"];
  showProviderIcons?: boolean;
  sdk?: PluginSdkTestFakes;
  threadActions?: TestThreadActionsResolver;
  threadBulkActions?: TestThreadBulkActionsResolver;
  experiments?: string[];
}

export function makeProvider(
  id: string,
  displayName: string,
  reasoningLevels?: PluginProvidersState["providers"][number]["reasoningLevels"],
): PluginProvidersState["providers"][number] {
  return {
    id,
    pluginId: `provider-${id}`,
    displayName,
    logoUrl: `/api/v1/system/providers/${id}/logo`,
    available: true,
    maintenance: { health: false, usage: false, installation: false },
    composerActions: [],
    completedTurnDisplay: "collapse",
    ...(reasoningLevels === undefined ? {} : { reasoningLevels }),
    capabilities: {
      supportsThreadArchive: true,
      supportsThreadRename: true,
      supportsServiceTier: false,
      supportsNativeUserQuestion: false,
      supportsFork: true,
      supportsSessionRewind: false,
      supportsManualCompaction: true,
      modelCatalogScope: "workspace",
      permissionModes: ["accept-edits", "auto", "full"],
    },
  };
}

export function renderThreadRow({
  thread = createThread(),
  hasComposerDraft = false,
  hiddenDraftThreadIds = [],
  shortcutKey,
  pluginStatus,
  splitLayout,
  projects = [],
  providers = [],
  showProviderIcons = false,
  sdk,
  threadActions = hostThreadActions(),
  threadBulkActions,
  experiments,
  ...harness
}: RenderThreadRowArgs = {}): RenderedSlot & {
  rerenderThreadRow(nextThread: PluginSidebarThread): void;
} {
  getDefaultStore().set(sidebarShowProviderIconsAtom, showProviderIcons);
  const slot = renderSlot(
    { component: ThreadRowHarness },
    { thread, projects, providers, ...harness },
    {
      sidebarThreads: {
        threads: [thread, ...(harness.siblings ?? [])],
        projects,
      },
      providers: { providers },
      sidebarDraftThreadIds: [
        ...(hasComposerDraft ? [thread.id] : []),
        ...hiddenDraftThreadIds,
      ],
      sidebarRowStatuses: pluginStatus ? { [thread.id]: pluginStatus } : {},
      sidebarShortcuts: shortcutKey
        ? {
            [thread.id]: {
              label: `⌘${shortcutKey}`,
              ariaKeyshortcuts: `Meta+${shortcutKey}`,
            },
          }
        : {},
      sidebarSplitLayout: splitLayout,
      sdk,
      threadActions,
      threadBulkActions,
      experiments,
    },
  );
  return Object.assign(slot, {
    rerenderThreadRow(nextThread: PluginSidebarThread) {
      slot.lifecycle.rerender(
        <ThreadRowHarness
          thread={nextThread}
          projects={projects}
          providers={providers}
          {...harness}
        />,
      );
    },
  });
}

export function twoPaneLayout(threadId: string): PluginSidebarSplitLayout {
  return {
    panes: [
      {
        paneId: "pane-thread",
        rect: { x: 0, y: 0, width: 0.5, height: 1 },
        threadId,
        isFocused: true,
      },
      {
        paneId: "pane-compose",
        rect: { x: 0.5, y: 0, width: 0.5, height: 1 },
        threadId: null,
        isFocused: false,
      },
    ],
  };
}

export function renderSplitThreadRow(args: RenderThreadRowArgs = {}) {
  const thread = args.thread ?? createThread();
  return renderThreadRow({
    ...args,
    thread,
    splitLayout: twoPaneLayout(thread.id),
  });
}

export function renderedIndicators(): Array<string | null> {
  return Array.from(
    document.querySelectorAll("[data-thread-status-glyph]"),
    (glyph) => glyph.getAttribute("data-thread-status-glyph"),
  );
}

export function statusGlyph(): HTMLElement {
  const glyph = document.querySelector<HTMLElement>(
    "[data-thread-status-glyph]",
  );
  if (!glyph) {
    throw new Error("Expected a thread status glyph");
  }
  return glyph;
}

export function openActionsMenu() {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Thread actions" }),
    {
      button: 0,
    },
  );
}

export function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export interface RanThreadAction {
  key: string;
  threadId: string;
}

export function hostThreadActions({
  ran = [],
  archiveRun,
}: {
  ran?: RanThreadAction[];
  archiveRun?: () => Promise<void>;
} = {}): TestThreadActionsResolver {
  return (thread, { requestRename }) => {
    const entry = (
      key: string,
      label: string,
      icon: string,
      run: () => Promise<void> = async () => {
        ran.push({ key, threadId: thread.id });
      },
    ): PluginThreadActionEntry => ({
      key,
      pluginId: key.split("/")[0] ?? "bb--core",
      group: "2_organize",
      action: {
        label,
        icon,
        run: () => run().catch(() => undefined),
      },
    });
    const isArchived = thread.archivedAt !== null;
    return [
      entry("bb--core/copyLink", "Copy link", "Copy"),
      entry(
        "bb--core/pin",
        thread.pinnedAt === null ? "Pin" : "Unpin",
        thread.pinnedAt === null ? "Pin" : "PinOff",
      ),
      ...(thread.parentThreadId === null && !isArchived
        ? [entry("thread-list/move", "Move to section", "SectionMove")]
        : []),
      entry("bb--core/rename", "Rename", "Edit", async () => {
        requestRename(thread.id);
      }),
      entry(
        "bb--core/archive",
        isArchived ? "Unarchive" : "Archive",
        isArchived ? "ArchiveRestore" : "Archive",
        archiveRun,
      ),
    ];
  };
}

export async function expectRenamePresentation(outcome: RenamePresentationOutcome) {
  if (outcome === "none") {
    expect(screen.queryByRole("textbox", { name: "Thread name" })).toBeNull();
    return;
  }
  const input = await screen.findByRole("textbox", { name: "Thread name" });
  expect(input).toHaveProperty("value", "Thread");
  expect(input.closest('[role="dialog"]') === null ? "inline" : "dialog").toBe(
    outcome,
  );
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Thread name" })).toBeNull(),
  );
}

