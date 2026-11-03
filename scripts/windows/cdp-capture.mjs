// bb-fork(windows): headless Edge CDP console capture for debugging frontend plugin crashes.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEBUG_PORT = 9333;
const APP_URL = process.argv[2] ?? "http://localhost:17442";
const WAIT_MS = Number(process.argv[3] ?? 45000);
const EDGE =
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const profile = mkdtempSync(join(tmpdir(), "bb-cdp-"));
const edge = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-extensions",
  "about:blank",
]);

const cleanup = () => {
  try {
    edge.kill();
  } catch {}
};
process.on("exit", cleanup);

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no CDP page target");
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

function fmtArg(arg) {
  if (arg.value !== undefined) return String(arg.value);
  if (arg.description !== undefined) return arg.description;
  return `[${arg.type}]`;
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const { type, args } = msg.params;
    if (type === "warning" || type === "error") {
      console.log(
        `[console.${type}]`,
        args.map(fmtArg).join(" ").slice(0, 4000),
      );
    }
  } else if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    console.log(
      "[exception]",
      d.text,
      d.exception?.description ?? "",
      (d.stackTrace?.callFrames ?? [])
        .map((f) => `${f.functionName}@${f.url}:${f.lineNumber}`)
        .join(" | ")
        .slice(0, 2000),
    );
  } else if (msg.method === "Log.entryAdded") {
    const e = msg.params.entry;
    if (e.level === "error" || e.level === "warning") {
      console.log(`[log.${e.level}]`, e.source, e.text?.slice(0, 2000));
    }
  }
};

await new Promise((r) => (ws.onopen = r));
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
console.log(`navigating to ${APP_URL}`);
await send("Page.navigate", { url: APP_URL });
await new Promise((r) => setTimeout(r, WAIT_MS));

const { result } = await send("Runtime.evaluate", {
  expression: `document.title + " | " + location.href + " | crashed=" + (document.querySelector("[data-composer-box]")?.textContent?.slice(0,200) ?? "no-box")`,
  returnByValue: true,
});
console.log("[final]", result?.value);
cleanup();
process.exit(0);
