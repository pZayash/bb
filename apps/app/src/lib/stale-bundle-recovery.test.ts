// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installStaleBundleRecovery,
  uninstallStaleBundleRecoveryForTest,
} from "./stale-bundle-recovery";

function markerStorage(values: Map<string, string>) {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function preloadErrorEvent(payload?: unknown): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  if (payload !== undefined) {
    (event as Event & { payload?: unknown }).payload = payload;
  }
  return event;
}

function install(args: {
  values: Map<string, string>;
  now: () => number;
  reload: () => void;
}): void {
  installStaleBundleRecovery({
    markerStorage: markerStorage(args.values),
    now: args.now,
    reload: args.reload,
  });
}

afterEach(() => {
  uninstallStaleBundleRecoveryForTest();
});

describe("stale bundle recovery", () => {
  it("swallows the missing route bundle and reloads once", () => {
    const values = new Map<string, string>();
    const reload = vi.fn();
    install({ values, now: () => 1_000, reload });

    const event = preloadErrorEvent(
      new TypeError(
        "Failed to fetch dynamically imported module: /assets/ToolsView-a.js",
      ),
    );
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(values.size).toBe(1);
  });

  it("swallows further failures on the same page without reloading again", () => {
    const values = new Map<string, string>();
    const reload = vi.fn();
    install({ values, now: () => 1_000, reload });

    window.dispatchEvent(preloadErrorEvent());
    const second = preloadErrorEvent();
    window.dispatchEvent(second);

    expect(second.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the error visible when a bundle fails again inside the reload cooldown", () => {
    const values = new Map<string, string>();
    install({ values, now: () => 1_000, reload: vi.fn() });
    window.dispatchEvent(preloadErrorEvent());
    uninstallStaleBundleRecoveryForTest();

    const reload = vi.fn();
    install({ values, now: () => 2_000, reload });
    const event = preloadErrorEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads again once the cooldown has passed", () => {
    const values = new Map<string, string>();
    install({ values, now: () => 1_000, reload: vi.fn() });
    window.dispatchEvent(preloadErrorEvent());
    uninstallStaleBundleRecoveryForTest();

    const reload = vi.fn();
    install({ values, now: () => 61_000, reload });
    const event = preloadErrorEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the error visible when the tab cannot record reload attempts", () => {
    const reload = vi.fn();
    installStaleBundleRecovery({ markerStorage: null, reload });

    const event = preloadErrorEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps the first handler when installed twice", () => {
    const values = new Map<string, string>();
    const first = vi.fn();
    install({ values, now: () => 1_000, reload: first });
    const second = vi.fn();
    install({ values, now: () => 1_000, reload: second });

    window.dispatchEvent(preloadErrorEvent());

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("stops handling bundle failures after uninstall", () => {
    const values = new Map<string, string>();
    const reload = vi.fn();
    install({ values, now: () => 1_000, reload });
    uninstallStaleBundleRecoveryForTest();

    const event = preloadErrorEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
