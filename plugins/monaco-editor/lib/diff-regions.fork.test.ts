import { describe, expect, it } from "vitest";
import { diffRegionsFromPatch } from "./diff-regions.fork.js";

function patch(body: string): string {
  return ["diff --git a/f b/f", "--- a/f", "+++ b/f", body].join("\n");
}

describe("diffRegionsFromPatch", () => {
  it("marks pure additions as added", () => {
    const regions = diffRegionsFromPatch(
      patch("@@ -1,2 +1,4 @@\n a\n+x\n+y\n b\n"),
    );
    expect(regions).toEqual([
      { endLine: 3, kind: "added", startLine: 2 },
    ]);
  });

  it("marks replaced lines as modified", () => {
    const regions = diffRegionsFromPatch(
      patch("@@ -1,3 +1,3 @@\n a\n-old\n+new\n b\n"),
    );
    expect(regions).toEqual([
      { endLine: 2, kind: "modified", startLine: 2 },
    ]);
  });

  it("marks a deletion on the line before the removed block", () => {
    const regions = diffRegionsFromPatch(
      patch("@@ -1,3 +1,2 @@\n a\n-gone\n b\n"),
    );
    expect(regions).toEqual([
      { endLine: 1, kind: "deleted", startLine: 1 },
    ]);
  });

  it("clamps a file-top deletion to the first line", () => {
    const regions = diffRegionsFromPatch(
      patch("@@ -1,2 +1,1 @@\n-gone\n b\n"),
    );
    expect(regions).toEqual([
      { endLine: 1, kind: "deleted", startLine: 1 },
    ]);
  });

  it("keeps plus and minus runs separated by context as two regions", () => {
    const regions = diffRegionsFromPatch(
      patch(
        "@@ -1,6 +1,6 @@\n a\n-old\n+new\n b\n c\n-d\n+e\n",
      ),
    );
    expect(regions).toEqual([
      { endLine: 2, kind: "modified", startLine: 2 },
      { endLine: 5, kind: "modified", startLine: 5 },
    ]);
  });

  it("reads several hunks", () => {
    const regions = diffRegionsFromPatch(
      patch(
        "@@ -1,2 +1,3 @@\n a\n+x\n b\n@@ -10,2 +11,3 @@\n c\n-old\n+new\n d\n",
      ),
    );
    expect(regions).toEqual([
      { endLine: 2, kind: "added", startLine: 2 },
      { endLine: 12, kind: "modified", startLine: 12 },
    ]);
  });

  it("ignores headers and no-newline markers", () => {
    const regions = diffRegionsFromPatch(
      patch("@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n"),
    );
    expect(regions).toEqual([
      { endLine: 1, kind: "modified", startLine: 1 },
    ]);
  });

  it("returns no regions for an empty patch", () => {
    expect(diffRegionsFromPatch("")).toEqual([]);
  });
});
