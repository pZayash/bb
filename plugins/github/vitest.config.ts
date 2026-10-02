import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    silent: "passed-only",
    name: "bb-plugin-github",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    // bb-fork(windows): the fake `gh` shell script spawns slowly on Windows.
    testTimeout: 30_000,
  },
});
