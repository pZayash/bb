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

export function buildFullFileDiff({
  fileDiff,
  oldFile,
  newFile,
}: BuildFullFileDiffArgs): ParsedGitDiffFile {
  if (oldFile.contents === newFile.contents) return fileDiff;
  if (
    !fitsRenderBudget(oldFile.contents) ||
    !fitsRenderBudget(newFile.contents)
  ) {
    return fileDiff;
  }
  try {
    return parseDiffFromFile(oldFile, newFile, {
      context: FULL_FILE_CONTEXT_LINES,
    });
  } catch {
    return fileDiff;
  }
}
