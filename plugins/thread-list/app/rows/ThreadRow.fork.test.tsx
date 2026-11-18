// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createThread,
  makeProvider,
  renderedIndicators,
  renderThreadRow,
  resetSidebarTitleDoubleClickForTest,
} from "./thread-row-test-harness.js";
import { resetPreferencesSyncForTest } from "../preferences/preferences-sync.js";

const pointerState = vi.hoisted(() => ({ coarse: false }));
vi.mock("@/components/ui/hooks/use-pointer-coarse", () => ({
  usePointerCoarse: () => pointerState.coarse,
}));

afterEach(() => {
  cleanup();
  pointerState.coarse = false;
  vi.restoreAllMocks();
  resetSidebarTitleDoubleClickForTest();
  resetPreferencesSyncForTest();
});

describe("ThreadRow (fork)", () => {
  it("shows the provider mark and the thread's model under the title", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "openai-codex/gpt-5.6-sol",
      }),
      providers: [
        makeProvider("codex", "Codex"),
        makeProvider("claude-code", "Claude Code"),
      ],
      showProviderIcons: true,
    });

    const mark = container.querySelector("[data-sidebar-thread-provider]");
    expect(mark).not.toBeNull();
    expect(
      mark
        ?.querySelector("[data-provider-id]")
        ?.getAttribute("data-provider-id"),
    ).toBe("codex");
    expect(
      container.querySelector("[data-sidebar-thread-model]")?.textContent,
    ).toBe("gpt-5.6-sol");
  });

  it("decodes a packed devin-family model id down to its model uid", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "devin-family:%5B%22swe-2%22%2C262000%2C%22%22%5D",
      }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
    });

    expect(
      container.querySelector("[data-sidebar-thread-model]")?.textContent,
    ).toBe("swe-2");
  });

  it("shows a malformed devin-family model id as-is", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "devin-family:not-encoded-json",
      }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
    });

    expect(
      container.querySelector("[data-sidebar-thread-model]")?.textContent,
    ).toBe("devin-family:not-encoded-json");
  });

  it("shows the provider mark alone when the thread has no model yet", () => {
    const { container } = renderThreadRow({
      thread: createThread({ providerId: "codex", model: null }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
    });

    const mark = container.querySelector("[data-sidebar-thread-provider]");
    expect(mark?.querySelector('[aria-label="Codex"]')).not.toBeNull();
    expect(
      container.querySelector("[data-sidebar-thread-model]"),
    ).toBeNull();
  });

  it("treats a missing model as absent instead of crashing the row", () => {
    const { container } = renderThreadRow({
      thread: createThread({ providerId: "codex", model: undefined }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
    });

    const mark = container.querySelector("[data-sidebar-thread-provider]");
    expect(mark?.querySelector('[aria-label="Codex"]')).not.toBeNull();
    expect(
      container.querySelector("[data-sidebar-thread-model]"),
    ).toBeNull();
  });

  it("shows only the model when the thread's provider is unknown", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "openai-codex/gpt-5.6-sol",
      }),
      providers: [makeProvider("claude-code", "Claude Code")],
      showProviderIcons: true,
    });

    expect(
      container.querySelector("[data-sidebar-thread-provider]"),
    ).toBeNull();
    expect(
      container.querySelector("[data-sidebar-thread-model]")?.textContent,
    ).toBe("gpt-5.6-sol");
  });

  it("shows the provider's declared reasoning label beside the model", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "openai-codex/gpt-5.6-sol",
        reasoningLevel: "xhigh",
      }),
      providers: [
        makeProvider("codex", "Codex", [
          { id: "high", label: "High" },
          { id: "xhigh", label: "Extra High" },
        ]),
      ],
      showProviderIcons: true,
    });

    expect(
      container.querySelector("[data-sidebar-thread-model]")?.textContent,
    ).toBe("gpt-5.6-sol");
    const reasoning = container.querySelector(
      "[data-sidebar-thread-reasoning]",
    );
    expect(reasoning?.textContent).toBe("Extra High");
    expect(reasoning?.getAttribute("data-sidebar-thread-reasoning")).toBe(
      "xhigh",
    );
  });

  it("falls back to a built-in reasoning label the provider does not declare", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "gpt-5.6-sol",
        reasoningLevel: "ultra",
      }),
      providers: [makeProvider("codex", "Codex", [])],
      showProviderIcons: true,
    });

    expect(
      container.querySelector("[data-sidebar-thread-reasoning]")?.textContent,
    ).toBe("Ultra");
  });

  it("omits the reasoning label when the thread has no resolved level", () => {
    const { container } = renderThreadRow({
      thread: createThread({ providerId: "codex", model: "gpt-5.6-sol" }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
    });

    expect(
      container.querySelector("[data-sidebar-thread-model]")?.textContent,
    ).toBe("gpt-5.6-sol");
    expect(
      container.querySelector("[data-sidebar-thread-reasoning]"),
    ).toBeNull();
  });

  it("shows the reasoning label for a thread with no model yet", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: null,
        reasoningLevel: "high",
      }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
    });

    expect(container.querySelector("[data-sidebar-thread-model]")).toBeNull();
    expect(
      container.querySelector("[data-sidebar-thread-reasoning]")?.textContent,
    ).toBe("High");
  });

  it("omits the mark when the thread has neither a known provider nor a model", () => {
    const { container } = renderThreadRow({
      thread: createThread({ providerId: "codex", model: null }),
      providers: [makeProvider("claude-code", "Claude Code")],
      showProviderIcons: true,
    });

    expect(
      container.querySelector("[data-sidebar-thread-provider]"),
    ).toBeNull();
    expect(
      container.querySelector("[data-sidebar-thread-model]"),
    ).toBeNull();
  });

  it("opens the thread when the provider mark is clicked", () => {
    const { container } = renderThreadRow({
      thread: createThread({ providerId: "codex" }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
    });
    const link = screen.getByRole("link", { name: "Open Thread" });
    const onLinkClick = vi.fn();
    link.addEventListener("click", onLinkClick);

    fireEvent.click(container.querySelector("[data-sidebar-thread-provider]")!);

    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it("uses the circle-question glyph when the thread needs user input", () => {
    renderThreadRow({
      thread: createThread({ hasPendingInteraction: true }),
    });

    expect(renderedIndicators()).toEqual(["waiting-for-input"]);
  });

  it("gives a parent thread's model line the full row width", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "openai-codex/gpt-5.6-sol",
        title: "Parent thread",
        displayTitle: "Parent thread",
      }),
      providers: [makeProvider("codex", "Codex")],
      showProviderIcons: true,
      options: {
        kind: "parent",
        depth: 1,
        isCompact: false,
        isCollapsed: false,
        childCount: 1,
        hiddenThreads: [],
        onToggleCollapsed: vi.fn(),
      },
    });

    const line = container.querySelector("[data-sidebar-thread-model]")
      ?.parentElement;
    expect(line?.classList.contains("w-full")).toBe(true);
    expect(line?.classList.contains("pb-1.5")).toBe(true);
    expect(line?.classList.contains("pl-5")).toBe(true);
    // bb-fork(windows): the model line wraps to its own row inside the title cell.
    expect(line?.parentElement?.className).toContain("flex-wrap");
    expect(line?.parentElement?.className).toContain("flex-1");
  });

  // bb-fork(windows): regression for the merge that nested the w-full model
  // line inside a no-wrap flex — the model squeezed the title to zero width
  // and rows rendered only the model text.
  it("keeps the model line on a wrapped row so the title stays visible", () => {
    const { container } = renderThreadRow({
      thread: createThread({
        providerId: "codex",
        model: "openai-codex/gpt-5.6-sol",
        title: "Visible title",
        displayTitle: "Visible title",
      }),
      providers: [makeProvider("codex", "Codex")],
    });

    const title = container.querySelector(".bb-thread-title");
    expect(title?.textContent).toContain("Visible title");
    const line = container.querySelector("[data-sidebar-thread-model]")
      ?.parentElement;
    expect(line?.classList.contains("w-full")).toBe(true);
    expect(line?.parentElement?.className).toContain("flex-wrap");
  });

});
