// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConversationMessageContent } from "./ConversationMessageContent";
import { ThreadTitleMentionResourcesProvider } from "@/components/thread/ThreadTitleMentions";
import { RouteNavigationProvider } from "@/components/ui/app-route-anchor";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { formatMessageClockTime } from "./MessageTimestamp";

function renderAgentMessage(text: string, createdAt?: number) {
  const { wrapper } = createQueryClientTestHarness();

  return render(
    <MemoryRouter>
      <RouteNavigationProvider>
        <ThreadTitleMentionResourcesProvider
          sectionNamesById={new Map()}
          projectNamesById={new Map()}
          threadById={new Map()}
        >
          <ConversationMessageContent
            role="user"
            initiator="agent"
            senderThreadId="thr_agent"
            senderThreadTitle="Worker"
            senderIsPluginSideChat={false}
            onTitleAction={undefined}
            systemMessageKind="unlabeled"
            systemMessageSubject={null}
            attachments={null}
            createdAt={createdAt}
            mentions={[]}
            text={text}
            timestamp={0}
            turnRequest={{
              isGrouped: false,
              kind: "message",
              status: "accepted",
            }}
            projectId="proj_demo"
          />
        </ThreadTitleMentionResourcesProvider>
      </RouteNavigationProvider>
    </MemoryRouter>,
    { wrapper },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// bb-fork(message-timestamps): the collapsed agent row reveals its creation
// clock time once expanded.
describe("GeneratedConversationMessage (fork)", () => {
  it("shows the message timestamp when the row carries a creation time", () => {
    const createdAt = new Date(2026, 2, 5, 14, 32, 10).getTime();
    const { container } = renderAgentMessage(
      "# notes\nedited path:src/app.ts here",
      createdAt,
    );

    fireEvent.click(screen.getByRole("button", { name: /Message from/u }));

    expect(
      container.querySelector("[data-message-timestamp]")?.textContent,
    ).toBe(formatMessageClockTime(createdAt));
  });
});
