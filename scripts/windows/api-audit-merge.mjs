import { readFileSync, writeFileSync } from "node:fs";

const [, , upstreamPath, oursPath, outputPath] = process.argv;
if (!upstreamPath || !oursPath || !outputPath) {
  throw new Error(
    "usage: node api-audit-merge.mjs <upstream-api_to_audit.md> <ours-api_to_audit.md> <output-api_to_audit.md>",
  );
}

const BEGIN = "<!-- bb-fork:begin -->";
const END = "<!-- bb-fork:end -->";

function countMarker(text, marker) {
  let count = 0;
  let index = text.indexOf(marker);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(marker, index + marker.length);
  }
  return count;
}

function extractForkBlock(text, label) {
  const begins = countMarker(text, BEGIN);
  const ends = countMarker(text, END);
  if (begins !== 1 || ends !== 1) {
    throw new Error(
      `${label} must contain exactly one ${BEGIN} ... ${END} pair (found ${begins} begin, ${ends} end)`,
    );
  }
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END, begin + BEGIN.length);
  if (end === -1) {
    throw new Error(`${label} has ${END} before ${BEGIN}`);
  }
  if (begin !== 0 && text[begin - 1] !== "\n") {
    throw new Error(
      `${label} has ${BEGIN} mid-line; the marker must start a line`,
    );
  }
  const blockEnd = end + END.length;
  if (
    blockEnd !== text.length &&
    text[blockEnd] !== "\n" &&
    text[blockEnd] !== "\r"
  ) {
    throw new Error(`${label} has ${END} mid-line; the marker must end a line`);
  }
  const block = text.slice(begin, blockEnd);
  if (/^<{7}|^={7}|^>{7}/m.test(block)) {
    throw new Error(
      `${label} carries merge conflict markers inside the fork block; settle the file or delete it so the block can be restored from HEAD`,
    );
  }
  const inner = block.slice(BEGIN.length, block.length - END.length).trim();
  if (inner.length === 0) {
    throw new Error(
      `${label} fork block is empty; refusing to drop every fork audit entry`,
    );
  }
  return block;
}

const upstream = readFileSync(upstreamPath, "utf8");
const ours = readFileSync(oursPath, "utf8");

if (countMarker(upstream, BEGIN) !== 0 || countMarker(upstream, END) !== 0) {
  throw new Error(
    `${upstreamPath} already contains fork block markers; the merge source must be clean upstream text`,
  );
}

const block = extractForkBlock(ours, oursPath);
const base = upstream.endsWith("\n") ? upstream.slice(0, -1) : upstream;
const output = `${base}\n\n${block}\n`;

if (countMarker(output, BEGIN) !== 1 || countMarker(output, END) !== 1) {
  throw new Error("merged output does not contain exactly one fork block");
}
writeFileSync(outputPath, output);
