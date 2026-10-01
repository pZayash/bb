import { openSecondaryPanelTabInState } from "@bb/client-core";
import type { ThreadTab } from "@bb/server-contract";
import { describe, expect, it, vi } from "vitest";
import { setCachedThreadTabs } from "@/hooks/cache-owners/thread-tabs-cache-owner";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { sdk } from "./sdk";
import {
  createEmptyFixedPanelTabsState,
  createTerminalFixedPanelTab,
  createThreadInfoFixedPanelTab,
  createWorkspaceFilePreviewFixedPanelTab,
} from "./fixed-panel-tabs-state";
import { createPluginPageFixedPanelTab } from "./fixed-panel-tabs-state";
import {
  areThreadTabListsEquivalent,
  mergeThreadTabChanges,
  reconcileFixedPanelTabsState,
  scheduleThreadTabsPersistence,
} from "./thread-tabs-sync";

vi.mock("./sdk", () => ({
  BbHttpError: class BbHttpError extends Error {
    code: string | undefined;
    status: number | undefined;
  },
  sdk: {
    threads: {
      tabs: {
        get: vi.fn(async () => ({ revision: 0, tabs: [] })),
        update: vi.fn(async () => ({ revision: 1, tabs: [] })),
      },
    },
  },
}));

vi.mock("@/components/ui/app-toast", () => ({ appToast: { error: vi.fn() } }));

function browserTab(
  id: string,
  title: string,
): Extract<ThreadTab, { kind: "browser" }> {
  return {
    environmentId: null,
    id: `browser:${id}:none`,
    kind: "browser",
    title,
    url: `https://${id}.example.com`,
  };
}

describe("thread tab synchronization", () => {
  it("preserves remote additions and edits when removing a local tab", () => {
    const source = browserTab("source", "Source");
    const updatedSource = { ...source, title: "Updated elsewhere" };
    const detour = browserTab("detour", "Detour");
    const remote = browserTab("remote", "Remote");
    expect(
      mergeThreadTabChanges(
        [updatedSource, detour, remote],
        [source, detour],
        [source],
      ),
    ).toEqual([updatedSource, remote]);
  });

  it("inserts a replacement without restoring other remotely closed tabs", () => {
    const source = browserTab("source", "Source");
    const placeholder = browserTab("placeholder", "Placeholder");
    const neighbor = browserTab("neighbor", "Neighbor");
    const terminal = createTerminalFixedPanelTab({ terminalId: "replacement" });
    expect(
      mergeThreadTabChanges(
        [placeholder, neighbor],
        [source, placeholder, neighbor],
        [source, terminal, neighbor],
      ),
    ).toEqual([terminal, neighbor]);
  });

  it("keeps remote ordering unless the local operation reorders tabs", () => {
    const a = browserTab("a", "A");
    const b = browserTab("b", "B");
    const c = browserTab("c", "C");
    const remote = browserTab("remote", "Remote");
    expect(mergeThreadTabChanges([c, a, b], [a, b, c], [a, c])).toEqual([c, a]);
    expect(
      mergeThreadTabChanges([a, remote, b, c], [a, b, c], [c, a, b]),
    ).toEqual([c, remote, a, b]);
  });

  it("preserves local presentation state while adopting remote tabs", () => {
    const first = browserTab("first", "First");
    const second = browserTab("second", "Second");
    const current = createEmptyFixedPanelTabsState({
      lastUsedAt: 123,
      secondary: {
        activeTabId: first.id,
        isOpen: true,
        tabs: [first],
      },
    });

    const withBoth = reconcileFixedPanelTabsState(current, [first, second]);
    expect(withBoth).toMatchObject({
      lastUsedAt: 123,
      secondary: { activeTabId: first.id, isOpen: true },
    });
    expect(withBoth.secondary.tabs).toEqual([first, second]);

    const withoutActive = reconcileFixedPanelTabsState(withBoth, [second]);
    expect(withoutActive).toMatchObject({
      lastUsedAt: 123,
      secondary: { activeTabId: second.id, isOpen: true },
    });
  });

  it("drops legacy native side-chat tabs persisted before their removal", () => {
    const browser = browserTab("first", "First");
    const legacySideChat: ThreadTab = {
      id: "side-chat:legacy",
      kind: "side-chat",
      sourceMessageText: "anchor",
      sourceSeqEnd: null,
      threadId: "thr_legacy",
      title: "Side chat",
    };
    const current = createEmptyFixedPanelTabsState({
      lastUsedAt: 123,
      secondary: { activeTabId: null, isOpen: true, tabs: [] },
    });

    const reconciled = reconcileFixedPanelTabsState(current, [
      browser,
      legacySideChat,
    ]);

    expect(reconciled.secondary.tabs).toEqual([browser]);
  });

  it("keeps plugin page fixed tabs out of thread synchronization", () => {
    const pageTab = createPluginPageFixedPanelTab({
      fixedTabId: "navigation",
      pageId: "tasks",
      pluginId: "tasks",
    });

    expect(areThreadTabListsEquivalent([pageTab], [])).toBe(true);
  });

  // bb-fork(file-diff-open): the diff intent stays local, so synced tabs match it.
  it("treats a local diff intent as equivalent to the synced tab", () => {
    const workspaceTab = createWorkspaceFilePreviewFixedPanelTab({
      environmentId: "env_app",
      projectId: null,
      tab: {
        diffIntent: { requestId: "req_1", view: "split" },
        lineRange: null,
        path: "src/index.ts",
        source: { kind: "working-tree" },
        statusLabel: null,
      },
    });
    const synced: ThreadTab = {
      environmentId: "env_app",
      id: workspaceTab.id,
      kind: "workspace-file-preview",
      lineRange: null,
      path: "src/index.ts",
      projectId: null,
      source: { kind: "working-tree" },
      statusLabel: null,
    };
    const current = createEmptyFixedPanelTabsState({
      lastUsedAt: 123,
      secondary: {
        activeTabId: workspaceTab.id,
        isOpen: true,
        tabs: [workspaceTab],
      },
    });

    expect(areThreadTabListsEquivalent([workspaceTab], [synced])).toBe(true);
    expect(reconcileFixedPanelTabsState(current, [synced])).toBe(current);
    const reconciledTab = reconcileFixedPanelTabsState(current, [synced])
      .secondary.tabs[0];
    expect(
      reconciledTab?.kind === "workspace-file-preview"
        ? reconciledTab.diffIntent
        : null,
    ).toEqual({ requestId: "req_1", view: "split" });
  });

  it("treats a plugin-opened diff intent as equivalent to the synced tab", () => {
    const owner = {
      environmentId: "env_app",
      kind: "workspace-file-preview" as const,
      projectId: null,
      tab: {
        diffIntent: { requestId: "req_2", view: "unified" as const },
        lineRange: null,
        path: "src/index.ts",
        source: { kind: "working-tree" as const },
        statusLabel: null,
      },
      threadId: "thr_app",
    };
    const openedTab = {
      actionId: "file-opener:monaco",
      fileOpenerOwner: owner,
      id: "plugin-panel:monaco:none",
      kind: "plugin-panel" as const,
      paramsJson: null,
      pluginId: "monaco",
      title: "index.ts",
    };
    const synced: ThreadTab = {
      ...openedTab,
      fileOpenerOwner: {
        ...owner,
        tab: { ...owner.tab, diffIntent: null },
      },
    };

    expect(areThreadTabListsEquivalent([openedTab], [synced])).toBe(true);
  });

  it("never sends a diff intent to the server", async () => {
    const { queryClient } = createQueryClientTestHarness();
    setCachedThreadTabs(queryClient, "thr_app", { revision: 3, tabs: [] });
    const update = vi.mocked(sdk.threads.tabs.update);
    const openedTab = pluginOpenedDiffTab();

    scheduleThreadTabsPersistence({
      previousTabs: [],
      queryClient,
      tabs: [openedTab],
      threadId: "thr_app",
    });

    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    const payload = update.mock.calls[0]?.[0];
    expect(payload?.tabs).toHaveLength(1);
    expect(JSON.stringify(payload?.tabs)).not.toContain("diffIntent");
  });
});

function pluginOpenedDiffTab() {
  const owner = {
    environmentId: "env_app",
    kind: "workspace-file-preview" as const,
    projectId: null,
    tab: {
      diffIntent: { requestId: "req_3", view: "split" as const },
      lineRange: null,
      path: "src/index.ts",
      source: { kind: "working-tree" as const },
      statusLabel: null,
    },
    threadId: "thr_app",
  };
  return {
    actionId: "file-opener:monaco",
    fileOpenerOwner: owner,
    id: "plugin-panel:monaco:none",
    kind: "plugin-panel" as const,
    paramsJson: null,
    pluginId: "monaco",
    title: "index.ts",
  };
}

it("returns to the prior terminal when another client removes the active terminal before its close callback", () => {
  const source = createTerminalFixedPanelTab({ terminalId: "source" });
  const detour = createTerminalFixedPanelTab({ terminalId: "detour" });
  const state = openSecondaryPanelTabInState({
    state: createEmptyFixedPanelTabsState({
      secondary: {
        tabs: [createThreadInfoFixedPanelTab(), source],
        activeTabId: source.id,
        isOpen: true,
      },
    }),
    tab: detour,
  });
  const reconciled = reconcileFixedPanelTabsState(state, [
    createThreadInfoFixedPanelTab(),
    source,
  ]);
  expect(reconciled.secondary.activeTabId).toBe(source.id);
});
