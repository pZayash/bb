import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(root);

function gitShow(revision, path) {
  return execFileSync("git", ["show", `${revision}:${path}`], {
    encoding: "utf8",
  });
}

function runNode(script, args) {
  execFileSync(process.execPath, [join(root, script), ...args], {
    stdio: "inherit",
  });
}

function normalize(text) {
  return text.replace(/\r\n/gu, "\n");
}

function assertEqual(label, expected, actual) {
  if (normalize(expected) === normalize(actual)) {
    console.log(`ok ${label}`);
    return;
  }
  const expectedLines = normalize(expected).split("\n");
  const actualLines = normalize(actual).split("\n");
  const firstDifference = expectedLines.findIndex(
    (line, index) => line !== actualLines[index],
  );
  throw new Error(
    `${label} drifted from the generator at line ${firstDifference + 1}:\n` +
      `  generated: ${JSON.stringify(expectedLines[firstDifference] ?? "<eof>")}\n` +
      `  worktree:  ${JSON.stringify(actualLines[firstDifference] ?? "<eof>")}\n` +
      "Edit the fork-owned input (scripts/windows/turbo.fork.json or the docs/api_to_audit.md fork block), then regenerate — do not hand-edit the generated file.",
  );
}

let base;
try {
  base = execFileSync("git", ["merge-base", "HEAD", "upstream/main"], {
    encoding: "utf8",
  }).trim();
} catch {
  throw new Error(
    "cannot resolve upstream/main; add the fork's upstream remote before running check:generated",
  );
}
if (!base) {
  throw new Error("git merge-base HEAD upstream/main returned no commit");
}

const temporaryDir = mkdtempSync(join(tmpdir(), "bb-generated-check-"));
try {
  writeFileSync(
    join(temporaryDir, "base-turbo.json"),
    gitShow(base, "turbo.json"),
  );
  runNode("scripts/windows/turbo-merge.mjs", [
    join(temporaryDir, "base-turbo.json"),
    join(temporaryDir, "generated-turbo.json"),
  ]);
  assertEqual(
    "turbo.json",
    readFileSync(join(temporaryDir, "generated-turbo.json"), "utf8"),
    readFileSync("turbo.json", "utf8"),
  );

  writeFileSync(
    join(temporaryDir, "base-api-to-audit.md"),
    gitShow(base, "docs/api_to_audit.md"),
  );
  runNode("scripts/windows/api-audit-merge.mjs", [
    join(temporaryDir, "base-api-to-audit.md"),
    "docs/api_to_audit.md",
    join(temporaryDir, "generated-api-to-audit.md"),
  ]);
  assertEqual(
    "docs/api_to_audit.md",
    readFileSync(join(temporaryDir, "generated-api-to-audit.md"), "utf8"),
    readFileSync("docs/api_to_audit.md", "utf8"),
  );

  console.log(`generated files match their fork inputs (merge base ${base})`);
} finally {
  rmSync(temporaryDir, { recursive: true, force: true });
}
