# Native Windows hosts

Fork-owned documentation for running bb on a native Windows host (no WSL2).
Upstream `docs/` describe the macOS/Linux/WSL2 contract; this page lists the
native Windows delta.

- Setup and operation of the Windows supervisor: [README.windows.md](../README.windows.md).
- Upstream platform contract: [docs/platform-support.md](platform-support.md).

## Platform support

Native Windows is a supported persistent host in this fork alongside macOS,
Linux, and WSL2. On native Windows:

- all `bb` processes run in native Windows PowerShell or CMD
- Node.js, Git, and provider CLIs are installed natively on Windows
- local project paths use native Windows drive-letter and UNC paths
- terminals run PowerShell (`pwsh`/`powershell.exe`) or `cmd.exe` through
  ConPTY

The WSL2 flow is unchanged: run everything inside one Ubuntu distro, use
Linux-style absolute paths, and keep native Windows paths out of that flow.

## Environment lifecycle hooks

The setup and teardown hooks are platform-specific:

| Platform           | Setup hook          | Teardown hook          |
| ------------------ | ------------------- | ---------------------- |
| macOS, Linux, WSL2 | `.bb-env-setup.sh`  | `.bb-env-teardown.sh`  |
| native Windows     | `.bb-env-setup.ps1` | `.bb-env-teardown.ps1` |

On native Windows bb runs a `.ps1` hook with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .bb-env-setup.ps1
```

A `.bb-env-setup.sh` file also runs on native Windows through the bash that Git
for Windows installs, but only when the matching `.ps1` hook is absent; without
Git for Windows the hook fails with a message naming it. A `.ps1` hook is
ignored on macOS, Linux, and WSL2. Commit the hook that matches the host
platform. The environment,
timeout, working directory, and failure contracts are otherwise the same as the
upstream [worktree hook contract](worktrees.md).

## Pi bridge command

The Pi provider starts `pi` from `BB_PI_BRIDGE_COMMAND` (default `pi`). On
native Windows a command that needs a shell — `pi`, `pi.cmd`, `pi.bat`, or an
extensionless path — is started through Node's `shell: true`, which joins the
command and its arguments into one `cmd.exe` string without quoting them.

- A `BB_PI_BRIDGE_COMMAND` whose path contains spaces fails: `cmd.exe` splits
  the path at the first space and reports that the truncated path cannot be
  found. Arguments that contain spaces (for example a session directory or an
  extension path) fail the same way because they share that string.
- Spawning a `.cmd` shim directly without `shell: true` is not a workaround on
  Node.js 22: it throws `EINVAL`.
- On macOS and Linux the bridge spawns the command directly and does not use
  the shell, so spaced paths work there.

Because a shell child cannot inherit the bridge's fd 3/4 pipes, the fork also
exposes the bridge channel over a named pipe
(`BB_PI_BRIDGE_CHANNEL_PIPE`). Keep the Pi install, the bb data directory, and
other bridge argument paths free of spaces on native Windows.

## Local project paths

Native Windows drive-letter and UNC paths are accepted at the app/server
boundary on native Windows hosts. In the WSL2 flow they are still rejected so
unsupported input fails clearly.

## Long checkout paths

Node.js 22.19+ resolves a package's `#imports` through a native package-scope
lookup that cannot read a `package.json` at a path of 260 characters or more
(Windows `MAX_PATH`) and silently reports it as missing. In a deep checkout or
worktree this breaks every tool that loads Vite 8 before doing any work:

```text
TypeError [ERR_PACKAGE_IMPORT_NOT_DEFINED]: Package import specifier
"#module-sync-enabled" is not defined imported from
…\node_modules\.pnpm\vite@…\node_modules\vite\dist\node\chunks\node.js
```

`vitest`, `vite build`, `pnpm exec turbo run build --filter=@bb/app`, and the
`scripts/windows/install.ps1` build all fail this way, while `tsc`, `oxlint`,
`oxfmt`, and `node --import tsx` keep working, because plain `node_modules`
resolution reads long paths fine.

The fork's root `.npmrc` sets `virtual-store-dir-max-length=50`, which caps the
`node_modules/.pnpm/<pkg>@<version>` entry name (pnpm keeps the package's own
directory name intact) and leaves room for the checkout path. Two
consequences:

- An existing checkout was linked with pnpm's default of 120 and must be
  relinked once with `pnpm install --force`; a plain `pnpm install` fails with
  `VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF`. `scripts/windows/merge-upstream.ps1`
  retries with `--force` when it hits that error.
- The limit is not gone, only moved: a checkout root longer than about 158
  characters, or a repository directory name near the 200-byte worktree cap,
  can still exceed it. Keep dev checkouts and `BB_DATA_DIR` short;
  `scripts/windows/check.ps1` warns when the checkout path is too long.

Verify with `pnpm exec vitest --version` from any package (it fails immediately
when the limit is hit) and `pnpm exec turbo run test --filter=@bb/templates --force`.

## Fork app behavior

Three fork-owned deltas change app behavior on every platform:

- An unset `sidebar.organizationMode` preference defaults to By project
  (`project`); upstream defaults it to Custom (`chronological`). The preference
  stays server-backed, so an explicit choice, `bb settings ui set`, and
  `bb settings ui reset` behave as documented.
- The app remembers the last opened thread in browser storage
  (`bb.fork.lastThread`) and reopens it when a load lands on the new-thread
  screen (`/`). It validates the remembered thread against the cached sidebar
  bootstrap first, and never redirects after an in-session navigation. This
  keeps the active chat across dev-instance reloads, which upstream loses
  because it keeps the route only in the URL and in-memory history.
- ACP agents that title the session from the prompt would echo back the
  `<system_instructions>` block bb injects into the first prompt, and the
  first reported title wins. The ACP bridge (`title-echo.fork.ts`) drops
  `session_info_update` titles that replay the injected block — or unwraps
  the block when real user text follows it — so bb's first-message title
  fallback or a later honest agent title is used instead. Plugin bridges
  bundle their own copy of the bridge code from the published SDK, which
  never carries that filter, so the server also drops or unwraps
  agent-reported titles that start with `<system_instructions>` before
  applying them (`apps/server/src/internal/agent-title-echo.fork.ts`).

## Terminal shells

On native Windows the fork starts terminals in a shell the machine actually has,
and lets you choose among them:

- Detection order is PowerShell 7 (`pwsh.exe`, from `PATH` then
  `%ProgramFiles%\PowerShell\7` and the `WindowsApps` alias), Windows
  PowerShell, then Git Bash (`<Git install>\bin\bash.exe`, found beside a
  `git.exe` on `PATH` or under the standard Git for Windows locations). The
  first detected shell is the machine default; a machine with none fails the
  launch with one clear message.
- The Start terminal row in the side panel carries a **Shell** picker once the
  machine reports more than one shell, and the last choice is remembered as the
  `terminal.shellId` UI preference. A stored id that the current machine no
  longer offers falls back to that machine's default instead of failing.
- Git Bash starts as its own launcher does (`bash.exe --login -i`); PowerShell
  keeps `-NoLogo` and `-NoLogo -Command`. A command terminal on Git Bash uses the
  generic posix `-lc` arguments.
- `bb terminal shells --machine <id-or-name>` prints the ids, labels, paths, and
  the default; `bb terminal create --shell <id>` picks one. `terminal restart`
  still replaces a terminal with the machine default shell.
- Non-Windows hosts report no shell list, so the picker stays hidden and the
  existing posix resolution (`SHELL`, `/bin/zsh`, `/bin/bash`, `/bin/sh`) is
  unchanged.

## Source development on native Windows

`pnpm dev` runs the whole stack natively: Vite serves the app with hot module
replacement, and the server and host daemon run from source through `tsx` under
their dev supervisors, so iterating needs no production build.

- Ports and the data directory are derived from the checkout path, so they are
  not fixed. `pnpm dev` prints the active app URL, server URL, host-daemon port,
  and data directory; read them from there instead of assuming values. Every
  checkout and git worktree gets its own set, so a dev instance never collides
  with a packaged or supervisor-managed bb on 38886/38887.
- App changes need no restart. Server and host-daemon changes do:
  `pnpm dev:restart-server`, `pnpm dev:restart-host-daemon`, and `pnpm dev:restart`
  rebuild, then restart only the affected service. `dev:restart-server` escalates
  to both services when the running host daemon reports a different
  `HOST_DAEMON_PROTOCOL_VERSION`, because a mismatched server/daemon pair cannot
  connect.
- Windows has no `SIGUSR1` and cannot deliver `SIGTERM` to another process, so
  restart and stop requests travel through `<data dir>/dev-supervisors/<service>.restart`
  and `<service>.stop`, which the dev supervisor polls; POSIX keeps the signal
  paths. Supervisor pid files live in the same directory, and a pid file left
  behind by a forced stop is reported as stale and removed on the next request.
- `pnpm dev:status` prints the instance data directory, URLs, supervisor pids, and
  whether the app, server, and host-daemon ports are listening. `pnpm dev:stop`
  stops both dev supervisors through their stop files and then removes the
  remaining `pnpm dev` process tree, so ports and pid files are released.
  Upstream removed `scripts/bb-dev-app` and `pnpm dev:desktop` (#3669); the
  launcher now routes `dev:status`/`dev:stop` to the native dev instance control
  on every platform. Ctrl+C in the `pnpm dev` terminal keeps working.
- `node scripts/windows/cdp-capture.mjs <url> <waitMs>` launches headless Edge
  against a dev URL and prints console warnings/errors, exceptions, and a final
  page probe — useful when a frontend plugin crash is invisible without devtools.
- Terminals, providers, plugin host workers, and the bundled `bb` CLI behave as
  they do on a supervisor-managed host; the fork only changes how the dev server
  and the dev host daemon start and restart.
- The dev server hot-reloads builtin plugin sources. While a plugin is showing an
  open user form (an `AskUserQuestion` card, a secret request), its rebuild and
  reload are held back and retried every few seconds so the form survives; the
  request is answered normally instead of being interrupted mid-answer. If the
  page still reloads (HMR, a manual reload, a server restart), a question form
  restores the answers already chosen from a per-tab draft keyed by interaction
  id, so a long multi-question form resumes where it was left off.

- After an upstream merge, restart the dev server (`pnpm dev:restart-server`)
  before judging the UI. A bundled plugin that upstream added is reconciled
  only at server startup, so until the restart it stays uninstalled and the app
  shows placeholders such as `No thread list plugin is enabled.` even though the
  threads themselves are intact.

The dev flow stays a maintainer surface rather than a shipped product path:
native Windows ships through the supervisor ([README.windows.md](../README.windows.md))
and the `npx bb-app` package, and the repository's remaining development commands
are POSIX-first.

## Composer keyboard shortcuts

This fork changes the prompt box submit keys so a missed keystroke cannot send
a half-written message:

| Key                | Action                                          |
| ------------------ | ----------------------------------------------- |
| Enter, Shift+Enter | Insert a newline                                |
| Ctrl+Alt+Enter     | Primary submit (what `enter` does upstream)     |
| Ctrl+Enter         | Modifier action (steer/queue), unchanged        |

The `steerActiveThreadOnEnter` setting still picks which action is primary; it
now binds to Ctrl+Alt+Enter instead of Enter. Submit button titles and the
editor `aria-keyshortcuts` advertise the new chord. The flip switches are
`FORK_ENTER_SUBMITS` in `plugins/composer/src/submit-key-chords.fork.ts` and
`apps/app/src/components/promptbox/primary-submit-shortcut.fork.ts`.

## better-sqlite3 version pin

`packages/bb-app` is pinned to `better-sqlite3@12.11.1` (upstream uses 13.x).
13.x's implicit `node-gyp rebuild` requires a ClangCL toolset that is not
present on Windows dev machines, while the bundled `prebuilds/win32-x64.node`
is what actually loads at runtime — so the build is pure failure risk here.
12.x installs through `prebuild-install` without a toolchain.

## Agent harness (1c-agent-kit)

The fork carries the `1c-agent-kit` agent harness as a git submodule at
`harness/` (node stack; see `.kit.json`). Layout links live under `.cursor/`,
`.agents/`, `.claude/`, `.pi/`, and `tools/` — all junctions into `harness/`
managed by `harness/scripts/bootstrap-kit.ps1`; the link list is the
`kit-managed` block in `.gitignore`. Re-run layout and diagnostics:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File harness/scripts/bootstrap-kit.ps1 -ConsumerRoot . -SkipDeps
bash harness/scripts/kit-doctor.sh .   # use Git Bash, not WSL bash
```

POSIX tools on a native Windows shell are shadowed by System32 binaries:
`bash` launches WSL (`C:\Windows\System32\bash.exe`) and `find` runs
`FIND.exe`. Invoke Git Bash explicitly (`C:\Program Files\Git\bin\bash.exe`)
and call Node tooling as `C:\nvm4w\nodejs\npm.cmd` / `npx.cmd` — bare
`npm`/`npx` are not on the Git Bash PATH.

When several bb threads work the same project checkout, their commits share
one working tree. Stage files by name — a blanket `git add -A` sweeps another
thread's in-progress edits into your commit.

Host dependencies beyond the pnpm toolchain are global and not pinned by the
repo: `rtk` and `@fission-ai/openspec@1.2.0` (`npm i -g @fission-ai/openspec@1.2.0`).

OpenSpec covers fork-originated changes only — upstream merges arrive
un-specced. The `openspec/` scaffold (project.md, `changes/`, `specs/`) is
maintained manually: never run `openspec init` here. `.claude/skills`,
`.pi/skills`, `.pi/prompts`, and `.claude/commands` are junctions into
`.cursor/`, so init would write through the links and drop vendor skills on
top of kit-managed ones.
