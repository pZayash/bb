---
kind: instruction
title: bb Guide — Environments
summary: Command reference for environment setup, inspection, commits, and merges.
intent: Provide complete environment command documentation for agents.
editingNotes: Keep flags accurate against the CLI implementation.
---
Environment commands

Environments determine where threads run. Multiple threads can share an environment
(e.g., a coding thread and a review thread in the same worktree).
The first-party choices are Project checkout (the project's existing directory),
Worktree (a fresh Git worktree), and Personal workspace (a projectless workspace).

New Worktree branches start at the selected base without an upstream, regardless
of Git's branch.autoSetupMerge setting. Publish with `git push -u origin HEAD`
to track the task's remote branch. Existing branches keep their upstream.

Making your repo work with bb:

  If the default environment plugin is disabled or missing, creation fails
  before inserting a thread. Enable the plugin or explicitly choose another
  environment; BB does not silently replace an isolated worktree with a checkout.
  Host-dependent preflight checks require the selected machine to be connected.

  Commit a .bb-env-setup.sh script at the repo root when new bb worktrees need
  repo-specific setup. After bb creates a new managed worktree environment, it
  looks for .bb-env-setup.sh inside that new workspace. If the file is absent,
  provisioning continues with no error.

  The script must be tracked by git. A fresh worktree only checks out tracked
  files, so an untracked .bb-env-setup.sh in your source checkout will not be
  present and will not run.

  BB runs the hook as `env bash .bb-env-setup.sh` with cwd set to the new
  workspace. On Windows it runs the script with the bash that Git for Windows
  installs, so the same script works there; without Git for Windows the hook
  fails with a message naming it. The hook
  inherits the host daemon's sanitized environment: NODE_ENV and every BB_*
  variable are removed, and bb does not inject BB_PROJECT_ID, BB_ENVIRONMENT_ID,
  or BB_SOURCE_PATH.

  Hooks run only in paths bb created and owns, such as new worktrees and
  checkouts bb cloned; attached project checkouts and personal workspaces never
  run hooks. A server restart does not interrupt a running hook, but a daemon
  restart leaves its outcome unknown.

  A non-zero exit, timeout (15 minutes), signal, or cancellation fails provisioning and bb
  removes the new worktree after confirming the script has stopped. An unknown
  hook outcome blocks automatic cleanup and requires inspection before recovery.
  Keep optional setup steps non-fatal inside the
  script if the environment should still open. Provisioning progress reports
  "Running .bb-env-setup.sh" and then ".bb-env-setup.sh finished",
  ".bb-env-setup.sh failed", or ".bb-env-setup.sh cancelled".

  Commit a .bb-env-teardown.sh script at the repo root when setup creates
  resources outside the managed worktree. BB runs the hook as
  `env bash .bb-env-teardown.sh` from the worktree before it removes the
  worktree. The hook receives the same sanitized environment as the setup
  hook, and stdin is closed.

  Teardown has a separate 15-minute timeout. A non-zero exit, timeout, or
  signal reports failure in the destroy transcript, but bb still removes the
  worktree once the script has stopped. An unreachable daemon leaves cleanup
  pending for retry; a hook whose outcome is unknown blocks cleanup with an
  explicit error.

  New worktrees do not contain untracked files such as .env.local. To copy
  them from the source checkout, commit a .worktreeinclude file at the repo
  root. It uses gitignore syntax: one pattern per line, # for comments, ! to
  negate an earlier pattern. bb copies each untracked file in the source
  checkout that matches a pattern:

    .env
    .env.*
    !.env.example
    certs/

  bb copies files only. It follows no symlinks, and it replaces nothing that
  the worktree already has. The copy runs after `git worktree add` and before
  .bb-env-setup.sh, so the setup script can read the copied files. A pattern
  that matches nothing, or a file bb cannot read, is reported in the
  provisioning transcript and does not fail provisioning.

  Large directories such as node_modules are copied file by file. Install
  dependencies in .bb-env-setup.sh instead of listing them here.

  For files that customize agent instructions and skills (AGENTS.md,
  .bb/AGENTS.md, .bb/skills/), run `bb guide agent-configuration`.

  bb environment providers                List registered environment providers in picker order:
                                          Project checkout, Worktree, then other installed providers
                                          by display name; includes id, name, the `requires` facts (host,
                                          projectCheckout, gitCheckout, gitRemote, projectless), and whether
                                          it takes --environment-inputs (--json prints the JSON Schema,
                                          description, icon, and availability)
    --project <id>                        Filter by structural eligibility for this project
    --machine <id-or-name>               Scope structural eligibility to this machine
    --host <id-or-name>                  Alias for --machine

  With --project, providers whose requirements are unmet on every persistent
  machine are omitted, and `--json` reports each provider's
  `machineAvailability` per machine. Add --machine to print that machine's
  availability: `available`, `setup-required`, `unavailable` with the plugin's
  reason, or `unknown` while the background check has not answered. Listing
  never waits on a machine; results can be up to ten minutes old, and thread
  creation checks the selected provider and machine afresh.
  bb environment list                     List environments that are not destroyed
    --project <id>                        Only environments in this project
    --provider <id>                       Only environments this environment provider produced
    --host <id-or-name>                   Only environments on this machine
    --instance-key <key>                  Only the environment its provider named with
                                          this instance key (with --provider, the one
                                          row that provider's launch produced)
    --status <status>                     Only environments in this status: provisioning,
                                          ready, error, destroyed (the only way to see
                                          destroyed rows)
    --limit <n> / --offset <n>            Page through the rows, oldest first
  bb environment delete <id>              Request provider cleanup; refused while threads are
                                          live or stopping. The command returns with cleanup
                                          requested; lifecycle becomes destroyed only after
                                          provider removal completes
  bb environment cleanup <id>             Remove an unused provider-managed environment now
    --recover                             After inspection, acknowledge interrupted hooks and
                                          retry failed cleanup (Linux same-user process guard)
  bb environment show <id>                Show environment details (path, branch, status, lifecycle, retirement deadline and teardown attempts)

  bb environment paths <id>               Search workspace paths
    --query <query>                       Fuzzy path query
    --limit <count>                       Maximum results
    --files                               Include only files unless combined with --directories
    --directories                         Include only directories unless combined with --files

  bb environment update <id>              Update environment metadata
    --merge-base-branch <branch>          Set merge-base branch override
    --clear-merge-base-branch             Clear merge-base override
    --name <name>                         Set display name
    --clear-name                          Clear display name
    --start-ref <sha>                     Set the comparison start commit
    --clear-start-ref                     Clear the comparison start commit

  bb environment commits <id>             List recent commits, newest first (50 at most)

  bb environment commit <id>              Create a commit in the environment

  bb environment archive-threads <id>     Archive all threads in an environment

  After the last live thread is archived, the environment provider's policy
  sets a retirement deadline; checkout environments never retire. A worktree
  waits five minutes and then tears down: it runs .bb-env-teardown.sh, stops
  every process whose working directory is inside the worktree (the agent
  process, background jobs it left behind, and also shells, editors, or
  servers you started there yourself), removes the worktree, and records the
  environment as destroyed. The branch is kept. Unarchiving a thread inside
  the grace window cancels the teardown. Move your own shells out of the
  worktree first if you want to keep them. Deleting the last thread, or an
  explicit environment or project deletion, skips the grace (including a
  never-retire policy). Failed teardown retries after 1, 2, 4, and 8 minutes, then stops after
  five failed attempts with a "Needs recovery" message;
  `bb environment show <id>` reports the lifecycle phase, deadline, teardown
  attempt, and failure message.

  `bb environment cleanup <id> [--json]` overrides retention and retry backoff
  to remove an unused provider-managed environment early. It is not a routine
  end-of-task step. It rejects live threads and unmanaged environments,
  succeeds if already removed, and completes asynchronously. It cannot bypass
  "Needs recovery"; `bb environment list` includes the failure message.

  `bb environment cleanup <id> --recover [--json]` is an explicit acknowledgement
  after inspecting a failed environment. It marks interrupted hooks finished,
  resets the retry budget, and retries removal. It also handles interrupted
  setup without a recorded hook operation. A teardown hook that never started
  still runs. A daemon reboot alone never proves a detached hook has stopped.

  Recovery currently requires Linux. It refuses while a setup/hook is still
  active, while any process owned by the daemon UID has its cwd or a mapped
  file path under the workspace, or while any such process cannot be inspected.
  The guard compares paths, including deleted paths, rather than shared inode
  identity. It does not kill processes. Processes owned by other users require
  separate inspection before recovery. Stop or move your own workspace users
  first. Unsupported platforms and unavailable daemons refuse recovery.
  Existing cleanup callers can use the additive `recover` option on
  `sdk.environments.experimental_cleanup({ environmentId, recover: true })`.
  Inspect `bb environment show <id>` after recovery to confirm removal.

  Pull requests moved to the bundled GitHub PR Status plugin:
  `bb pull-request show|ready|draft|merge <environment-id>`. See its
  github-pr-status skill.

  Git status, branches, diffs and Viewed marks moved to the bundled Git
  plugin: `bb git status|branches|diff|files|file|patch|viewed
  <environment-id>`. See its git skill. The old `bb environment status`,
  `branches`, `diff`, `diff-files`, `diff-file`, `diff-patch` and
  `diff-viewed` commands still run and print the command that replaced them.

Every inspection command accepts an arbitrary environment ID and supports
`--json`. Non-git status/diff responses are reported explicitly. `diff-file`
prints UTF-8 content directly and labels base64 binary content; diff and patch
truncation markers are preserved.

bb account (getbb.app sign-in):

  The builtin "bb account" plugin signs this bb server in to your getbb.app
  account and holds its server credential. Remote access and hosted services
  use it; they never see the credential.

  bb account status                       Show the signed-in account
  bb account login                        Print a getbb.app link and code to approve
    --wait                                Wait for that sign-in to finish
    --code <code>                         Pair with a one-time dashboard code
    --base-url <url>                      https://getbb.app or https://vibecodethis.site
  bb account logout                       Revoke the credential and sign out

  `bb account login` returns after printing the link; approve it in any
  browser and bb finishes signing in on its own. Every command accepts
  `--json`. `bb account status` reports a paired bb whose account hasn't
  loaded yet as pending; it keeps retrying. `bb account logout` says so when
  getbb.app didn't confirm revoking the server. In a source checkout,
  `pnpm dev` points sign-in at that worktree's local Cloud origin through
  `BB_DEV_CONNECT_BASE_URL`; an explicit `--base-url` still wins, and a
  development build also accepts `http://bb.localhost:<port>` there.

Remote access (bb connect):

  Expose this bb server at <handle>.getbb.app so you can reach it from any
  browser. Remote access starts once this bb is signed in to its bb account
  (`bb account login`). A pairing command from the getbb.app dashboard still
  works like `bb account login --code`, and also turns remote access back on:

  bb connect --code <code> [--server https://<handle>.getbb.app]
    --code <code>          One-time pairing code from the dashboard
    --server <url>         Dashboard server URL; only its getbb.app or
                           vibecodethis.site apex is used

  The bb SERVER holds the tunnel itself — so it stays up as long as bb is
  running and reconnects on restart (no foreground process). It connects with
  the server credential bb account holds.
  Without an installed bb, pair via npm:
  `npx -p bb-app@latest bb connect --code <code>`.

  bb connect status                       Show the server's connect status
  bb connect off                          Turn remote access off, stay signed in
  bb connect on                           Turn remote access back on
  bb connect expose <port> [--host <name-or-id>]    Share a host's HTTP port
  bb connect unexpose <port> [--host <name-or-id>]  Stop sharing on that host
  bb connect unexpose-all [--host <id>] [--json]   Stop sharing all ports on one machine
  bb connect shares [--host <name-or-id>]           List that host's shares
  bb connect servers                      List every bb on this account (handle, url, live)
  bb connect machine-code                 Mint a one-time code that pairs the bb mobile app

  Port sharing works from threads on any enrolled host. In a thread,
  `bb connect expose <port>` resolves the thread environment's host; outside a
  thread it defaults to the server host. `--host <name-or-id>` overrides that
  choice for expose, unexpose, and shares. Server-host URLs use
  `https://<server-label>--<port>.getbb.app`; machine-host URLs use
  `https://<machine-label>--<port>.getbb.app` and proxy directly through that
  machine's daemon. Access is owner-session-gated — only viewers signed into
  the owner's getbb.app account can open the URL; it is not a public internet
  link. Agents should run expose from the thread that started the server, share
  the returned URL, and unexpose from the same thread when it stops.
  `bb connect status` shows all shares with host + URL. `shares --json` returns
  the resolved `host` and rows with `hostId`, `hostName`, `port`, and `url`.

  The bb mobile app pairs with a paired bb through bb connect.
  Settings → Mobile → Add mobile device shows a QR code plus the code as text.
  `bb connect machine-code` prints the same code, server URL, apex, and expiry
  (`--json` for `{code, serverUrl, apex, expiresAt}`). The phone scans or
  types the code and enrolls as a connect machine on the account with its own
  revocable credential (it appears in the getbb.app dashboard machine list).
  Codes last 10 minutes and work once; an account-machine-limit failure says
  so and points at the dashboard to revoke an unused device.

  Remote access is owned by the builtin "connect" plugin (Plugins → connect
  shows the URL, QR code, mobile pairing, and shared ports). `bb connect off`
  sets its `remoteAccess` setting and keeps the account signed in;
  `bb account logout` forgets the pairing. Disabling the plugin
  (`bb plugin disable connect`) cuts off all remote access; re-enable with
  `bb plugin enable connect`.

Core owns environment retirement and teardown. After the last live thread is archived or deleted, the provider policy sets the retirement deadline. `bb environment show <id>` reports lifecycle phase and teardown status, attempt and failure message. Failed teardown retries automatically; checkout environments do not retire.

`bb environment cleanup <id> [--json]` is an explicit override for removing an
unused provider-managed environment before its policy would do so. Normal
retirement and cleanup retries are automatic; this command is not a routine
end-of-task step. It overrides retention/keep policy and backoff, rejects live
threads and unmanaged environments, and succeeds if already removed. The request
is asynchronous; `bb environment show <id>` reports completion.

Explicit environment or project deletion bypasses the retirement grace, including the never-retire policy. Provider cleanup retains the host, path and resource until removal completes; inspect progress with `bb environment show <id>`.

`bb environment providers --json` includes each choice’s `description` and `icon`, as well as its label, inputs, and availability.

`bb environment providers --project <id>` omits providers whose declared requirements are unmet on every persistent machine, and reports each provider's `machineAvailability` per machine in `--json`. Add `--machine <id>` to scope structural eligibility to that machine and print its availability: `available`, `setup-required`, `unavailable` with the plugin's reason, or `unknown` while the background probe has not answered. Listing never waits on a machine; probes run in the background, are cached for ten minutes per project and machine, and are checked afresh for the selected provider and machine during thread creation.

BB source checkout startup

  In the BB repository, `pnpm start:worktree` prepares and serves production
  artifacts using stable checkout-specific dev data and ports (no Vite).
  Add `--dryrun` to `pnpm start` or `pnpm start:worktree` to prepare through
  Turbo, print resolved paths/ports, and exit. It does not launch services,
  migrate instance data or require ports to be free. It still writes artifacts
  and may repair native modules. Install dependencies beforehand when needed.
  Both normal and dry-run startup preserve their runtime policy and use the same
  dotenv settings. Preparation writes the
  checkout's build files; warm a separate staging checkout's cache if the live
  instance still serves those paths. Keep the serving checkout path stable to
  preserve its data and ports. See `docs/debugging-and-qa.md` for the restart
  sequence and source programmatic helpers. These are repository maintenance
  commands, not environment lifecycle hooks or installed `bb` commands.

## Native Windows environment hooks

<!-- bb-fork(windows): native Windows hosts are supported in this fork. -->

On a native Windows host the setup hook is `.bb-env-setup.ps1` and the
teardown hook is `.bb-env-teardown.ps1`. BB runs each with
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File <script>`. The
`.sh` hooks described above are ignored on native Windows, and the `.ps1`
hooks are ignored on macOS, Linux, and WSL2, so commit the hook that matches
the host platform. When only a `.sh` hook is present on a native Windows
host, provisioning records a `setup-script-ignored` progress note instead of
failing. Everything else — the tracked-file requirement, cwd, sanitized
environment, timeouts, failure semantics, and ownership gating — matches the
POSIX hooks.
