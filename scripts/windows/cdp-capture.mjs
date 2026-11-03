// bb-fork(windows): headless Edge CDP console capture for debugging frontend plugin crashes.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_URL = process.argv[2] ?? "http://localhost:17442";
const WAIT_MS = Number(process.argv[3] ?? 45000);
const EDGE_CANDIDATES = [
  process.env.BB_EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

const edgePath = EDGE_CANDIDATES.find((candidate) => existsSync(candidate));
if (edgePath === undefined) {
  console.error(
    `No Edge found. Set BB_EDGE_PATH to msedge.exe. Looked in:\n  ${EDGE_CANDIDATES.join("\n  ")}`,
  );
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "bb-cdp-"));
const edge = spawn(edgePath, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-extensions",
  "about:blank",
]);

function readDevToolsPort() {
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 80; i++) {
    if (edge.exitCode !== null) {
      throw new Error(`Edge exited (${edge.exitCode}) before DevTools was ready`);
    }
    try {
      const [port] = readFileSync(portFile, "utf8").split("\n");
      if (port) return Number(port);
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("DevTools did not start within 20s");
}

async function stopEdge() {
  if (edge.exitCode === null) {
    edge.kill();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      edge.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    }
  }
}

let exiting = false;
process.on("exit", () => {
  if (!exiting && edge.exitCode === null) edge.kill();
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    exiting = true;
    stopEdge().finally(() => process.exit(130));
  });
}

const debugPort = readDevToolsPort();

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
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

const wsClosed = new Promise((_, reject) => {
  ws.onclose = () => reject(new Error("CDP WebSocket closed"));
  ws.onerror = () => reject(new Error("CDP WebSocket error"));
});
wsClosed.catch((error) => {
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
});

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id !== undefined && pending.has(msg.id)) {
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) {
      entry.reject(new Error(`${msg.error.message} (${msg.error.code})`));
    } else {
      entry.resolve(msg.result);
    }
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

const wsOpened = new Promise((resolve, reject) => {
  ws.onopen = resolve;
  wsClosed.catch(reject);
});
await wsOpened;
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
exiting = true;
await stopEdge();
process.exit(0);
