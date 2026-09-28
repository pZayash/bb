// bb-fork(md-preview): source/preview switching for Markdown files.
import { describe, expect, it } from "vitest";
import {
  buildMarkdownPreviewDocument,
  isMarkdownPreviewPath,
} from "./markdown-preview.fork.js";

describe("isMarkdownPreviewPath", () => {
  it.each(["notes/readme.md", "README.MARKDOWN", "a/b/c.mdx", "doc.md"])(
    "accepts %s",
    (path) => {
      expect(isMarkdownPreviewPath(path)).toBe(true);
    },
  );

  it.each([
    "src/app.ts",
    "archive.md.bak",
    "notes/readme",
    ".md",
    "docs/",
    "a/b.markdown.zip",
  ])("rejects %s", (path) => {
    expect(isMarkdownPreviewPath(path)).toBe(false);
  });
});

describe("buildMarkdownPreviewDocument", () => {
  const source = {
    kind: "workspace" as const,
    environmentId: "env_1",
    projectId: null,
    threadId: "thr_1",
  };

  it("routes workspace files relative to the workspace root", () => {
    expect(
      buildMarkdownPreviewDocument({
        relativePath: ".tmp/notes.md",
        rootPath: "/work/checkout",
        source,
      }),
    ).toEqual({
      rootPath: "/work/checkout",
      target: {
        environmentId: "env_1",
        kind: "workspace",
        path: ".tmp/notes.md",
      },
      threadId: "thr_1",
    });
  });

  it("routes thread-storage files relative to the storage root", () => {
    expect(
      buildMarkdownPreviewDocument({
        relativePath: "notes.md",
        rootPath: "/storage/thr_1",
        source: {
          kind: "thread-storage",
          environmentId: null,
          projectId: null,
          threadId: "thr_1",
        },
      }),
    ).toEqual({
      rootPath: "/storage/thr_1",
      target: {
        kind: "thread-storage",
        path: "notes.md",
        threadId: "thr_1",
      },
      threadId: "thr_1",
    });
  });

  it("falls back to message routing when routing data is missing", () => {
    expect(
      buildMarkdownPreviewDocument({
        relativePath: "notes.md",
        rootPath: null,
        source,
      }),
    ).toBeUndefined();
    expect(
      buildMarkdownPreviewDocument({
        relativePath: "notes.md",
        rootPath: "/work/checkout",
        source: { ...source, threadId: null },
      }),
    ).toBeUndefined();
    expect(
      buildMarkdownPreviewDocument({
        relativePath: "notes.md",
        rootPath: "/work/checkout",
        source: { ...source, environmentId: null },
      }),
    ).toBeUndefined();
    expect(
      buildMarkdownPreviewDocument({
        relativePath: "notes.md",
        rootPath: "/work/checkout",
        source: {
          kind: "host",
          environmentId: "env_1",
          projectId: null,
          threadId: "thr_1",
        },
      }),
    ).toBeUndefined();
  });
});
