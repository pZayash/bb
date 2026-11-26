import type { ThreadListEntry } from "@bb/domain";
import { describe, expect, it } from "vitest";
import { toPluginSidebarThread } from "./plugin-sidebar-threads";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";

function makeThread(overrides: Partial<ThreadListEntry> = {}): ThreadListEntry {
  return makeThreadListEntry({
    id: "thr_1",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: "A thread",
    lastReadAt: 10,
    latestAttentionAt: 5,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  });
}

// bb-fork(sidebar): host-resolved model/reasoning and indicator precedence.
describe("toPluginSidebarThread (fork)", () => {
  it("passes the resolved model and reasoning level through to the sidebar", () => {
    const mapped = toPluginSidebarThread(
      makeThread({ model: "gpt-5.6-sol", reasoningLevel: "xhigh" }),
    );
    expect(mapped.model).toBe("gpt-5.6-sol");
    expect(mapped.reasoningLevel).toBe("xhigh");
  });

  it("resolves the indicator with the host's precedence", () => {
    expect(
      toPluginSidebarThread(
        makeThread({
          hasPendingInteraction: true,
          runtime: {
            displayStatus: "active",
            // bb-fork(windows): upstream added the provisioning failure marker.
            failure: null,
          },
        }),
      ).indicator,
    ).toBe("waiting-for-input");

    expect(
      toPluginSidebarThread(
        makeThread({
          runtime: {
            displayStatus: "active",
            // bb-fork(windows): upstream added the provisioning failure marker.
            failure: null,
          },
        }),
      ).indicator,
    ).toBe("runtime");

    expect(
      toPluginSidebarThread(
        makeThread({
          activity: {
            activeWorkflowCount: 1,
            activeBackgroundAgentCount: 0,
            activeBackgroundCommandCount: 0,
            activePlanModeCount: 0,
          },
        }),
      ).indicator,
    ).toBe("workflow");
  });
});
