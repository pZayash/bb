// bb-fork(file-diff): .xhtml and friends render through the HTML preview.
import { describe, expect, it } from "vitest";
import { isHtmlFilePreviewPath } from "../src/file-preview.js";

describe("file-preview", () => {
  it("recognizes every HTML preview extension", () => {
    expect(isHtmlFilePreviewPath("report.html")).toBe(true);
    expect(isHtmlFilePreviewPath("reports/report.HTM")).toBe(true);
    expect(isHtmlFilePreviewPath("report.xhtml")).toBe(true);
    expect(isHtmlFilePreviewPath("report.md")).toBe(false);
  });
});
