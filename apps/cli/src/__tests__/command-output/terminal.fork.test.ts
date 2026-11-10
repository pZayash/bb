// bb-fork(windows): fork-owned coverage for `terminal --shell` and
// `terminal shells`, which select a host shell id reported by the machine.
import { describe, expect, it, vi } from "vitest";
import {
  collectLogLines,
  runCommand,
  setupCommandOutputTestEnvironment,
  stubServerApi,
  type CommandRegistrar,
} from "../helpers/command-output-harness.js";
import { registerTerminalCommands } from "../../commands/terminal.js";

function makeTerminalSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "term-1",
    threadId: "thr-1",
    environmentId: "env-1",
    hostId: "host-1",
    title: "Terminal 1",
    initialCwd: "/tmp/workspace",
    cols: 100,
    rows: 30,
    status: "running",
    exitCode: null,
    closeReason: null,
    createdAt: 1,
    updatedAt: 1,
    lastUserInputAt: null,
    ...overrides,
  };
}

function makeHost(overrides: Record<string, unknown> = {}) {
  return {
    id: "host-1",
    name: "laptop",
    status: "connected",
    lastSeenAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("bb terminal command output", () => {
  setupCommandOutputTestEnvironment();

  const register: CommandRegistrar = (program) =>
    registerTerminalCommands(program, () => "http://server");

  it("creates a terminal with the requested shell id", async () => {
    const hosts = vi.fn(async () => [makeHost()]);
    const create = vi.fn(async () => makeTerminalSession());
    stubServerApi({
      "v1.hosts.$get": hosts,
      "v1.terminals.$post": create,
    });

    await runCommand(
      ["terminal", "create", "--host", "host-1", "--shell", "git-bash"],
      register,
    );

    expect(create).toHaveBeenCalledWith({
      json: {
        cols: 200,
        rows: 50,
        title: undefined,
        start: { mode: "shell", shellId: "git-bash" },
        target: { kind: "host_path", hostId: "host-1", cwd: null },
      },
    });
  });

  it("rejects --shell combined with a command", async () => {
    const create = vi.fn(async () => makeTerminalSession());
    stubServerApi({ "v1.terminals.$post": create });

    await expect(
      runCommand(
        [
          "terminal",
          "create",
          "--thread",
          "thr-1",
          "--shell",
          "git-bash",
          "--command",
          "ls",
        ],
        register,
      ),
    ).rejects.toThrow("process.exit:1");

    expect(collectLogLines(vi.mocked(console.error)).join("\n")).toContain(
      "Provide either --shell or a command, not both.",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("lists a machine's shells", async () => {
    const hosts = vi.fn(async () => [makeHost()]);
    const shells = vi.fn(async () => ({
      shells: [
        {
          id: "pwsh",
          isDefault: true,
          label: "PowerShell 7",
          path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        },
        {
          id: "git-bash",
          isDefault: false,
          label: "Git Bash",
          path: "C:\\Program Files\\Git\\bin\\bash.exe",
        },
      ],
    }));
    stubServerApi({
      "v1.hosts.$get": hosts,
      "v1.hosts.:id.terminal-shells.$get": shells,
    });

    await runCommand(["terminal", "shells", "--machine", "laptop"], register);

    expect(shells).toHaveBeenCalledWith({ param: { id: "host-1" } });
    const lines = collectLogLines(vi.mocked(console.log)).join("\n");
    expect(lines).toContain("pwsh (default)");
    expect(lines).toContain("Git Bash");
  });

  it("rejects `terminal shells` without a machine", async () => {
    const shells = vi.fn(async () => ({ shells: [] }));
    stubServerApi({ "v1.hosts.:id.terminal-shells.$get": shells });

    await expect(runCommand(["terminal", "shells"], register)).rejects.toThrow(
      "process.exit:1",
    );
    expect(collectLogLines(vi.mocked(console.error)).join("\n")).toContain(
      "Provide --machine or --host",
    );
    expect(shells).not.toHaveBeenCalled();
  });
});
