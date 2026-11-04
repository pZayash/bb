import { describe, expect, it } from "vitest";
import type { ThreadDelta } from "@bb/provider-bridge-protocol";
import {
  forkFilterTitleEchoDeltas,
  forkSystemInstructionsBlock,
} from "./title-echo.fork.js";

const INSTRUCTIONS =
  "If the user asks you to move this thread to another checkout, worktree, or directory, make sure the target directory exists.";

function nameDelta(name: string): ThreadDelta {
  return { kind: "thread.name", name, source: "agent" };
}

describe("fork title echo filter", () => {
  it("passes deltas through before instructions were injected", () => {
    const deltas = [nameDelta("<system_instructions> If the user asks")];
    expect(forkFilterTitleEchoDeltas({}, deltas)).toEqual(deltas);
  });

  it("drops a truncated echo of the injected block", () => {
    const session = {};
    forkSystemInstructionsBlock(session, INSTRUCTIONS);
    const deltas = [
      nameDelta(
        "<system_instructions> If the user asks you to move this thread to another che...",
      ),
    ];
    expect(forkFilterTitleEchoDeltas(session, deltas)).toEqual([]);
  });

  it("drops an echo whose tags the agent stripped", () => {
    const session = {};
    forkSystemInstructionsBlock(session, INSTRUCTIONS);
    const deltas = [
      nameDelta("If the user asks you to move this thread to another…"),
    ];
    expect(forkFilterTitleEchoDeltas(session, deltas)).toEqual([]);
  });

  it("keeps the user text that follows a fully echoed block", () => {
    const session = {};
    const block = forkSystemInstructionsBlock(session, INSTRUCTIONS);
    const deltas = [nameDelta(`${block} Fix thread titles`)];
    expect(forkFilterTitleEchoDeltas(session, deltas)).toEqual([
      nameDelta("Fix thread titles"),
    ]);
  });

  it("keeps an honest agent title and other deltas", () => {
    const session = {};
    forkSystemInstructionsBlock(session, INSTRUCTIONS);
    const deltas: ThreadDelta[] = [
      nameDelta("Fix thread title generation"),
      { kind: "thread.started" },
    ];
    expect(forkFilterTitleEchoDeltas(session, deltas)).toEqual(deltas);
  });
});
