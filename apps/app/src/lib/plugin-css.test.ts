// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPluginCss,
  resetPluginCssForTest,
  setPluginCssFailureHandler,
} from "./plugin-css";

const URL_V1 = "/api/v1/plugin-app-assets/aaaaaaaaaaaaaaaa/app.css";
const URL_V2 = "/api/v1/plugin-app-assets/bbbbbbbbbbbbbbbb/app.css";

function preloadLink(): HTMLLinkElement {
  const link = document.head.querySelector<HTMLLinkElement>(
    "link[data-bb-plugin-css-preload]",
  );
  if (link === null) throw new Error("expected a plugin stylesheet preload");
  return link;
}

function failCurrentPreload(): void {
  preloadLink().dispatchEvent(new Event("error"));
}

describe("plugin css load failures", () => {
  afterEach(() => {
    resetPluginCssForTest();
  });

  it("notifies a bounded number of times for a failed url", () => {
    const onFailure = vi.fn();
    setPluginCssFailureHandler(onFailure);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      applyPluginCss("hello", URL_V1);
      failCurrentPreload();
    }

    expect(onFailure.mock.calls.map(([, , attempt]) => attempt)).toEqual([
      0, 1, 2, 3,
    ]);
    for (const [pluginId, url] of onFailure.mock.calls) {
      expect(pluginId).toBe("hello");
      expect(url).toBe(URL_V1);
    }
  });

  it("counts failures again when the bundle url changes", () => {
    const onFailure = vi.fn();
    setPluginCssFailureHandler(onFailure);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      applyPluginCss("hello", URL_V1);
      failCurrentPreload();
    }
    expect(onFailure).toHaveBeenCalledTimes(4);

    applyPluginCss("hello", URL_V2);
    failCurrentPreload();
    expect(onFailure).toHaveBeenCalledTimes(5);
    expect(onFailure).toHaveBeenLastCalledWith("hello", URL_V2, 0);
  });
});
