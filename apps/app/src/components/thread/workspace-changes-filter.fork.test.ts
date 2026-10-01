import { describe, expect, it } from "vitest";
import type { WorkspaceChangedFile } from "@/components/thread/WorkspaceChangesList";
import { filterWorkspaceChangedFiles } from "@/components/thread/workspace-changes-filter.fork";

function makeFile(path: string): WorkspaceChangedFile {
  return { path, status: "M", insertions: 1, deletions: 0 };
}

const FILES: WorkspaceChangedFile[] = [
  makeFile("apps/app/src/Panel.tsx"),
  makeFile("apps/app/src/Panel.test.tsx"),
  makeFile("apps/server/src/routes/diff.ts"),
  makeFile("README.md"),
  makeFile("docs/api.mdx"),
  makeFile("docs/new-name.md"),
];

function paths(query: string): string[] {
  return filterWorkspaceChangedFiles(FILES, query).map((file) => file.path);
}

describe("filterWorkspaceChangedFiles", () => {
  it("returns the same files for a blank query", () => {
    expect(filterWorkspaceChangedFiles(FILES, "")).toBe(FILES);
    expect(filterWorkspaceChangedFiles(FILES, "  ")).toBe(FILES);
    expect(filterWorkspaceChangedFiles([], "*.ts")).toEqual([]);
  });

  it("matches plain text as a case-insensitive path substring", () => {
    expect(paths("PANEL")).toEqual([
      "apps/app/src/Panel.tsx",
      "apps/app/src/Panel.test.tsx",
    ]);
    expect(paths("routes/diff")).toEqual(["apps/server/src/routes/diff.ts"]);
  });

  it("matches a slashless glob against the file name at any depth", () => {
    expect(paths("*.md")).toEqual(["README.md", "docs/new-name.md"]);
    expect(paths("*.TSX")).toEqual([
      "apps/app/src/Panel.tsx",
      "apps/app/src/Panel.test.tsx",
    ]);
  });

  it("matches a glob containing a slash against the full path", () => {
    expect(paths("apps/*/src/**")).toEqual([
      "apps/app/src/Panel.tsx",
      "apps/app/src/Panel.test.tsx",
      "apps/server/src/routes/diff.ts",
    ]);
    expect(paths("docs/")).toEqual(["docs/api.mdx", "docs/new-name.md"]);
  });

  it("unions comma-separated patterns and removes negated ones", () => {
    expect(paths("*.md, routes")).toEqual([
      "apps/server/src/routes/diff.ts",
      "README.md",
      "docs/new-name.md",
    ]);
    expect(paths("*.tsx, !*.test.tsx")).toEqual(["apps/app/src/Panel.tsx"]);
    expect(paths("!apps/**, !docs/**")).toEqual(["README.md"]);
  });

  it("keeps the caller's file objects and order", () => {
    const filtered = filterWorkspaceChangedFiles(FILES, "*.md");
    expect(filtered[0]).toBe(FILES[3]);
    expect(filtered[1]).toBe(FILES[5]);
  });

  it("returns no files when the query matches nothing", () => {
    expect(filterWorkspaceChangedFiles(FILES, "*.py")).toEqual([]);
  });
});
