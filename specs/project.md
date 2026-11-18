# bb (Windows fork)

bb — agentic IDE for managing coding agents (projects, threads, environments).
This repository is a fork of `get-bb/bb` adding native Windows support.

- `origin` = `pZayash/bb` (our fork), `upstream` = `get-bb/bb`. Push only to origin.
- Fork delta must stay small: new behavior goes in fork-owned files
  (`*.windows.ts`, `*-windows.ts`, `*.fork.ts`), upstream files get minimal seams.
- Full conventions: [AGENTS.md](../AGENTS.md). Merge ritual: `pnpm run merge:upstream`.
- Toolchain: pnpm + Turbo (`pnpm exec turbo run <task> --filter=<pkg>`).
- Agent harness: `1c-agent-kit` submodule at [harness/](../harness/README.md).
  OpenSpec covers fork-originated changes only; upstream merges arrive un-specced.
- Scaffolds in this directory are manual — never run `openspec init`
  (it writes through `.claude`/`.pi` junctions and clobbers kit-managed dirs).
