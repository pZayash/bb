import { describe, expect, it } from "vitest";
import {
  EMPTY_FIXED_PANEL_TABS_STATE,
  areFixedPanelTabsEquivalent,
  createEmptyFixedPanelTabsState,
  createWorkspaceFilePreviewFixedPanelTab,
  parseFixedPanelTabsState,
  serializeFixedPanelTabsState,
} from "./fixed-panel-tabs-state";

const NOW = 1_700_000_000_000;

// bb-fork(diff-intent): a diff request id is transient — it distinguishes live
// tabs but must never persist into stored tab state.
describe("workspace file preview fixed panel tabs (fork)", () => {
  it("keeps a diff intent out of the stored tab and compares it by request", () => {
    const withIntent = createWorkspaceFilePreviewFixedPanelTab({
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
    const repeatRequest = createWorkspaceFilePreviewFixedPanelTab({
      environmentId: "env_app",
      projectId: null,
      tab: {
        diffIntent: { requestId: "req_2", view: "split" },
        lineRange: null,
        path: "src/index.ts",
        source: { kind: "working-tree" },
        statusLabel: null,
      },
    });
    const sameRequest = createWorkspaceFilePreviewFixedPanelTab({
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

    expect(areFixedPanelTabsEquivalent(withIntent, repeatRequest)).toBe(false);
    expect(areFixedPanelTabsEquivalent(withIntent, sameRequest)).toBe(true);

    const state = createEmptyFixedPanelTabsState({
      secondary: {
        activeTabId: withIntent.id,
        isOpen: true,
        tabs: [withIntent],
      },
      lastUsedAt: NOW,
    });
    const parsed = parseFixedPanelTabsState({
      initialValue: EMPTY_FIXED_PANEL_TABS_STATE,
      now: NOW,
      storedValue: serializeFixedPanelTabsState({ state }),
    });

    const storedTab = parsed.secondary.tabs[0];
    expect(
      storedTab?.kind === "workspace-file-preview"
        ? storedTab.diffIntent
        : null,
    ).toBeNull();
  });
});
