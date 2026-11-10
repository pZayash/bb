// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePreview } from "./FilePreview";
import { SecondaryPanelFilePreview } from "./ThreadStorageFilePreview";

// bb-fork(document-export): coverage for the fork-owned export menu and the
// inline HTML fallback kept out of the upstream FilePreview.test.tsx.
describe("FilePreview export menu", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubBrowserDownload(): {
    downloads: string[];
    restore: () => void;
  } {
    const downloads: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = () => "blob:file-export";
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    };
    return {
      downloads,
      restore: () => {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
        HTMLAnchorElement.prototype.click = originalClick;
      },
    };
  }

  it("posts an HTML preview to the document export route", async () => {
    const download = stubBrowserDownload();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["docx"]),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <FilePreview
          path="docs/chart.html"
          state={{
            kind: "html",
            file: { name: "chart.html", contents: "<p>chart</p>" },
            iframe: {
              sandbox: "allow-scripts",
              title: "docs/chart.html",
              url: "/api/v1/threads/thr_1/worktree/files/docs/chart.html",
            },
            lineRange: null,
          }}
        />,
      );

      fireEvent.pointerDown(
        screen.getByRole("button", { name: "Export file" }),
        { button: 0 },
      );
      fireEvent.click(
        await screen.findByRole("menuitem", { name: "Word (.docx)" }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("/api/v1/files/export");
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({
        content: "<p>chart</p>",
        sourceKind: "html",
        format: "docx",
        filename: "chart.html",
      });
      expect(body.baseHref).toContain(
        "/api/v1/threads/thr_1/worktree/files/docs/chart.html",
      );
      await waitFor(() => {
        expect(download.downloads).toEqual(["chart.docx"]);
      });
    } finally {
      download.restore();
      vi.unstubAllGlobals();
    }
  });

  it("downloads Markdown source without calling the export route", async () => {
    const download = stubBrowserDownload();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <FilePreview
          exportBaseHref="http://localhost/api/v1/threads/thr_1/worktree/files/reports/notes.md"
          path="reports/notes.md"
          state={{
            kind: "ready",
            file: { name: "notes.md", contents: "# Notes" },
            lineRange: null,
            textPreviewKind: "markdown",
          }}
        />,
      );

      fireEvent.pointerDown(
        screen.getByRole("button", { name: "Export file" }),
        { button: 0 },
      );
      fireEvent.click(
        await screen.findByRole("menuitem", { name: "Save Markdown" }),
      );

      await waitFor(() => {
        expect(download.downloads).toEqual(["notes.md"]);
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      download.restore();
      vi.unstubAllGlobals();
    }
  });

  it("offers no export for code previews", () => {
    render(
      <FilePreview
        path="src/main.ts"
        state={{
          kind: "ready",
          file: { name: "main.ts", contents: "const value = 1;" },
          lineRange: null,
          textPreviewKind: null,
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Export file" })).toBeNull();
  });
});

// bb-fork(html-preview): inline srcdoc fallback when no preview URL exists.
describe("SecondaryPanelFilePreview HTML fallback", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders HTML from its contents when no preview url is available", () => {
    render(
      <SecondaryPanelFilePreview
        activePath="docs/demo.HTM"
        filePreview={{
          content: "<h1>Inline</h1>",
          kind: "text",
          mimeType: "text/html",
          name: "demo.HTM",
          path: "docs/demo.HTM",
          url: "/api/v1/environments/env_1/diff/file?path=docs/demo.HTM",
        }}
        htmlPreviewUrl={null}
        isLoading={false}
      />,
    );

    const iframe = screen.getByTitle("docs/demo.HTM") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc")).toBe("<h1>Inline</h1>");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
  });
});
