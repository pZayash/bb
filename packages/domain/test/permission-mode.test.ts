import { describe, expect, it } from "vitest";
import { reconcilePermissionMode } from "../src/permission-mode.js";

describe("reconcilePermissionMode", () => {
  it("keeps a candidate the provider supports", () => {
    expect(
      reconcilePermissionMode("auto", ["accept-edits", "auto", "full"]),
    ).toBe("auto");
  });

  it("moves an unsupported candidate down to the highest mode below it", () => {
    expect(
      reconcilePermissionMode("auto", ["accept-edits", "full"]),
    ).toBe("accept-edits");
    expect(
      reconcilePermissionMode("full", ["accept-edits", "auto"]),
    ).toBe("auto");
  });

  it("elevates only to the lowest supported mode when nothing is at or below", () => {
    expect(reconcilePermissionMode("accept-edits", ["full"])).toBe("full");
    expect(reconcilePermissionMode("accept-edits", ["auto", "full"])).toBe(
      "auto",
    );
  });

  it("throws when supported is empty", () => {
    expect(() => reconcilePermissionMode("auto", [])).toThrow();
  });
});
