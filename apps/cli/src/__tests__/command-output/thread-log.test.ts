import { describe, expect, it, vi } from "vitest";
import {
  setupCommandOutputTestEnvironment,
  collectLogLines,
  runCommand,
  stubServerApi,
} from "../helpers/command-output-harness.js";
import type { CommandRegistrar } from "../helpers/command-output-harness.js";
import * as fixtures from "../helpers/command-output-fixtures.js";
import { registerThreadCommands } from "../../commands/thread/index.js";

describe("bb thread log command output", () => {
  setupCommandOutputTestEnvironment();

  const register: CommandRegistrar = (program) =>
    registerThreadCommands(program, () => "http://server");

  it("bb thread log renders pending steers for human output", async () => {
    const getEvents = vi.fn(async () => []);
    const getTimeline = vi.fn(async () =>
      fixtures.makeTimelineResponse([fixtures.makePendingSteerTimelineRow()]),
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(
      ["thread", "log", "thread-log", "--format", "verbose"],
      register,
    );

    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output).toContain("Please switch to the safer plan");
    expect(output).toContain("steer pending");
    expect(getTimeline).toHaveBeenCalledWith({
      param: { id: "thread-log" },
      query: { includeNestedRows: "true" },
    });
    expect(getEvents).not.toHaveBeenCalled();
  });

  it("bb thread log renders pending steers with default formatting", async () => {
    const getEvents = vi.fn(async () => []);
    const getTimeline = vi.fn(async () =>
      fixtures.makeTimelineResponse([fixtures.makePendingSteerTimelineRow()]),
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(["thread", "log", "thread-log"], register);

    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output).toContain("Please switch to the safer plan");
    expect(output).toContain("steer pending");
    expect(getTimeline).toHaveBeenCalledWith({
      param: { id: "thread-log" },
      query: { includeNestedRows: "true" },
    });
    expect(getEvents).not.toHaveBeenCalled();
  });

  it("bb thread log minimal shows collapsed tool entries inside a completed turn", async () => {
    vi.stubEnv("NO_COLOR", "1");
    const commandRow = (args: {
      id: string;
      command: string;
      output: string;
      sourceSeqStart: number;
    }) => ({
      ...fixtures.makeTimelineBase({
        id: args.id,
        sourceSeqStart: args.sourceSeqStart,
        startedAt: args.sourceSeqStart * 1_000,
        createdAt: args.sourceSeqStart * 1_000,
      }),
      turnId: "turn-1",
      kind: "work" as const,
      workKind: "command" as const,
      status: "completed" as const,
      callId: args.id,
      command: args.command,
      cwd: null,
      source: null,
      output: args.output,
      exitCode: 0,
      completedAt: args.sourceSeqStart * 1_000 + 500,
      approvalStatus: null,
      activityIntents: [],
    });
    const getTimeline = vi.fn(async () =>
      fixtures.makeTimelineResponse([
        {
          ...fixtures.makeTimelineBase({
            id: "thread-log:turn-1:turn",
            sourceSeqStart: 1,
            sourceSeqEnd: 4,
            startedAt: 1_000,
            createdAt: 1_000,
          }),
          kind: "turn",
          turnId: "turn-1",
          status: "completed",
          summaryCount: 1,
          completedAt: 4_000,
          children: [
            commandRow({
              id: "cmd-1",
              command: "pnpm test",
              output: "Tests passed\n",
              sourceSeqStart: 1,
            }),
            commandRow({
              id: "cmd-2",
              command: "pnpm lint",
              output: "Lint passed\n",
              sourceSeqStart: 2,
            }),
            {
              ...fixtures.makeTimelineBase({
                id: "assistant-1",
                sourceSeqStart: 3,
              }),
              turnId: "turn-1",
              kind: "conversation",
              messageSeq: 3,
              role: "assistant",
              text: "All checks passed.",
              attachments: null,
              turnRequest: null,
            },
          ],
        },
      ]),
    );
    stubServerApi({
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(["thread", "log", "thread-log"], register);

    expect(getTimeline).toHaveBeenCalledWith({
      param: { id: "thread-log" },
      query: { includeNestedRows: "true" },
    });
    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output).toContain("Worked for");
    expect(output).toContain("Ran 2 commands");
    expect(output).toContain("Ran pnpm test");
    expect(output).toContain("$ pnpm test");
    expect(output).toContain("$ pnpm lint");
    expect(output).toContain("All checks passed.");
    expect(output).not.toContain("Tests passed");
    expect(output).not.toContain("Lint passed");
  });

  it("bb thread log renders approval state on command and file-change rows", async () => {
    const getEvents = vi.fn(async () => []);
    const getTimeline = vi.fn(async () =>
      fixtures.makeTimelineResponse([
        {
          ...fixtures.makeTimelineBase({
            id: "command-approval",
            sourceSeqStart: 1,
          }),
          kind: "work",
          workKind: "command",
          status: "pending",
          callId: "cmd-1",
          command: "git push",
          cwd: null,
          source: null,
          output: "",
          exitCode: null,
          completedAt: null,
          approvalStatus: "waiting_for_approval",
          activityIntents: [],
        },
        {
          ...fixtures.makeTimelineBase({
            id: "file-approval",
            sourceSeqStart: 2,
          }),
          kind: "work",
          workKind: "file-change",
          status: "interrupted",
          callId: "file-1",
          change: {
            path: "src/example.ts",
            kind: null,
            movePath: null,
            diff: null,
            diffStats: { added: 0, removed: 0 },
          },
          stdout: null,
          stderr: null,
          approvalStatus: "denied",
        },
      ]),
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(
      ["thread", "log", "thread-log", "--format", "verbose"],
      register,
    );

    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output).toContain("Waiting for approval to run git push");
    expect(output).toContain("git push");
    expect(output).toContain("denied");
    expect(output).toContain("example.ts");
    expect(output).not.toContain("Command approval started");
    expect(output).not.toContain("File-change approval started");
    expect(getEvents).not.toHaveBeenCalled();
  });

  it("bb thread log --json caps at --limit and warns on stderr when more events exist", async () => {
    const events = Array.from({ length: 4 }, (_, index) => ({
      id: `evt-${index + 1}`,
      scope: { kind: "thread" },
      threadId: "thread-json-log",
      type: "system/error",
      data: { code: "provider_unavailable" },
      createdAt: 20 + index,
      seq: index + 1,
    }));
    const getEvents = vi.fn(async () => events);
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
    });

    await runCommand(
      ["thread", "log", "thread-json-log", "--json", "--limit", "3"],
      register,
    );

    expect(getEvents).toHaveBeenCalledWith({
      param: { id: "thread-json-log" },
      query: { limit: "4" },
    });
    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual(events.slice(0, 3));
    const stderr = collectLogLines(vi.mocked(console.error)).join("\n");
    expect(stderr).toContain("oldest 3 events");
    expect(stderr).toContain("--after-seq 3");
    expect(stderr).toContain("--all");
  });

  it("bb thread log --json detects more events across the server page boundary", async () => {
    const events = Array.from({ length: 101 }, (_, index) => ({
      id: `evt-${index + 1}`,
      scope: { kind: "thread" },
      threadId: "thread-json-log",
      type: "system/error",
      data: { code: "provider_unavailable" },
      createdAt: 20 + index,
      seq: index + 1,
    }));
    const getEvents = vi.fn(
      async (input: { query: { afterSeq?: string; limit?: string } }) => {
        const afterSeq = Number(input.query.afterSeq ?? 0);
        const limit = Math.min(Number(input.query.limit), 100);
        return events.filter((event) => event.seq > afterSeq).slice(0, limit);
      },
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
    });

    await runCommand(["thread", "log", "thread-json-log", "--json"], register);

    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual(events.slice(0, 100));
    expect(getEvents.mock.calls.map((call) => call[0].query)).toEqual([
      { limit: "100" },
      { afterSeq: "100", limit: "1" },
    ]);
    expect(collectLogLines(vi.mocked(console.error)).join("\n")).toContain(
      "--after-seq 100",
    );
  });

  it("bb thread log --json retries smaller raw-event pages after the byte limit", async () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      id: `evt-${index + 1}`,
      scope: { kind: "thread" },
      threadId: "thread-json-log",
      type: "system/error",
      data: { code: "provider_unavailable" },
      createdAt: 20 + index,
      seq: index + 1,
    }));
    const getEvents = vi.fn(
      async (input: { query: { afterSeq?: string; limit?: string } }) => {
        const limit = Number(input.query.limit);
        if (limit > 2) {
          return new Response(
            JSON.stringify({
              code: "event_data_too_large",
              message: "Event response exceeds the 8 MiB limit",
            }),
            { status: 413, headers: { "Content-Type": "application/json" } },
          );
        }
        const afterSeq = Number(input.query.afterSeq ?? 0);
        return events.filter((event) => event.seq > afterSeq).slice(0, limit);
      },
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
    });

    await runCommand(
      ["thread", "log", "thread-json-log", "--json", "--limit", "3"],
      register,
    );

    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual(events.slice(0, 3));
    expect(getEvents.mock.calls.map((call) => call[0].query)).toEqual([
      { limit: "4" },
      { limit: "2" },
      { afterSeq: "2", limit: "2" },
    ]);
  });

  it("bb thread log --json stays quiet when the page is not full", async () => {
    const events = [
      {
        id: "evt-1",
        scope: { kind: "thread" },
        threadId: "thread-json-log",
        type: "system/error",
        data: { code: "provider_unavailable" },
        createdAt: 20,
        seq: 1,
      },
    ];
    stubServerApi({
      "v1.threads.:id.events.$get": vi.fn(async () => events),
    });

    await runCommand(["thread", "log", "thread-json-log", "--json"], register);

    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual(events);
    expect(collectLogLines(vi.mocked(console.error))).toEqual([]);
  });

  it("bb thread log --json --all pages through every event with --after-seq", async () => {
    const makeEvent = (seq: number) => ({
      id: `evt-${seq}`,
      scope: { kind: "thread" },
      threadId: "thread-json-log",
      type: "system/error",
      data: { code: "provider_unavailable" },
      createdAt: 20 + seq,
      seq,
    });
    const getEvents = vi.fn(
      async (input: { query: { afterSeq?: string; limit?: string } }) => {
        const afterSeq = Number(input.query.afterSeq ?? 0);
        const limit = Number(input.query.limit);
        return Array.from({ length: 1203 }, (_, index) => makeEvent(index + 1))
          .filter((event) => event.seq > afterSeq)
          .slice(0, Math.min(limit, 100));
      },
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
    });

    await runCommand(
      ["thread", "log", "thread-json-log", "--json", "--all"],
      register,
    );

    const printed = JSON.parse(
      String(vi.mocked(console.log).mock.calls[0]?.[0]),
    ) as Array<{ seq: number }>;
    expect(printed).toHaveLength(1203);
    expect(printed[0]?.seq).toBe(1);
    expect(printed[1202]?.seq).toBe(1203);
    expect(getEvents.mock.calls.map((call) => call[0].query.afterSeq)).toEqual([
      undefined,
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "1000",
      "1100",
      "1200",
    ]);
    expect(getEvents.mock.calls.map((call) => call[0].query.limit)).toEqual(
      Array.from({ length: 13 }, () => "100"),
    );
    expect(collectLogLines(vi.mocked(console.error))).toEqual([]);
  });

  it("bb thread log --json --all keeps paging after reducing a byte-heavy page", async () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      id: `evt-${index + 1}`,
      scope: { kind: "thread" },
      threadId: "thread-json-log",
      type: "system/error",
      data: { code: "provider_unavailable" },
      createdAt: 20 + index,
      seq: index + 1,
    }));
    const getEvents = vi.fn(
      async (input: { query: { afterSeq?: string; limit?: string } }) => {
        const limit = Number(input.query.limit);
        if (limit > 2) {
          return new Response(
            JSON.stringify({
              code: "event_data_too_large",
              message: "Event response exceeds the 8 MiB limit",
            }),
            { status: 413, headers: { "Content-Type": "application/json" } },
          );
        }
        const afterSeq = Number(input.query.afterSeq ?? 0);
        return events.filter((event) => event.seq > afterSeq).slice(0, limit);
      },
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
    });

    await runCommand(
      ["thread", "log", "thread-json-log", "--json", "--all"],
      register,
    );

    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual(events);
    expect(getEvents.mock.calls.map((call) => call[0].query.limit)).toEqual([
      "100",
      "50",
      "25",
      "13",
      "7",
      "4",
      "2",
      "4",
      "2",
      "4",
      "2",
    ]);
    expect(getEvents.mock.calls.map((call) => call[0].query.afterSeq)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "2",
      "2",
      "4",
      "4",
    ]);
  });

  it("bb thread log --json --all restores large pages after a dense prefix", async () => {
    const events = Array.from({ length: 1202 }, (_, index) => ({
      id: `evt-${index + 1}`,
      scope: { kind: "thread" },
      threadId: "thread-json-log",
      type: "system/error",
      data: { code: "provider_unavailable" },
      createdAt: 20 + index,
      seq: index + 1,
    }));
    const getEvents = vi.fn(
      async (input: { query: { afterSeq?: string; limit?: string } }) => {
        const afterSeq = Number(input.query.afterSeq ?? 0);
        const limit = Number(input.query.limit);
        if (afterSeq < 2 && limit > 1) {
          return new Response(
            JSON.stringify({
              code: "event_data_too_large",
              message: "Event response exceeds the 8 MiB limit",
            }),
            { status: 413, headers: { "Content-Type": "application/json" } },
          );
        }
        return events.filter((event) => event.seq > afterSeq).slice(0, limit);
      },
    );
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
    });

    await runCommand(
      ["thread", "log", "thread-json-log", "--json", "--all"],
      register,
    );

    const printed = JSON.parse(
      String(vi.mocked(console.log).mock.calls[0]?.[0]),
    ) as Array<{ seq: number }>;
    expect(printed).toHaveLength(events.length);
    expect(printed[0]?.seq).toBe(1);
    expect(printed.at(-1)?.seq).toBe(events.length);
    const tailLimits = getEvents.mock.calls
      .filter((call) => Number(call[0].query.afterSeq ?? 0) >= 2)
      .map((call) => call[0].query.limit);
    expect(tailLimits.slice(0, 7)).toEqual([
      "2",
      "4",
      "8",
      "16",
      "32",
      "64",
      "100",
    ]);
    expect(getEvents.mock.calls.length).toBeLessThan(30);
  });

  it("bb thread log prints an older-history notice when the timeline page is cut", async () => {
    const getTimeline = vi.fn(async () => ({
      ...fixtures.makeTimelineResponse([
        fixtures.makePendingSteerTimelineRow(),
      ]),
      timelinePage: {
        returnedSegmentCount: 20,
        olderCursor: { anchorSeq: 12, anchorId: "pending-steer-1" },
        historySnapshot: "snapshot-1",
        olderRowsSourceSeqEnd: null,
      },
    }));
    stubServerApi({
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(["thread", "log", "thread-log"], register);

    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output).toContain("Please switch to the safer plan");
    expect(output).toContain("newest 20 user-message turns");
    expect(output).toContain("older history omitted");
    expect(output).toContain("--all");
  });

  it("bb thread log --limit sets the timeline segment limit for human output", async () => {
    const getTimeline = vi.fn(async () =>
      fixtures.makeTimelineResponse([fixtures.makePendingSteerTimelineRow()]),
    );
    stubServerApi({
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(
      ["thread", "log", "thread-log", "--format", "verbose", "--limit", "50"],
      register,
    );

    expect(getTimeline).toHaveBeenCalledWith({
      param: { id: "thread-log" },
      query: { includeNestedRows: "true", segmentLimit: "50" },
    });
    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output).toContain("Please switch to the safer plan");
    expect(output).not.toContain("older history omitted");
  });

  it("bb thread log --all walks older timeline pages and prints them oldest first", async () => {
    const makeUserRow = (id: string, seq: number, text: string) => ({
      ...fixtures.makePendingSteerTimelineRow(),
      ...fixtures.makeTimelineBase({ id, sourceSeqStart: seq }),
      text,
      turnRequest: {
        isGrouped: false,
        kind: "message" as const,
        status: "accepted" as const,
      },
    });
    const getTimeline = vi.fn(
      async (input: {
        query: { beforeAnchorSeq?: string; beforeAnchorId?: string };
      }) => {
        if (input.query.beforeAnchorSeq === undefined) {
          return {
            ...fixtures.makeTimelineResponse([
              makeUserRow("user-3", 30, "third prompt"),
            ]),
            timelinePage: {
              returnedSegmentCount: 1,
              olderCursor: { anchorSeq: 30, anchorId: "user-3" },
              historySnapshot: "snapshot-1",
              olderRowsSourceSeqEnd: null,
            },
          };
        }
        if (input.query.beforeAnchorSeq === "30") {
          return {
            ...fixtures.makeTimelineResponse([
              makeUserRow("user-2", 20, "second prompt"),
            ]),
            timelinePage: {
              returnedSegmentCount: 1,
              olderCursor: { anchorSeq: 20, anchorId: "user-2" },
              historySnapshot: "snapshot-1",
              olderRowsSourceSeqEnd: null,
            },
          };
        }
        return {
          ...fixtures.makeTimelineResponse([
            makeUserRow("user-1", 10, "first prompt"),
          ]),
          timelinePage: {
            returnedSegmentCount: 1,
            olderCursor: null,
            historySnapshot: "snapshot-1",
            olderRowsSourceSeqEnd: null,
          },
        };
      },
    );
    stubServerApi({
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(["thread", "log", "thread-log", "--all"], register);

    expect(getTimeline.mock.calls.map((call) => call[0].query)).toEqual([
      { includeNestedRows: "true", segmentLimit: "100" },
      {
        includeNestedRows: "true",
        segmentLimit: "100",
        beforeAnchorSeq: "30",
        beforeAnchorId: "user-3",
      },
      {
        includeNestedRows: "true",
        segmentLimit: "100",
        beforeAnchorSeq: "20",
        beforeAnchorId: "user-2",
      },
    ]);
    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output.indexOf("first prompt")).toBeGreaterThan(-1);
    expect(output.indexOf("first prompt")).toBeLessThan(
      output.indexOf("second prompt"),
    );
    expect(output.indexOf("second prompt")).toBeLessThan(
      output.indexOf("third prompt"),
    );
    expect(output).not.toContain("older history omitted");
  });

  it("bb thread log --message prints the message with its context", async () => {
    const getMessage = vi.fn(async () => ({
      message: fixtures.makePendingSteerTimelineRow(),
      before: [],
      after: [],
    }));
    const getTimeline = vi.fn(async () => fixtures.makeTimelineResponse([]));
    stubServerApi({
      "v1.threads.:id.messages.:seq.$get": getMessage,
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(
      ["thread", "log", "thread-log", "--message", "12", "--context", "2"],
      register,
    );

    expect(getMessage).toHaveBeenCalledWith({
      param: { id: "thread-log", seq: "12" },
      query: { before: "2", after: "2" },
    });
    expect(getTimeline).not.toHaveBeenCalled();
    const output = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(output).toContain("Message 12:");
    expect(output).toContain("Please switch to the safer plan");
  });

  it.each([
    [["--message", "12", "--all"], "--message cannot be combined"],
    [["--context", "2"], "--context requires --message"],
    [["--message", "12", "--context", "21"], "--context must be an integer"],
  ])("bb thread log rejects %j", async (flags, error) => {
    stubServerApi({
      "v1.threads.:id.messages.:seq.$get": vi.fn(),
      "v1.threads.:id.timeline.$get": vi.fn(async () =>
        fixtures.makeTimelineResponse([]),
      ),
    });

    await expect(
      runCommand(["thread", "log", "thread-log", ...flags], register),
    ).rejects.toThrow("process.exit:1");
    expect(collectLogLines(vi.mocked(console.error)).join("\n")).toContain(
      error,
    );
  });

  it("bb thread log rejects --all combined with --limit", async () => {
    stubServerApi({
      "v1.threads.:id.timeline.$get": vi.fn(async () =>
        fixtures.makeTimelineResponse([]),
      ),
    });

    await expect(
      runCommand(
        ["thread", "log", "thread-log", "--all", "--limit", "5"],
        register,
      ),
    ).rejects.toThrow("process.exit:1");
    expect(collectLogLines(vi.mocked(console.error)).join("\n")).toContain(
      "--all cannot be combined with --limit",
    );
  });

  it("bb thread log --self resolves from BB_THREAD_ID", async () => {
    vi.stubEnv("BB_THREAD_ID", "thread-log-self");
    const getEvents = vi.fn(async () => []);
    const getTimeline = vi.fn(async () => fixtures.makeTimelineResponse([]));
    stubServerApi({
      "v1.threads.:id.events.$get": getEvents,
      "v1.threads.:id.timeline.$get": getTimeline,
    });

    await runCommand(["thread", "log", "--self"], register);

    expect(getEvents).not.toHaveBeenCalled();
    expect(getTimeline).toHaveBeenCalledWith({
      param: { id: "thread-log-self" },
      query: { includeNestedRows: "true" },
    });
    expect(collectLogLines(vi.mocked(console.error))).toEqual([]);
  });
});
