// bb-fork(pi-diff): the tool result patch replaces the args-derived edit diff.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  getBuiltinModels,
  getBuiltinProviders,
} from "@earendil-works/pi-ai/providers/all";
import {
  experimental_createDeltaAssembler as createDeltaAssembler,
  type DeltaAssembler,
  type ThreadEvent,
} from "@get-bb/plugin-sdk/provider-bridge/testing";
import {
  createPiDeltaTranslator,
  createPiModelContextWindowResolverFrom,
  type PiModelContextWindowResolver,
} from "./delta-translation.js";

const builtinCatalogResolver = createPiModelContextWindowResolverFrom(
  getBuiltinProviders().flatMap((provider) => getBuiltinModels(provider)),
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "./__fixtures__/pi");

const THREAD_ID = "bb-thread-1";
const ENTROPY = "pi-test";

function loadFixture(name: string): AgentSessionEvent {
  return JSON.parse(
    readFileSync(resolve(FIXTURES, name), "utf8"),
  ) as AgentSessionEvent;
}

interface PiTestContext {
  cwd?: string;
  threadId?: string;
  parentToolCallId?: string;
}

interface PiEquivalenceHarness {
  assembler: DeltaAssembler;
  translate(event: unknown, context?: PiTestContext): ThreadEvent[];
  openTurnId(): string;
}

function createHarness(options?: {
  resolveModelContextWindow?: PiModelContextWindowResolver;
}): PiEquivalenceHarness {
  const translator = createPiDeltaTranslator({
    resolveModelContextWindow:
      options?.resolveModelContextWindow ?? builtinCatalogResolver,
  });
  const assembler = createDeltaAssembler({
    providerId: "pi",
    entropyPrefix: ENTROPY,
    textDeltaFlushMs: 0,
  });
  return {
    assembler,
    translate(event, context) {
      return assembler.assemble({
        threadId: context?.threadId ?? THREAD_ID,
        deltas: translator.translate(event, context),
      });
    },
    openTurnId() {
      return assembler.getOpenTurnId(THREAD_ID) ?? "";
    },
  };
}

describe("pi delta translation equivalence", () => {
  it("tool_execution_end replaces the edit diff with the tool result patch", () => {
    const harness = createHarness();
    harness.translate(loadFixture("agent-start.json"));
    harness.translate({
      type: "tool_execution_start",
      toolCallId: "tool-edit-result-1",
      toolName: "edit",
      args: {
        path: "src/app.ts",
        edits: [{ oldText: "const a = 1;\n", newText: "const a = 2;\n" }],
      },
    } as AgentSessionEvent);

    const patch =
      "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n";
    const events = harness.translate({
      type: "tool_execution_end",
      toolCallId: "tool-edit-result-1",
      toolName: "edit",
      isError: false,
      result: {
        content: [{ type: "text", text: "Successfully replaced 1 block(s)" }],
        details: { patch, firstChangedLine: 1 },
      },
    } as AgentSessionEvent);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item/completed",
        item: expect.objectContaining({
          type: "fileChange",
          status: "completed",
          changes: [
            expect.objectContaining({ path: "src/app.ts", diff: patch }),
          ],
        }),
      }),
    );
  });
});
