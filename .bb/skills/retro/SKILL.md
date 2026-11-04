---
name: retro
description: "Conduct a retrospective on a coding session and propose environment improvements (navigation, checks, standards, steering files, tooling). Use when the user asks for /retro or a session retrospective."
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs. You only propose; nothing changes until the user picks a candidate.

## Steps

1. Before drafting prose for any steering file or doc, read that file and match its existing style: terse rules, no filler.

2. Read the primary sources for the session the user specifies. In bb a session is a thread: run `bb status` for the current thread, `bb thread list` and `bb thread search <query>` to find others, and `bb thread log <id>` / `bb thread output <id>` to read their record. If the user doesn't specify a session, default to the current thread — its record is your own context.

3. Look for candidates for improvement in these categories. Every candidate must trace to a specific moment in the session record, not a generic best practice.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Read the repo's own check commands first: `package.json` scripts, `turbo.json` tasks (`pnpm exec turbo run typecheck|lint|test --filter=...`), `.oxlintrc.json` and its custom rules in `scripts/oxlint-plugin.mjs`, `.oxfmtrc.json`, and the CI workflows in `.github/workflows` (`ci.yml`, `pr-gate.yml`). A check that already exists but sits unwired or silently broken is the finding, not a reinvention. A missing guardrail (no CI job running the lint/typecheck/test command) is itself a finding. _Use when_ the agent made a mistake an automated check could have caught.
- **Coding standards**: should the **reviewer** be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop — a custom oxlint rule in `scripts/oxlint-plugin.mjs`, a turbo task, or a CI job, whichever is cheapest. Default to building the check over writing the rule. Reserve `docs/CODE_REVIEW.md` for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could substitute for). _Use when_ review failed to catch a mistake.
- **Global AGENTS.md**: are there steering instructions that should move to `docs/` or `docs/CODE_REVIEW.md`, or become automated checks? _Use when_ `AGENTS.md` (repo or the user's global `~/.claude/CLAUDE.md`) is particularly large.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is any custom tooling (`bb` CLI surface, MCP servers, plugin commands) particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for opportunities to widen the agent's access to information — teed dev-server logs (see `docs/debugging-and-qa.md`), read-only access to a service, a missing `bb` CLI read path. _Use when_ a crucial piece of information was not available to the agent.

4. Present the candidates to the user, most severe first. Wait for the user to pick before changing anything.

## Reference

### Implementation vs Review

All work goes through two stages: implementation and review. The implementing agent has the most **context pressure** — it explores, writes code, and debugs failures. The reviewing agent gets a diff and little else, so it has room to enforce standards.

This means new rules belong where the reviewer reads them (`docs/CODE_REVIEW.md`), not in `AGENTS.md`, which loads into every session whether it is relevant or not.

### Files

- `AGENTS.md`/`CLAUDE.md`: pushed into the context of every agent in this repo (`CLAUDE.md` redirects to `AGENTS.md`). Use sparingly, mostly for **navigation pointers** to other files.
- `docs/CODE_REVIEW.md`: this repo's reviewer guide, read during review rather than implementation. If it grows unwieldy, add navigation pointers into `docs/` instead of more prose.
- `docs/`: reference material pointed to by steering files. Look for an existing doc before proposing a new one.
- `.bb/skills/`: repo skills for docs-as-skill or user-invoked commands; the description loads into context, so keep it tight.

### Fork conventions

This repo is a fork of `get-bb/bb`. Environment changes that touch upstream files add merge cost: prefer fork-owned files and marked seams (`bb-fork(windows):` markers, `*.fork.ts`, single-line call sites) per the Fork Merge Conventions in `AGENTS.md`. A retro candidate that grows the patched-upstream-file surface should say so explicitly and offer the fork-owned alternative.
