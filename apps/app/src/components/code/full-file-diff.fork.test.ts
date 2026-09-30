// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseDiffFromFile } from "@pierre/diffs";
import { parseGitDiffFiles } from "@/components/git-diff/git-diff-parsing";
import { SOURCE_CODE_MAX_LINES } from "./source-code-budget";
import { buildFullFileDiff } from "./full-file-diff.fork";

const PATCH = [
  "diff --git a/src/app.ts b/src/app.ts",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,3 +1,3 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  "",
].join("\n");

function fixture() {
  const file = parseGitDiffFiles(PATCH)[0];
  if (file === undefined) throw new Error("fixture patch did not parse");
  return file;
}

const OLD_CONTENTS = "const a = 1;\nconst b = 2;\nconst c = 4;\n";
const NEW_CONTENTS = "const a = 1;\nconst b = 3;\nconst c = 4;\n";

describe("buildFullFileDiff", () => {
  it("spans the whole file on both sides instead of the patch hunks", () => {
    const result = buildFullFileDiff({
      fileDiff: fixture(),
      oldFile: { name: "src/app.ts", contents: OLD_CONTENTS },
      newFile: { name: "src/app.ts", contents: NEW_CONTENTS },
    });

    expect(result.isPartial).toBe(false);
    expect(result.hunks).toHaveLength(1);
    expect(result.deletionLines).toEqual([
      "const a = 1;\n",
      "const b = 2;\n",
      "const c = 4;\n",
    ]);
    expect(result.additionLines).toEqual([
      "const a = 1;\n",
      "const b = 3;\n",
      "const c = 4;\n",
    ]);
  });

  it("keeps every unchanged line when the change sits far from the top", () => {
    const lines = Array.from({ length: 200 }, (_, index) => `line ${index}\n`);
    const changed = [...lines];
    changed[150] = "line 150 changed\n";
    const result = buildFullFileDiff({
      fileDiff: fixture(),
      oldFile: { name: "src/app.ts", contents: lines.join("") },
      newFile: { name: "src/app.ts", contents: changed.join("") },
    });

    expect(result.additionLines).toHaveLength(200);
    expect(result.deletionLines).toHaveLength(200);
  });

  it("returns the patch diff when the two sides are identical", () => {
    const fileDiff = fixture();
    expect(
      buildFullFileDiff({
        fileDiff,
        oldFile: { name: "src/app.ts", contents: OLD_CONTENTS },
        newFile: { name: "src/app.ts", contents: OLD_CONTENTS },
      }),
    ).toBe(fileDiff);
  });

  it("returns the patch diff when a side is too large to render whole", () => {
    const fileDiff = fixture();
    const huge = `${"line\n".repeat(SOURCE_CODE_MAX_LINES + 1)}`;
    expect(
      buildFullFileDiff({
        fileDiff,
        oldFile: { name: "src/app.ts", contents: huge },
        newFile: { name: "src/app.ts", contents: `${huge}tail\n` },
      }),
    ).toBe(fileDiff);
  });

  it("renders a full-file diff for a file the patch reports as new", () => {
    const added = parseDiffFromFile(
      { name: "src/new.ts", contents: "" },
      { name: "src/new.ts", contents: "const a = 1;\n" },
      { context: 1_000 },
    );
    const result = buildFullFileDiff({
      fileDiff: added,
      oldFile: { name: "src/new.ts", contents: "" },
      newFile: { name: "src/new.ts", contents: "const a = 1;\n" },
    });

    expect(result.additionLines).toEqual(["const a = 1;\n"]);
    expect(result.deletionLines).toEqual([]);
  });
});
