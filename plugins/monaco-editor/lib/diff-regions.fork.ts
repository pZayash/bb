// bb-fork(file-diff): changed-line regions parsed from a file's unified patch,
// bb-fork(file-diff): for gutter indicators and next/previous-change navigation.
export type DiffRegionKind = "added" | "modified" | "deleted";

export interface DiffRegion {
  endLine: number;
  kind: DiffRegionKind;
  startLine: number;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

interface Run {
  firstPlus: number;
  hadMinus: boolean;
  lastPlus: number;
}

export function diffRegionsFromPatch(patch: string): DiffRegion[] {
  const regions: DiffRegion[] = [];
  let inHunk = false;
  let newLine = 0;
  let run: Run | null = null;
  const flushRun = () => {
    if (run === null) return;
    if (run.firstPlus !== 0) {
      regions.push({
        endLine: run.lastPlus,
        kind: run.hadMinus ? "modified" : "added",
        startLine: run.firstPlus,
      });
    } else if (run.hadMinus) {
      const line = Math.max(1, newLine - 1);
      regions.push({ endLine: line, kind: "deleted", startLine: line });
    }
    run = null;
  };
  for (const line of patch.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      flushRun();
      inHunk = true;
      newLine = Number(header[1]);
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("\\")) continue;
    const tag = line.charAt(0);
    if (tag === "+") {
      run ??= { firstPlus: 0, hadMinus: false, lastPlus: 0 };
      if (run.firstPlus === 0) run.firstPlus = newLine;
      run.lastPlus = newLine;
      newLine += 1;
    } else if (tag === "-") {
      run ??= { firstPlus: 0, hadMinus: false, lastPlus: 0 };
      run.hadMinus = true;
    } else if (tag === " ") {
      flushRun();
      newLine += 1;
    } else {
      flushRun();
      inHunk = false;
    }
  }
  flushRun();
  return regions;
}

// bb-fork(file-diff): editor prev/next-change stepping, wrapping at the ends.
export function diffRegionIndexAtLine(
  regions: readonly DiffRegion[],
  line: number,
): number {
  let index = -1;
  for (const [i, region] of regions.entries()) {
    if (region.startLine <= line) index = i;
  }
  return index;
}

export function nextDiffRegionIndex(
  regions: readonly DiffRegion[],
  line: number,
  direction: "next" | "previous",
): number {
  if (regions.length === 0) return -1;
  if (direction === "next") {
    const index = regions.findIndex((region) => region.startLine > line);
    return index === -1 ? 0 : index;
  }
  for (let i = regions.length - 1; i >= 0; i -= 1) {
    if (regions[i]!.startLine < line) return i;
  }
  return regions.length - 1;
}
