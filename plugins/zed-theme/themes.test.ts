import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./package.json" with { type: "json" };

const themePath = join(import.meta.dirname, "themes", "zed.css");
const css = readFileSync(themePath, "utf8");

function declaredFamilies(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/@font-face\s*\{[^}]*font-family:\s*"([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

function tokenFamilies(source: string): string[] {
  const tokens = source.slice(source.indexOf(":root"));
  return [
    ...new Set(
      [...tokens.matchAll(/--font-[a-z]+:\s*\n?\s*"([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

describe("zed theme asset", () => {
  it("declares every family its font tokens name", () => {
    const families = declaredFamilies(css);
    expect(families).toEqual(["IBM Plex Sans", "Lilex"]);
    expect(tokenFamilies(css)).toEqual(families);
  });

  it("overrides the three typography tokens the app reads", () => {
    for (const token of ["--font-sans", "--font-mono", "--font-terminal"]) {
      expect(css).toContain(token);
    }
    expect(css).toMatch(/--font-mono:[\s\S]*?"Lilex"/);
    expect(css).toMatch(/--font-terminal:[\s\S]*?"Lilex"/);
  });

  it("keeps every font source on the CDN, because the runtime serves no plugin files", () => {
    const sources = [...css.matchAll(/url\(\s*([^)]+?)\s*\)/g)].map((match) =>
      match[1].replace(/^["']|["']$/g, ""),
    );
    expect(sources.length).toBeGreaterThan(0);
    expect(
      sources.filter(
        (source) => !source.startsWith("https://cdn.jsdelivr.net/"),
      ),
    ).toEqual([]);
  });

  it("resolves every manifest theme to this file", () => {
    expect(manifest.bb.themes.length).toBeGreaterThan(0);
    for (const theme of manifest.bb.themes) {
      const declaredPath = join(
        import.meta.dirname,
        theme.css.replace(/^\.\//, ""),
      );
      expect(declaredPath).toBe(themePath);
      expect(existsSync(declaredPath)).toBe(true);
      expect(theme.id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
    }
  });
});
