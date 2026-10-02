// bb-fork(file-diff): rebuild a diff so both sides carry the whole file.
import { parseDiffFromFile, type FileContents } from "@pierre/diffs";
import type { ParsedGitDiffFile } from "@/components/git-diff/git-diff-parsing";
import { truncateSourceCode } from "./source-code-budget";

const FULL_FILE_CONTEXT_LINES = 1_000_000;

interface BuildFullFileDiffArgs {
  fileDiff: ParsedGitDiffFile;
  oldFile: FileContents;
  newFile: FileContents;
}

function fitsRenderBudget(contents: string): boolean {
  return truncateSourceCode(contents) === null;
}

// bb-fork(file-diff): a checkout with CRLF and a git blob with LF are the same lines.
function normalizeLineEndings(contents: string): string {
  return contents.replace(/\r\n?/gu, "\n");
}

export function buildFullFileDiff({
  fileDiff,
  oldFile,
  newFile,
}: BuildFullFileDiffArgs): ParsedGitDiffFile {
  const oldContents = normalizeLineEndings(oldFile.contents);
  const newContents = normalizeLineEndings(newFile.contents);
  if (oldContents === newContents) return fileDiff;
  if (!fitsRenderBudget(oldContents) || !fitsRenderBudget(newContents)) {
    return fileDiff;
  }
  try {
    return parseDiffFromFile(
      { name: oldFile.name, contents: oldContents },
      { name: newFile.name, contents: newContents },
      { context: FULL_FILE_CONTEXT_LINES },
    );
  } catch {
    return fileDiff;
  }
}
