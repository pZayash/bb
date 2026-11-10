// @vitest-environment jsdom

import { LazyMarkdownHtml } from "./lazy-markdown-html";
import {
  LOCAL_FILE_TEST_HOST_ID,
  createMarkdownLocalFileHostTestWrapper,
} from "@/test/fixtures/markdown-local-file-host";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./markdown-preview";
import { type MarkdownLinkRouting } from "./markdown-link-routing";

const workspaceLinkRouting = {
  localFile: {
    absoluteLinks: {
      kind: "trusted-host",
    },
    hostId: null,
    relativeLinks: {
      baseDir: "/workspace",
      rootPath: "/workspace",
    },
    onOpenLink: vi.fn(() => true),
  },
} satisfies MarkdownLinkRouting;

const inlineCodeLinkRouting = {
  localFile: {
    ...workspaceLinkRouting.localFile,
    hostId: LOCAL_FILE_TEST_HOST_ID,
  },
} satisfies MarkdownLinkRouting;

beforeAll(() => LazyMarkdownHtml.preload());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// bb-fork(file-links): fallbackRelativeRoots resolve relative refs that live
// outside the workspace root.
describe("MarkdownPreview (fork)", () => {
  it("links inline-code references that resolve under a fallback root", async () => {
    const { pathsExist, wrapper } = createMarkdownLocalFileHostTestWrapper(
      (path) => path === "/checkout/.tmp/report.md",
    );
    render(
      <MarkdownPreview
        content="See `.tmp/report.md`."
        linkRouting={{
          localFile: {
            ...inlineCodeLinkRouting.localFile,
            fallbackRelativeRoots: ["/checkout"],
          },
        }}
      />,
      { wrapper },
    );

    const link = await screen.findByRole("link", { name: ".tmp/report.md" });
    expect(link.getAttribute("href")).toBe("file:///checkout/.tmp/report.md");
    fireEvent.click(link);
    expect(
      workspaceLinkRouting.localFile.onOpenLink,
    ).toHaveBeenCalledExactlyOnceWith({
      path: "/checkout/.tmp/report.md",
      lineRange: null,
      openTargetId: null,
    });
    expect(pathsExist).toHaveBeenCalledOnce();
    expect([...pathsExist.mock.calls[0]![0].paths].sort()).toEqual([
      "/checkout/.tmp/report.md",
      "/workspace/.tmp/report.md",
    ]);
  });

  it("prefers the workspace path over fallback roots when both exist", async () => {
    const { wrapper } = createMarkdownLocalFileHostTestWrapper(() => true);
    render(
      <MarkdownPreview
        content="See `.tmp/report.md`."
        linkRouting={{
          localFile: {
            ...inlineCodeLinkRouting.localFile,
            fallbackRelativeRoots: ["/checkout"],
          },
        }}
      />,
      { wrapper },
    );

    const link = await screen.findByRole("link", { name: ".tmp/report.md" });
    expect(link.getAttribute("href")).toBe("file:///workspace/.tmp/report.md");
    fireEvent.click(link);
    expect(
      workspaceLinkRouting.localFile.onOpenLink,
    ).toHaveBeenCalledExactlyOnceWith({
      path: "/workspace/.tmp/report.md",
      lineRange: null,
      openTargetId: null,
    });
  });
});
