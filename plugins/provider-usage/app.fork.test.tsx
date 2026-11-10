// @vitest-environment jsdom
// bb-fork(usage-sources): an empty machine explains itself depending on
// bb-fork(usage-sources): whether any usage source is enabled.
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  [true, "No provider on this machine reports usage limits."],
  [false, "No usage source is enabled."],
] as const)(
  "explains an empty machine with hasUsageSources=%s",
  async (hasUsageSources, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          result: {
            hasUsageSources,
            machines: [
              {
                id: "host-m4",
                displayName: "M4",
                status: "connected",
                providers: [],
                error: null,
              },
            ],
          },
        }),
      ),
    );
    const app = await loadPluginApp(() => import("./app"));
    const mounted = await mountPluginContentScripts(app, {
      pluginId: "provider-usage",
    });
    const item = app.experimentalSidebarFooterItems[0];
    if (item?.kind !== "disclosure") throw new Error("missing disclosure");
    const slot = renderSlot(item, { dismiss: vi.fn() });
    await waitFor(() =>
      expect(slot.getByText(expected, { exact: false })).toBeTruthy(),
    );
    await mounted.lifecycle.dispose();
  },
);
