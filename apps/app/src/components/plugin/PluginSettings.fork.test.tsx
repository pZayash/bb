// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { resetPluginSlotStoreForTest } from "@/lib/plugin-slots";
import { PluginSettingsForm } from "./PluginSettings";

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// bb-fork(compaction-model): experimental_model swaps the input for a
// provider-catalog picker that saves on selection.
describe("PluginSettingsForm (fork)", () => {
  it("saves a model picked from the provider catalog immediately", async () => {
    const MODEL_SETTINGS_VIEW = {
      ok: true,
      schema: {
        compactionModel: {
          type: "string",
          label: "Compaction model",
          experimental_model: { providerId: "pi" },
        },
      },
      values: { compactionModel: "" },
    };
    const requests: RecordedRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        if (url.includes("/api/v1/system/execution-options")) {
          return jsonOk({
            providers: [],
            permissionCeiling: "full",
            models: [
              {
                id: "deepseek/deepseek-flash",
                model: "deepseek/deepseek-flash",
                displayName: "DeepSeek Flash",
                routeProviderId: "deepseek",
                description: "",
                supportedReasoningEfforts: [],
                defaultReasoningEffort: "none",
                isDefault: false,
              },
            ],
            selectedOnlyModels: [],
            modelLoadError: null,
          });
        }
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body)) as {
            values: Record<string, unknown>;
          };
          return jsonOk({
            ...MODEL_SETTINGS_VIEW,
            values: { ...MODEL_SETTINGS_VIEW.values, ...body.values },
          });
        }
        return jsonOk(MODEL_SETTINGS_VIEW);
      }),
    );

    const { wrapper } = createQueryClientTestHarness();
    render(<PluginSettingsForm pluginId="demo" />, { wrapper });

    const trigger = await screen.findByRole("button", {
      name: "Compaction model",
    });
    expect(trigger.textContent).toContain("Thread's own model");
    expect(requests.some((request) => request.init?.method === "PUT")).toBe(
      false,
    );

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText("DeepSeek Flash"));

    const put = await vi.waitFor(() => {
      const request = requests.find(
        (candidate) => candidate.init?.method === "PUT",
      );
      expect(request).toBeDefined();
      return request;
    });
    expect(put?.url).toBe("/api/v1/plugins/demo/settings");
    expect(JSON.parse(String(put?.init?.body))).toEqual({
      values: { compactionModel: "deepseek/deepseek-flash" },
    });
    await vi.waitFor(() =>
      expect(trigger.textContent).toContain("DeepSeek Flash"),
    );
  });
});
