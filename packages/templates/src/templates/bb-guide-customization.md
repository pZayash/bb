---
kind: instruction
title: bb Guide — Customization
summary: Command reference for the bb app theme, server-backed settings, keyboard shortcuts, sidebar preferences, host files, and voice transcription.
intent: Explain the CLI theme surface, server-backed app settings, and the remaining app-wide customization commands.
editingNotes: Keep flags accurate against the CLI implementation. Theme details live in the bb-cli skill's references/theming.md. Bundled plugins document their settings in the plugins chapter and their skills, not here.
---

Customization commands

Bundled plugins such as Keep Awake, Concurrency limit, Thread list, and Push
notifications own their settings and commands; run `bb guide plugins`.

Theming — the app-wide palette and typography

`bb theme` controls a set of CSS-variable overrides for the app palette and
typography, persisted server-side and applied live to every open window.
Light/dark mode is a separate per-client setting the theme layers on top of.
Custom themes live on
disk, one folder per theme, at <bb-data-dir>/theme/<name>/theme.css (the packaged
app uses ~/.bb/theme/…). The folder name is the theme id.

bb theme list Built-in and custom themes; shows the active one
bb theme dir Print the custom-theme directory (where to author)
bb theme set <id> [--favicon-color <color>]
Activate a theme (built-ins: default, nord,
dracula, solarized, gruvbox, catppuccin),
preserving the favicon color unless the flag
supplies the complete selection
bb theme show [id] [--css] Print the active palette, or resolve <id> without
activating it; --css dumps the CSS
bb theme reset Back to the default theme; preserve favicon color
bb theme favicon set <color> Set favicon color; preserve the active theme
bb theme favicon reset Reset favicon color; preserve the active theme

To author a custom theme, run `bb theme dir`, write <that-dir>/<name>/theme.css,
then `bb theme set <name>`. A name has at most 64 characters, starts with a
letter or digit, then uses letters, digits, `.`, `_`, or `-`; avoid built-in
ids. Optional `pierre-dark.json` / `pierre-light.json`
(or a `theme.json` `codeTheme` field) ship the matching code colors. Built-in
palettes use the matching Shiki pair. The full design-token reference is in
the bb-cli skill (references/theming.md).

Theme CSS can override typography as well as colors. `--font-terminal` controls
the integrated terminal's font family independently of `--font-mono`; set it in
the theme's `:root, .light` block and end the stack with a generic fallback.

Favicon colors are `default`, `red`, `orange`, `yellow`, `green`, `teal`,
`blue`, `purple`, and `pink`. Theme and favicon-only commands carry the other
appearance value forward explicitly.

Hovering a palette in Settings → Appearance previews it live in that window
without saving; `bb theme show <id>` is the CLI counterpart.

Add --json to any theme command for machine-readable output.

Server-backed settings

Settings stored server-side apply to every window and survive restarts.

bb settings show
bb settings ai-services
bb settings ai-services set <thread-title|commit-message|voice> <automatic|off|service-id> [--plugin <plugin-id>]
bb settings ai-services test <thread-title|commit-message>
bb settings general <key> <value>
bb settings replay-onboarding
bb settings completed-turns [provider-id] [collapse|flat|default]
bb settings experiment <key> <value>
bb settings usage [--machine <id-or-name>] [--refresh]
bb settings cli-command [install|remove]
bb settings version [--force]
bb settings reload Reload bb-managed configuration

AI services: `bb settings ai-services` shows which AI service writes thread
titles (and so branch names), commit messages, and voice transcripts, plus
every service a plugin registers and whether it is ready. `set` picks
`automatic` (bb cloud first, then all other compatible services by plugin id
and service id in lexicographic order, including third-party plugins), `off`,
or one service id; a picked service is never swapped for another. A service is
identified by its plugin and its id, so two plugins may use the same id; pass
`--plugin <plugin-id>` when they do. `test` runs a sample title or commit
message through the current choice. Settings → AI services has the same
controls. Each plugin chooses its own model. The removed `BB_INFERENCE`,
`BB_INFERENCE_FALLBACK`, and `BB_TRANSCRIPTION` variables are ignored with a
warning in `~/.bb/config.json`, and `bb-app config set` refuses them.

General keys: `bb settings general` accepts any key from `generalSettings` in
`bb settings show`; an unknown key or wrongly shaped value is rejected with the
list of known keys. Boolean preferences take `true`, `false`, `on`, or `off`,
and `null` clears a preference that can be unset. Most appear in Settings →
General. Machine-related keys (`machineServerUrl`, `defaultMachineAccess`,
`machineGitCredentialsEnabled`) are covered in `bb guide machines`.

- `showDiagnosticEvents` (default false) shows provider environment resolution
  and unhandled provider events in the timeline. Warnings, errors, and model
  fallback stay visible either way.
- `steerActiveThreadOnEnter` (default true for a new install; an earlier
  install with saved settings or work keeps false): when on, Enter steers a
  running thread and Command+Enter queues a follow-up; when off, those are
  reversed. Shift+Enter inserts a newline.
- Git changes above the composer, the Commit button (off by default) and the
  pull request above the composer are plugin settings:
  `bb plugin config bb--git set showGitChanges false`,
  `bb plugin config bb--git set showCommitButton true` and
  `bb plugin config bb--github-pr-status set showPullRequest false`.
- `keepHistoryAfterContextClear` (default false; Settings → General → Show
  messages from before a context clear): true keeps a cleared thread's earlier
  messages above the `Context cleared` boundary in the timeline, outline, and
  message lookups. The next prompt still starts a fresh provider conversation,
  and the context meter still resets.
- `summarizeShellCommands` (default true; Settings → General → Summarize shell
  commands): false stops titling shell commands that read, list, or search files
  with a summary such as `Searched for X`. Each command row then shows its
  command and expands to the command and its output.
- `confirmThreadArchive` (default true): set false to archive parent and child
  threads in the app without the confirmation popup; the toast still offers
  Undo. CLI and SDK archive calls are always non-interactive.
- `terminalCopyOnSelect` (default true; Settings → General → Terminals → Copy
  on select) copies completed terminal selections exactly and shows "Selection
  copied". Text elsewhere in the app is unchanged. Set it with
  `bb settings general terminalCopyOnSelect <true|false|on|off>` or SDK
  `system.updateGeneralSettings`. Explicit Copy/Paste work when off. Supported
  Linux browsers use native primary selection for middle-click paste,
  independently of this preference, never the regular clipboard as a fallback.
- `streamerMode` (default false) hides every `customModels` entry from
  `~/.bb/config.json` in all model lists (pickers, `bb provider models`, and
  the SDK) during a screen share. The entries stay in the config file; a
  request that names a hidden model still runs with it, and default model
  resolution still sees the full list.
- `allowFastServiceTier` (default true; Settings → Providers): false hides the
  service tier control and runs new turns at the default service tier,
  including explicit requests for any other tier (fast, Codex ultrafast), saved
  project defaults, automations, and messages queued before the change. Project
  defaults saved while it was off retain the default tier.
- `managedBranchPrefix` (default `bb/`, at most 64 characters) prefixes every
  branch bb creates for a worktree or a new checkout branch: the default gives
  `bb/fix-login-flow-thr_ab12cd34ef`, `sawyer/wt-` gives
  `sawyer/wt-fix-login-flow-thr_ab12cd34ef`, and an empty value gives no
  prefix. bb rejects a prefix that cannot start a valid git branch name.
  Existing branches keep their names.
- `providerOrder` (default `[]`) is a JSON array of provider ids, and
  `defaultProviderId` (default `null`) names the default provider; `null`
  clears it.
- `idleProviderSessionTimeoutMinutes` (default `30`; Settings → Providers → Configuration → Release idle agent sessions) sets how long an agent can sit idle after its last turn before every machine stops its provider process. Allowed values are `0` (ASAP), `5`, `10`, `30`, and `60`, for example `bb settings general idleProviderSessionTimeoutMinutes 5`. Machines check every five minutes, so release can take up to five minutes beyond the timeout. Changes apply live and on reconnect. Only restorable sessions without active or pending work are eligible; threads keep their history and resume on the next message. `bb thread stop` still releases a runtime manually. This is not a limit on loaded processes or memory. Read the value with `bb settings show`; SDK callers use `system.config()` and `system.updateGeneralSettings({ ...config.generalSettings, idleProviderSessionTimeoutMinutes: 5 })`.
- `telemetryEnabled`: see Telemetry below.

`bb settings replay-onboarding` clears `onboardingCompletedAt`, so the
first-run setup guide (connect an agent, add projects, pick plugins, set up
devices) shows again in every open client. Settings → General → Setup guide has
the same button.

`bb settings usage --refresh` fetches fresh provider usage; ordinary reads may
reuse results for 10 seconds. The SDK equivalent is
`bb.sdk.system.usageLimits({ refresh: true })`.

Command line: Settings → General → Command line puts the `bb` command on PATH
on the computer that runs the bb server, so the user, a script, or an agent
running outside bb (such as Claude Code or Codex) can control bb; threads in bb
already have `bb`. `bb settings cli-command` shows the state, and `install` or
`remove` changes it. Install links the launcher at `~/.bb/bin/bb` into a PATH
folder such as `~/.local/bin` (on Windows it adds `~/.bb/bin` to the user
PATH). bb never replaces another `bb`: install is refused while one runs first
in a new terminal. Only an installed bb (`npx bb-app` or the desktop app)
offers this; a source checkout does not.

Completed turns: `bb settings completed-turns` lists how each provider shows a
finished turn: `collapse` folds the turn's work into one "Worked for" row and
keeps the final answer visible, and `flat` keeps every step visible. Each
provider has a default (Claude Code is `flat`, the other first-party providers
`collapse`); `--json` shows whether each value comes from your setting or that
default. `bb settings completed-turns <provider-id> <collapse|flat>` overrides
it for that provider, and `default` removes the override. It applies to
existing threads too, including `bb thread log`. Settings → Providers has the
same per-provider switch.

Experiments: `bb settings experiment <key> <true|false>` toggles a default-off
experiment (Settings → Experiments). `applicationLinks` enables explicit
Markdown links to apps such as Linear and Reflect, with confirmation on the
viewing device unless that scheme was previously allowed. It defaults on for early adopters.
Choose Always allow to save an approval on that device. Settings → General →
Application link approvals can revoke one or all approvals. All clients store
approvals locally for the current BB site and device profile. They do not sync
across devices or server addresses. The Plugin SDK can list and revoke the
viewing client's approvals; there is no CLI command that reads or modifies a
remote client's localStorage.
Experiments that
gate a feature are documented with it: `serverMove` in `bb guide machines`,
`performanceDiagnostics` under Server performance diagnostics below.
`timelinePush` sends an open thread's timeline updates over the live
connection as row deltas instead of reloading the latest window after each
update. `compactExpiredCache` offers a Compact chip in the composer when an idle
thread's prompt cache has expired and its context holds at least 100k tokens;
see `bb guide thread-messaging` for `--compact-first`.
`sidebarMultiSelect` lets the built-in thread list sidebar select several threads with
Cmd/Ctrl+Shift-click and Shift-click for bulk actions and drag; Cmd/Ctrl-click
still opens a thread in a split.
`pluginUpdates` lists plugin updates on Settings → Updates with Update and
Update all, and counts them in the sidebar updates badge; see `bb guide plugins`.
`skipFocusedThreadNotifications` skips the web and desktop system notification
for a thread open in a visible, focused bb window or tab. It defaults on for
early adopters.
`threadContextCard` moves a running thread's changes, pull request, and parent
and child threads into a card at the upper-right of its pane, opened or pinned from
the header. It defaults on for early adopters.
`threadRowMetadata` adds Organize → Rows → Metadata to the built-in thread list,
a line under each thread title where plugins show details such as the pull
request number.
`unreadDividerAtAnswer` places the NEW divider of an unread thread before the
final assistant message of a turn that finished while you were away, instead of
before its first tool call. It defaults on for early adopters.
`websocketCompression` compresses large realtime messages (such as timeline
pushes) on the app's live connection; it applies when the app reconnects.
`bb settings general earlyAdopter on` (Settings → Experiments → Become an early
adopter) turns on the experiments marked Early adopter, currently
`applicationLinks`, `timelinePush`, `compactExpiredCache`, `pluginUpdates`,
`sidebarMultiSelect`, `skipFocusedThreadNotifications`, `threadContextCard`,
`unreadDividerAtAnswer`, and `websocketCompression`; an experiment you set
yourself keeps your value.

Launcher settings

`bb-app config` and `bb-app env` reload runtime settings in a running server,
but the CLI identifies settings that are startup-only, including binding/ports,
data and the dev-app port, telemetry, inherited skill roots, and
`BB_LOG_LEVEL`. Use `bb-app config`, not `bb-app env`, to change `BB_APP_URL`
live. After a startup-only change, run `bb-app stop && bb-app start` or restart
the desktop app; until then, changing or unsetting `BB_SERVER_BIND_HOST` does
not close a previous `0.0.0.0` listener.

`--server-bind-host 0.0.0.0` (or `BB_SERVER_BIND_HOST=0.0.0.0`) listens on
every interface for direct remote access; containers must also publish the
port. BB accepts request hosts that are `localhost`, IP addresses (including
LAN and Tailscale IPs), or the hostname in `BB_APP_URL`. For a custom DNS name
or reverse proxy, run `npx bb-app config set BB_APP_URL https://bb.example.com`
before connecting, including from the CLI or SDK; forwarded host headers cannot
authorize an unconfigured name. BB Connect needs no additional configuration.

Keyboard shortcuts

Settings → Keyboard records per-command shortcut overrides, persisted
server-side and applied live to every connected window, including desktop menu
accelerators. Reset removes an override and returns to bb's current default;
`disabled` explicitly unbinds a command. `Mod` means Command on macOS and
Control on Windows/Linux. The complete default table is in docs/configuration.md.

bb settings keyboard list
bb settings keyboard hints <true|false>
bb settings keyboard set <command> <shortcut|disabled> [--platform mac|windows|linux]
bb settings keyboard reset [command] [--platform mac|windows|linux]

`keyboard list` prints core command ids with their effective bindings, plus
every saved override; examples include `panel.previousTab` / `panel.nextTab`,
`pane.focus.left|right|up|down`, `pane.maximize.toggle`, and the initially
unbound `panel.fullScreen.toggle`. `terminal.find` applies while a terminal has
focus: `Cmd+F` on macOS and `Ctrl+Shift+F` elsewhere, so Ctrl+letter keys keep
reaching the shell. `hints` (default true) shows or hides the delayed shortcut
badges shown while holding the modifier key; shortcuts work either way.

`history.back` / `history.forward` (`Mod+[` / `Mod+]`) follow the pages opened
in the current window, like the sidebar arrows. `thread.previous` /
`thread.next` follow sidebar order instead: `Mod+Shift+[` / `Mod+Shift+]`
on desktop and `Control+Shift+[` / `Control+Shift+]` on the web.

`thread.rename`, `thread.archive`, `thread.markRead`, and `thread.pin` start
unbound and act on the focused pane's open thread; Mark read and Pin toggle
like the matching thread menu item.

An open question card binds `question.select.1`–`9` (`1`–`9`),
`question.submit` (`Mod+Enter`: Next, or Submit on the last question),
`question.previous` / `question.next` (`ArrowLeft` / `ArrowRight` with focus
in the card), and `question.cancel` (`Mod+.`). They skip text fields outside
the card. In the card's answer field, `Enter` goes to the next question or
submits and `Shift+Enter` adds a line.

An override can be scoped with `--platform`; without it, it applies on all
platforms. A platform-specific override takes precedence over a general one,
including when disabled. Scoped `set` and `reset` keep other platforms'
overrides; unscoped `set` updates the general override, and unscoped `reset`
clears every scope for the command (or every command if omitted). The SDK uses
`system.updateKeyboardSettings` to write and `system.config` to read bindings.

Plugin commands use `plugin:<plugin-id>/<command-id>` as their binding ID, for
example `bb settings keyboard set plugin:example/open-issue Mod+Shift+I`;
`reset` restores the plugin's default. Overrides survive plugin disable,
re-enable, and reload. Commands without defaults start unbound, and
conflicting plugin defaults stay unbound. Plugin defaults resolve in each app
window, not in `keyboard list`, so CLI/SDK callers should clear conflicting
explicit bindings in the same update.

Sidebar preferences

`bb settings ui` reads and writes server-side sidebar preferences shared by
every window, device, and the CLI. The same registry stores which thread Info
panel sections are collapsed (`infoPanel.collapsedSections`) and whether a
thread pane's thread context card stays pinned open (`threadContextCard.pinned`).

bb settings ui list [--json]
bb settings ui get <key> [--json]
bb settings ui set <key> <value> [--json]
bb settings ui reset <key> [--json]

`list` prints every key with its value, revision, and a short description.
`set` takes plain strings for enum and provider keys and JSON for lists and
`null`; it retries once if another writer changed the key. `reset` writes the
default. The SDK offers `sdk.system.uiPreferences.list()`, `.set()`, and
`.reset()`.

The thread list is drawn by `sidebar.threadListProvider`, which defaults to
`__automatic__`: the first installed thread list plugin other than the bundled
Thread list plugin (`thread-list/thread-list`), or the bundled plugin when
there is none, so installing a thread list plugin switches to it. Select one
with `bb settings ui set sidebar.threadListProvider <plugin-id>/<slot-id>`, or
reset to restore Automatic. The bundled Thread list plugin keeps its own
layout (organization mode, sort, grouping, hidden and collapsed groups) and
copies the legacy `sidebar.*` layout keys from here only once; change its
layout with `bb thread-list prefs` (see `bb guide plugins`).

The composer's input box is drawn by `composer.provider`, which defaults to
`__automatic__`: the first composer plugin you installed, or the bundled
Composer plugin (`bb--composer/composer`) when there is none. Pick one with
`bb settings ui set composer.provider <plugin-id>/<slot-id>`, or reset to
restore Automatic. With no composer plugin enabled, no composer is shown.

A vertical rail of destinations sits on the left edge of the sidebar on every
screen size. Home is at the top and returns to the last thread; the visible
destinations (Plugins, Skills, and plugin panels) follow; More holds hidden
destinations and Customize navigation; Settings is at the bottom. New thread sits in
the sidebar header and cannot be hidden from the rail. The list beside the rail swaps between
the thread list, Plugins, Skills, and Settings, and collapsing the sidebar
hides that list and leaves the rail. Rail order and visibility are
`sidebar.pluginPanelOrder` and `sidebar.visiblePluginPanels`. In the macOS
desktop app, wide windows add a title bar holding the window controls, Back
and Forward, and the sidebar toggle; the sidebar and page sit in a card below
it. On narrow windows and phones the rail sits inside the drawer: Home,
Plugins, Skills, and Settings swap the list beside it and leave the drawer
open, and a plugin page closes it.

The rail and the top list below are the two layouts of the bundled Navigation
plugin, a built-in you can fork like the thread list.
`sidebar.navigationProvider` picks what draws the navigation:
`navigation/rail` (the rail above), `navigation/top-list` (labeled rows above
the thread list), another navigation plugin as `<plugin-id>/<slot-id>`, or
`__automatic__` (the default: the first navigation from another plugin, else
`navigation/rail`). Pick one in Settings → Appearance → Navigation, or:

bb settings ui set sidebar.navigationProvider navigation/top-list
bb settings ui reset sidebar.navigationProvider

The top list puts the visible destinations, New thread among them, and More
above the thread list, moves Settings into the footer, and adds a Back to app
row to the Settings, Plugins, and Skills lists. New thread can be reordered
and hidden like any other row there. Collapsing hides the whole sidebar, and
the macOS desktop app drops the separate title bar. A navigation plugin
declares whether it draws a rail or a list, and gets the matching layout; a
list navigation can also bring its own controls beside the sidebar toggle.
The same order and visibility keys apply to every provider.

Footer actions: `sidebar.footerOrder` and `sidebar.hiddenFooterItems` are
string lists of `builtin:settings` (top list only), `builtin:mobile`,
`builtin:report-bug`, or
`plugin:<encoded pluginId>/<encoded registrationId>`. They survive plugin
reloads and temporarily unavailable plugins; new items are visible by default.

bb settings ui set sidebar.hiddenFooterItems '["plugin:bb--provider-usage/usage"]'
bb settings ui reset sidebar.hiddenFooterItems

In the app, the sidebar footer's More menu holds hidden actions and actions
that don't fit; Settings → Appearance → Sidebar footer, or right-clicking an
action, edits the footer.

The command palette's thread search has its own Active/Archived filter, which
is browser-local: it is not a server setting or a CLI/SDK option. The sidebar
thread list's Active/Archived filter is the Thread list plugin's
`threadLifecycles` preference.

Sidebar width and open state are per window and stay local to the browser.

Host files and voice transcription

bb file read|write|list|paths|mkdir|move|remove ...
bb voice transcribe <audio-file> [--type <mime>] [--prompt <context>]
--type defaults to audio/webm

`bb file` supports `--host` for remote machines and `--root` on mutating
commands to confine access beneath an absolute directory. `bb file write`
takes exactly one of `--content` or `--stdin`; `bb file paths` lists files and
directories unless `--files` or `--directories` narrows it. `bb file list` and
`bb file paths` include dot-prefixed entries; pass `--no-hidden` to skip them.
Both skip a default set of dependency and cache directories such as
`node_modules`, `.venv`, `.pnpm-store`, and root-relative `.claude/worktrees`;
`--exclude <names...>` replaces that set. Entries match basenames at any depth
or exact root-relative paths using `/` separators. Use
`--json` for metadata and machine-readable results.

`bb file remove --recursive` and `sdk.files.remove({ recursive: true, ... })`
stop processes whose working directories are inside the directory before
deleting it, including processes in nested checkouts. This uses the same
SIGTERM grace period and SIGKILL fallback as worktree removal on macOS and
Linux; Windows does not enumerate process working directories.

Server-backed sidebar preferences

Sidebar layout lives on the server in a keyed, revisioned registry so every
window, device, and the CLI share it: organization mode, chronological sort,
section orders, collapsed rows and sections, navigation entry order and
visibility, hidden thread-list groups, and the navigation and thread-list
provider pickers. The same registry stores which thread Info panel sections
are collapsed (`infoPanel.collapsedSections`). The sidebar waits for them alongside the project list, and
an upgrade uploads the old browser-stored layout once.

  bb settings ui list [--json]
  bb settings ui get <key> [--json]
  bb settings ui set <key> <value> [--json]
  bb settings ui reset <key> [--json]

The sidebar thread list defaults to `__automatic__`: the first installed thread list
plugin other than the bundled Thread list plugin (`thread-list/thread-list`), or the
bundled plugin when there is none. Installing a thread list plugin therefore switches
to it. Legacy `__builtin__` selections resolve to the bundled plugin; other plugin
selections are preserved.
Use `bb settings ui reset sidebar.threadListProvider` to restore Automatic, or
`bb settings ui set sidebar.threadListProvider <plugin-id>/<slot-id>` to select
another plugin. The SDK exposes the same setting through `uiPreferences`.

`bb settings ui list` prints every key with its value, revision, and a short
description. `set` takes plain strings for enum and provider keys and JSON for
lists and `null`; it reads the current revision, writes with it, and retries
once on a conflict. `reset` writes the default. The SDK offers
`sdk.system.uiPreferences.list()`, `.set()`, and `.reset()`.

New installations default to Custom (`chronological`) for `sidebar.organizationMode`.
Migrated installations with existing projects, threads, or UI preferences fall back
to By project (`project`). Explicit server choices take precedence over legacy
browser choices, which take precedence over this installation fallback. Reset
saves the installation fallback as an explicit choice.

The built-in sidebar's Filter selects Active and Archived, defaulting to Active.
The selection is browser-local, not a server-backed preference or SDK/CLI setting.
Active includes threads with saved messages; there is no separate
Drafts section or filter. Archived threads use their preserved placement and a
restore action. Archived pages load only while selected.
Plugin sidebar replacements own their filters.

The palette's Filter uses Active and Archived independently of the
sidebar, defaulting to Active. Its selection is browser-local, not configurable
through SDK/CLI. Active includes threads with saved messages; Search threads retains
the existing title and conversation search behavior. Archived fetches bounded recent rows only when
selected.

Every thread-list header's actions menu offers New project, New section,
Organize, Sort by, and Filter. Organize selects By project,
By machine, or Custom and retains Groups → By environment.
The separate `sidebar.threadGrouping.environment` preference
decides whether sibling threads sharing one worktree collapse into a single row.
It defaults to `auto`, which groups them
everywhere except Custom: `bb settings ui set sidebar.threadGrouping.environment
false` keeps every thread on its own row, and `true` groups them in every mode.
Sort by selects a field, and selecting it again reverses its arrow/direction.
`sidebar.sortDirection` accepts `ascending`, `descending`, or `default`.
The default preserves each field's original order (newest first for dates,
A–Z for titles). For example: `bb settings ui set sidebar.sortDirection ascending`.

Thread-list visibility

Threads, a project, custom section, or machine's menu offers Hide from list;
its menu inside More offers Add to list. Customize list manages visibility and
order for the current organization. Hiding preserves the group's threads, order,
and collapse state. Pinned threads remain in Pinned; More carries hidden activity.

The Thread list plugin's `hiddenGroups` preference defaults to `[]`. Its keys
are `threads`, `project:<projectId>`, `section:<sectionId>`, and
`machine:<hostId>` (`machine:no-machine` for the unassigned group). Each
organization uses its own keys, while `threads` applies to every organization.
Pinned cannot be hidden. Duplicate keys are deduplicated, and unavailable IDs
remain saved without producing rows. New groups default visible.

  bb thread-list prefs get hiddenGroups
  bb thread-list prefs set hiddenGroups '["threads","project:proj_example","section:sec_example"]'
  bb thread-list prefs reset hiddenGroups

`set` replaces the entire list across organizations; include existing keys you
want to keep hidden. `reset` shows all groups. The plugin's `setPreference` and
`resetPreference` RPCs expose the same operations to its app client.

Sidebar footer actions

Settings → Appearance → Sidebar footer supports drag ordering and visibility.
Right-click an action and choose Hide to move it into the More menu. Hidden
shortcuts remain actionable; hiding an open disclosure closes it. The More menu
appears only when hidden actions are available and links back to customization.
`sidebar.footerOrder` and `sidebar.hiddenFooterItems` are string lists. Keys are
`builtin:mobile`, `builtin:report-bug`, or `plugin:<encoded pluginId>/<encoded registrationId>`.
Preferences survive plugin reloads and temporarily unavailable plugins; new items
are visible by default. Example:

  bb settings ui set sidebar.hiddenFooterItems '["plugin:bb--provider-usage/usage"]'
  bb settings ui reset sidebar.hiddenFooterItems

Client-local UI preferences

Open microphone preferences by right-clicking the composer microphone, pressing
Shift+F10 while it is focused, or clicking the Microphone control in Settings →
Voice Input. A warning opens preferences when the microphone is clicked. Desktop uses an anchored popover; mobile uses a drawer. Opening
preferences starts a local microphone preview with the recording waveform and
a list of inputs. Closing preferences releases the preview. The recording controls
contain only cancel, stop, and send; microphone preferences are available while idle.

Recording tries the preferred device, then the system default, then other
available inputs for missing or unreadable devices. Permission denials do not
trigger fallback. A disconnect during recording switches the input into the
same recorder, preserving audio captured before the disconnect. Reconnecting
the preferred microphone makes it available for the next recording; it does not
interrupt the current fallback recording.

A missing preferred microphone alone does not block recording or show a warning.
Capture failures, interrupted input, or no available inputs after access was
granted show a decorative warning badge on the idle microphone. During capture,
five seconds of near-silent audio produces a warning in the open preview or an
accessible status in the recording row; the recording row has no microphone menu. Silence warnings clear when audio returns and never
stop recording or switch microphones automatically. While idle, a warning opens
preferences on click. Audio preview runs only while microphone preferences are
open; it is not saved or transcribed.

Some Settings values live only in the current browser/client. Sidebar width
and open state stay local because they depend on the window size, and each tab
or desktop window keeps its own: collapsing or resizing the sidebar in one tab
leaves the others alone, and a newly opened tab starts from the most recent
choice made anywhere in that browser. The Voice Input
microphone picker stores the selected browser MediaDevices device id in
localStorage as `bb.voiceInput.audioInputDeviceId`; it does not have a `bb`
command and does not change the server-side transcription model. When the preferred
microphone is disconnected, recording tries the system default and then other available inputs. The saved preference is used again when it
reconnects. Select System default to follow system microphone changes.

Anonymous usage telemetry can be disabled in Settings → General → Privacy & diagnostics → Share anonymous usage data,
or with `bb settings general telemetryEnabled false`. The saved server-wide preference
takes effect immediately and persists across restarts. SDK callers can use
`system.updateGeneralSettings` with `telemetryEnabled`. `BB_TELEMETRY=false`
always disables telemetry, even when the saved preference is enabled.


Mobile app downloads are always available in Settings → Mobile (`/settings/mobile`).
**Join iOS TestFlight** opens https://testflight.apple.com/join/T9MayTMb.
**Download Android APK** downloads directly from the public `get-bb/bb` GitHub
`android-testing` release's `bb-android.apk` asset. The APK does not pass through
the bb server or bb connect. No experiment or Android developer tools are needed.
Pair either app through Settings → Mobile → **Add mobile device**.

Use `bb settings mobile-app --json` or SDK `system.mobileAppDownloads()` to get
both public links. Add `--details --json` or call `system.mobileAppReleases()`
(GET `/api/v1/system/mobile-app-releases`) for Android version/build, size, and
upload date. The server fetches only public metadata, caches it for five minutes,
and returns `android: null` if unavailable or inconsistent. Download links remain
usable during metadata failures. iOS version and release date are shown in TestFlight.
Inside the Android app, this page compares the installed native build number
with the published APK and shows whether an update is available. Older apps
without build-number reporting cannot determine update status. Installed version
and build are device-local; CLI and SDK release metadata report the published APK.
Publish updates with **Mobile Android (EAS)**, profile `preview`, **publish** on.

Storage & retention is a default-disabled bundled plugin. Enable it
with `bb plugin enable bb--storage-retention`.
Its sidebar panel and `bb storage` commands own retention policies and machine
cleanup. All retention settings in the panel save immediately. Enable **Delete thread storage on archive** with
`bb storage retention --delete-storage-on-archive true --save --yes` (default:
false). Future archives clear storage once stopped and online, keeping history
and uploaded attachments and skipping pinned threads. Pending cleanup survives
reloads and retries every minute; unarchiving cancels it.
Separately, `bb storage retention --delete-dev-data-on-checkout-removal true --save --yes`
(default: false) scans online persistent machines hourly and removes `~/.bb-dev`
folders with missing checkouts after successful scans, including manual scans
and existing data. It rechecks absence, stops servers in removed checkouts,
keeps unidentified sources, and retries failures on later scans.
Use `bb storage clear-archived-files --machine HOST_ID --yes` to clear
all stored files from archived, stopped, unpinned threads on that machine.
`bb storage usage --machine HOST_ID` also reports worktree counts by project
and, after a scan, a separate `~/.bb-dev` breakdown when that folder exists,
including recovered source paths, checkout existence, and links to known threads.
`bb storage remove-dev-instances --machine HOST_ID --yes` removes development
instances whose checkout no longer exists, stopping servers still running from it;
add `--instance NAME` to remove one entry of any kind, stopping its dev server
first if it is running.
See the plugin’s storage-retention skill for commands and limitations.

### Opt-in server performance diagnostics

Start with `pnpm start --perf-diagnostics`, `pnpm start:worktree --perf-diagnostics`,
or `bb-app --perf-diagnostics` to permit detailed performance logs and rolling
CPU profiles when the experiment is on. `BB_PERF_DIAGNOSTICS=1` is the equivalent startup environment
setting (off by default; restart required). Server logs include five-second
CPU/GC/loop/memory summaries and lower slow-operation thresholds. Profiles
are saved every 30 seconds under `$BB_DATA_DIR/logs/performance/`, in ten
rotating slots of at most 12 MiB each. Copy a relevant `.cpuprofile` promptly
and open it in Chrome DevTools' JavaScript profiler. This adds overhead;
remove the setting and restart to disable. No inspector network port is
opened. Profile files contain local paths/function names; inspect before sharing.

Diagnostics require **both** startup permission (`--perf-diagnostics` or
`BB_PERF_DIAGNOSTICS=1`) and the **Server performance diagnostics** toggle in
Settings → Experiments. The toggle is only shown when startup permission is present; a saved experiment value does not make it visible. The experiment defaults to off. Use
`bb settings experiment performanceDiagnostics true` to enable it, or `false`
to stop it; SDK clients use the existing experiments update endpoint. The
experiment takes effect live on that server. Without startup permission it
cannot start collection. Turning it off restores normal logging thresholds,
stops the sampler and flushes the in-flight profile; existing files remain.
The launch flag only grants permission and still requires a restart to change.

Storage cleanup can run in the background with `bb storage cleanup --machine HOST_ID --kind orphans|development|worktrees --yes`. Inspect `maintenance` with `bb storage usage`; failures release the machine lock and can be retried. Archived storage cleanup waits through the archive undo grace and rechecks eligibility before each batch.

