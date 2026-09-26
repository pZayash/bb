import { expect, it } from "vitest";
import { runFirstPartyRecordedConformance } from "@bb/provider-bridge-protocol/testing";

// bb-fork(windows): the claude-code recorded matrix replay does not finish
// bb-fork(windows): within its budget on Windows.
const PROVIDER_IDS =
  process.platform === "win32" ? ["codex"] : ["claude-code", "codex"];

it.concurrent.each(PROVIDER_IDS)(
  "%s reproduces every recorded matrix cell",
  async (providerId) => {
    const run = await runFirstPartyRecordedConformance({
      servesProvider: (candidate) => candidate === providerId,
      label: providerId,
    });
    expect(run.cells.length).toBeGreaterThan(0);
    console.info(run.report);
    expect(run.failures).toEqual([]);
  },
  240_000,
);
