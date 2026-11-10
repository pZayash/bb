// bb-fork(parent-mute): fork-owned coverage for the parentNotificationsMutedAt
// switch on child->parent notifications.
import { describe, expect, it } from "vitest";
import { isParentNotifiableChildThread } from "../../src/services/threads/thread-parent.js";

describe("isParentNotifiableChildThread", () => {
  it("is false for a delegated child whose parent notifications are muted", () => {
    expect(
      isParentNotifiableChildThread(
        {
          originKind: null,
          parentNotifications: "auto",
          parentNotificationsMutedAt: 1_700_000_000_000,
          parentThreadId: "thr_parent",
        },
        "failed",
      ),
    ).toBe(false);
    expect(
      isParentNotifiableChildThread(
        {
          originKind: null,
          parentNotifications: "auto",
          parentNotificationsMutedAt: null,
          parentThreadId: "thr_parent",
        },
        "failed",
      ),
    ).toBe(true);
  });
});
