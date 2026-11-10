// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultResolvedCodeTheme } from "@bb/domain";
import { applyResolvedCodeTheme } from "@/lib/code-theme";
import { parseGitDiffFiles } from "@bb/shared-ui/git-diff/parsing";
import BbDiff from "./BbDiff";

const pierre = vi.hoisted(() => ({
  lastFileDiff: null as object | null,
}));

vi.mock("@pierre/diffs/react", async () => {
  const React = await import("react");
  return {
    FileDiff: ({ fileDiff }: { fileDiff: object }) => {
      pierre.lastFileDiff = fileDiff;
      return React.createElement("div", { "data-testid": "pierre-file-diff" });
    },
  };
});

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

const FULL_FILE_CONTENTS = {
  old: {
    path: "src/app.ts",
    content: [
      "const a = 1;",
      "const b = 2;",
      "const c = 4;",
      "const oldTail = true;",
      "",
    ].join("\n"),
  },
  new: {
    path: "src/app.ts",
    content: [
      "const a = 1;",
      "const b = 3;",
      "const c = 4;",
      "const newTail = true;",
      "",
    ].join("\n"),
  },
};

function fixture() {
  const file = parseGitDiffFiles(PATCH)[0];
  if (file === undefined) throw new Error("fixture patch did not parse");
  return file;
}

beforeEach(() => {
  pierre.lastFileDiff = null;
  applyResolvedCodeTheme(defaultResolvedCodeTheme);
});

afterEach(() => {
  cleanup();
  applyResolvedCodeTheme(defaultResolvedCodeTheme);
  vi.restoreAllMocks();
});

// bb-fork(full-file-diff): expandUnchanged rebuilds a complete file diff.
describe("BbDiff (fork)", () => {
  it("rebuilds the whole file when the caller asks for both complete sides", async () => {
    render(
      <BbDiff
        file={fixture()}
        patchText={PATCH}
        view="split"
        overflow="scroll"
        showLineNumbers
        expandUnchanged
        fullFileContents={FULL_FILE_CONTENTS}
      />,
    );
    await screen.findByTestId("pierre-file-diff");

    const fullFileLineCount =
      FULL_FILE_CONTENTS.new.content.split("\n").length - 1;
    const fileDiff = pierre.lastFileDiff as {
      hunks: { additionCount: number; additionStart: number }[];
      isPartial: boolean;
    };
    expect(fileDiff.isPartial).toBe(false);
    expect(fileDiff.hunks).toHaveLength(1);
    expect(fileDiff.hunks[0]).toMatchObject({
      additionCount: fullFileLineCount,
      additionStart: 1,
    });
  });
});
