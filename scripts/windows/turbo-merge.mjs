import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , upstreamPath, outputPath] = process.argv;
if (!upstreamPath || !outputPath) {
  throw new Error(
    "usage: node turbo-merge.mjs <upstream-turbo.json> <output-turbo.json>",
  );
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fork = JSON.parse(
  readFileSync(resolve(scriptDir, "turbo.fork.json"), "utf8"),
);

function skipString(text, index) {
  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (text[cursor] === '"') {
      return cursor;
    }
    cursor += 1;
  }
  throw new Error("unterminated string in turbo.json");
}

function skipTrivia(text, index) {
  let cursor = index;
  while (cursor < text.length) {
    if (text[cursor] === '"') {
      return cursor;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "/") {
      const newline = text.indexOf("\n", cursor);
      cursor = newline === -1 ? text.length : newline + 1;
      continue;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "*") {
      const end = text.indexOf("*/", cursor + 2);
      if (end === -1) {
        throw new Error("unterminated block comment in turbo.json");
      }
      cursor = end + 2;
      continue;
    }
    return cursor;
  }
  return cursor;
}

function findMatching(text, openIndex) {
  const open = text[openIndex];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let cursor = openIndex; cursor < text.length; cursor += 1) {
    const next = skipTrivia(text, cursor);
    if (next !== cursor) {
      cursor = next - 1;
      continue;
    }
    if (text[cursor] === '"') {
      cursor = skipString(text, cursor);
      continue;
    }
    if (text[cursor] === open) {
      depth += 1;
    } else if (text[cursor] === close) {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  throw new Error(`unclosed ${open} in turbo.json`);
}

function indentBlock(value, indent) {
  const lines = value.split("\n");
  return lines
    .map((line, index) => (index === 0 ? line : indent + line))
    .join("\n");
}

let text = readFileSync(upstreamPath, "utf8");

const tasksMarker = '"tasks"';
const tasksKey = text.indexOf(tasksMarker);
if (tasksKey === -1) {
  throw new Error("turbo.json has no tasks object");
}
const tasksOpen = text.indexOf("{", tasksKey);
const tasksClose = findMatching(text, tasksOpen);
let taskEntries = "";
for (const [taskId, definition] of Object.entries(fork.tasks ?? {})) {
  if (text.slice(tasksOpen, tasksClose + 1).includes(JSON.stringify(taskId))) {
    throw new Error(
      `turbo.json already defines fork task ${taskId}; reconcile scripts/windows/turbo.fork.json manually`,
    );
  }
  const body = indentBlock(JSON.stringify(definition, null, 2), "    ");
  taskEntries += `\n    ${JSON.stringify(taskId)}: ${body},`;
}
if (taskEntries) {
  text = text.slice(0, tasksOpen + 1) + taskEntries + text.slice(tasksOpen + 1);
}

for (const [taskId, additions] of Object.entries(fork.inputAdditions ?? {})) {
  const taskPattern = new RegExp(
    `${JSON.stringify(taskId).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*:\\s*\\{`,
  );
  const match = taskPattern.exec(text);
  if (!match) {
    throw new Error(
      `turbo.json has no task ${taskId} for fork input additions`,
    );
  }
  const taskOpen = text.indexOf("{", match.index);
  const taskClose = findMatching(text, taskOpen);
  const inputsMatch = /"inputs"\s*:\s*\[/u.exec(
    text.slice(taskOpen, taskClose + 1),
  );
  if (!inputsMatch) {
    throw new Error(`turbo.json task ${taskId} has no inputs array`);
  }
  const inputsOpen = taskOpen + inputsMatch.index + inputsMatch[0].length - 1;
  const inputsClose = findMatching(text, inputsOpen);
  const existing = text.slice(inputsOpen, inputsClose + 1);
  const missing = additions.filter(
    (path) => !existing.includes(JSON.stringify(path)),
  );
  if (missing.length === 0) {
    continue;
  }
  const closeLineStart = text.lastIndexOf("\n", inputsClose) + 1;
  const closingIndent = text.slice(closeLineStart, inputsClose);
  if (/[^\s]/u.test(closingIndent)) {
    throw new Error(`turbo.json task ${taskId} inputs close on a content line`);
  }
  let before = text.slice(0, closeLineStart);
  const lastNonSpace = before.search(/\S(?=\s*$)/u);
  if (lastNonSpace === -1) {
    throw new Error(`turbo.json task ${taskId} inputs array is empty`);
  }
  const trimmedEnd = before.trimEnd();
  if (!trimmedEnd.endsWith(",")) {
    before = `${trimmedEnd},${before.slice(trimmedEnd.length)}`;
  }
  const entryIndent = `${closingIndent}  `;
  const lines = missing
    .map(
      (path, index) =>
        `${entryIndent}${JSON.stringify(path)}${index === missing.length - 1 ? "" : ","}`,
    )
    .join("\n");
  text = `${before}${lines}\n${text.slice(closeLineStart)}`;
}

writeFileSync(outputPath, text);
