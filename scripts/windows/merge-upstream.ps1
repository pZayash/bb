# Merge upstream/main into this fork with the known seams auto-resolved.
#
# Usage: pwsh -NoProfile -File scripts/windows/merge-upstream.ps1 [-Upstream <remote>] [-Branch <branch>]
#
# See "Fork merge conventions" in AGENTS.md for the rules this script implements.
# Merge metrics (conflict paths and how each was settled) are appended to
# .bb/merge-log/<utc-date>.jsonl; that log is the source for merge-cost metrics.
# Status values: "merged" (git committed the merge), "up-to-date" (nothing new
# to merge; HEAD unchanged), "resolved-pending-commit" (conflicts resolved and
# staged; the operator still must git commit), "unresolved-conflicts" (exited 1
# with paths left), and "failed" (hard error).
# bb-fork(windows): conflicts/conflictCount list the raw merge conflicts only.
# Resolver output is recorded separately: generated/generatedCount is the set
# of packages/db/drizzle paths the drizzle generator rewrote (the worktree
# delta after the merge-source reset was staged — the new .sql, its
# meta/<idx>_snapshot.json, and the appended _journal.json entry), and
# warnings lists non-fatal hazards such as upstream migrations whose 'when'
# predates the fork migration's watermark.
# Resolution values: "auto-upstream" (taken verbatim from the merge source),
# "auto-ours" (rewritten from ours, e.g. the protocol version),
# "auto-regenerated" (drizzle conflict settled by resetting the tree to the
# merge source and rerunning `pnpm --filter @bb/db db:generate`),
# "auto-merged" (turbo.json and docs/api_to_audit.md regenerated from the
# merge source plus fork-owned inputs), "resolved-externally", and
# "unresolved".
# Each record describes one run, not one merge: on a resumed run conflictCount
# covers only the conflicts remaining at resume time, files the operator
# resolved between runs appear only in the earlier record, and durationMs is
# per run. Join the records of one merge on mergeHead (or upstreamSha) plus
# headBefore.
# With rerere.enabled (mandated by AGENTS.md), replayed resolutions may appear
# unresolved until git add unless rerere.autoupdate is set, so rerere can shift
# what the log counts.

param(
  [string]$Upstream = "upstream",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

# bb-fork(windows): git emits UTF-8; decode it verbatim so non-ASCII repo and
# conflict paths survive capture on OEM-codepage consoles.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# bb-fork(windows): anchor every repo-relative path to the toplevel so the
# script works when invoked from a subdirectory.
$repoRoot = "$(& git rev-parse --show-toplevel)".Trim()
if ($LASTEXITCODE -ne 0) {
  throw "git rev-parse --show-toplevel failed with exit code $LASTEXITCODE; run inside the repository"
}
Set-Location -LiteralPath $repoRoot

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Get-MergeSource {
  # bb-fork(windows): on a resumed run the upstream ref may have moved past
  # the commit actually being merged, so every resolver splices MERGE_HEAD;
  # on a fresh merge the upstream ref already is the merge head.
  if ($resumed) { return "MERGE_HEAD" }
  return "${Upstream}/${Branch}"
}

function Remove-ConflictMarkers {
  # Git leaves the fork's own marker comment in the "ours" block, so keep that
  # side of each conflict; leaving the markers behind would stage broken files.
  param([string]$Text)
  $pattern = [regex]"(?s)<<<<<<< HEAD\r?\n(.*?)(\r?\n)=======\r?\n.*?>>>>>>> [^\r\n]*\r?\n?"
  $keepOurs = [System.Text.RegularExpressions.MatchEvaluator] { param($match) $match.Groups[1].Value + $match.Groups[2].Value }
  return $pattern.Replace($Text, $keepOurs)
}

function Set-ForkProtocolVersion {
  # The fork's protocol version is upstream's version + 2 while the fork
  # carries its wire additions: the host.list_terminal_shells and
  # workspace.commits RPCs and the terminal.open payload field "shellId".
  $protocolPath = $ProtocolPaths[0]
  # bb-fork(windows): a resumed run fetches again, so upstream may have advanced
  # past the commit actually being merged; read the base version from
  # MERGE_HEAD, not the moved ref.
  $protocolSource = Get-MergeSource
  $upstreamSource = & git show "${protocolSource}:$protocolPath"
  if ($LASTEXITCODE -ne 0) {
    throw "could not read $protocolPath from $protocolSource"
  }
  $match = [regex]::Match($upstreamSource, "HOST_DAEMON_PROTOCOL_VERSION = (\d+)")
  if (-not $match.Success) {
    throw "could not find HOST_DAEMON_PROTOCOL_VERSION in ${protocolSource}:$protocolPath"
  }
  $resolved = [int]$match.Groups[1].Value + 2
  Write-Host "Resolving protocol version to $resolved (upstream $($match.Groups[1].Value) + 2)"

  foreach ($path in $ProtocolPaths) {
    if (-not (Test-Path $path)) { continue }
    $contents = Get-Content -Raw -LiteralPath $path
    $updated = Remove-ConflictMarkers -Text $contents
    $updated = [regex]::Replace($updated, "HOST_DAEMON_PROTOCOL_VERSION = \d+", "HOST_DAEMON_PROTOCOL_VERSION = $resolved")
    $updated = [regex]::Replace($updated, "HOST_DAEMON_PROTOCOL_VERSION\)\.toBe\(\d+\)", "HOST_DAEMON_PROTOCOL_VERSION).toBe($resolved)")
    if ($updated -ne $contents) {
      Set-Content -NoNewline -LiteralPath $path -Value $updated
      Invoke-Git add -- $path
    }
  }
}

function Invoke-PnpmInstall {
  # bb-fork(windows): the fork's .npmrc caps pnpm's virtual-store directory
  # names, and pnpm refuses to reuse a modules dir linked with a different
  # value until that dir is rebuilt.
  param([string]$Label = "pnpm install")
  & pnpm install 2>&1 | Tee-Object -Variable installOutput | Out-Host
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0 -and (($installOutput | Out-String) -match "VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF")) {
    Write-Host "Modules dir uses a different virtual-store-dir-max-length; relinking with pnpm install --force"
    & pnpm install --force 2>&1 | Out-Host
    $exitCode = $LASTEXITCODE
  }
  if ($exitCode -ne 0) { throw "$Label failed" }
}

function Resolve-Lockfile {
  $path = $LockfilePath
  if (-not (Test-Path $path)) { return }
  # bb-fork(windows): core.quotepath=false keeps non-ASCII paths raw UTF-8 so
  # category globs and the merge log see the real path.
  if ((& git -c core.quotepath=false diff --name-only --diff-filter=U -- $path)) {
    Write-Host "Resolving $path from the merge source and regenerating with pnpm install"
    Invoke-Git checkout (Get-MergeSource) -- $path
    Invoke-Git add -- $path
    Invoke-PnpmInstall
    Invoke-Git add -- $path
  }
}

function Resolve-PristineUpstreamFiles {
  # These files are kept identical to upstream; fork deltas live in fork-owned
  # files (plugins/bb-fork.json, builtin-registry.fork.ts, ...).
  foreach ($path in $PristineUpstreamPaths) {
    if ((& git -c core.quotepath=false diff --name-only --diff-filter=U -- $path)) {
      Write-Host "Keeping $path identical to upstream"
      Invoke-Git checkout (Get-MergeSource) -- $path
      Invoke-Git add -- $path
    }
  }
}

function Resolve-TurboJson {
  # bb-fork(windows): turbo.json is regenerated from the merge source plus the
  # fork-owned fragment (scripts/windows/turbo.fork.json), so fork task and
  # input additions never conflict with upstream. The merge fails loudly when
  # the fragment anchors disappear upstream rather than silently dropping them.
  $source = Get-MergeSource
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("bb-turbo-" + [guid]::NewGuid().ToString("N") + ".json")
  try {
    $lines = @(& git show "${source}:turbo.json" 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "could not read turbo.json from $source" }
    [IO.File]::WriteAllText($tmp, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
    & node "scripts/windows/turbo-merge.mjs" $tmp "turbo.json"
    if ($LASTEXITCODE -ne 0) { throw "turbo-merge.mjs failed with exit code $LASTEXITCODE" }
  } finally {
    Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path -LiteralPath "node_modules")) {
    Write-Warning "node_modules is missing; skipping turbo.json validation (run pnpm install, then pnpm run check:generated)"
  } else {
    & pnpm exec turbo run build --dry=json --filter=@bb/bundled-plugins 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "turbo.json failed validation after the fork merge" }
    & pnpm exec turbo run test:windows:lifecycle --dry=json --filter=// 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "turbo.json lost the fork lifecycle task after the merge" }
  }
  Invoke-Git add -- turbo.json
  $script:TurboResolverRan = $true
}

function Resolve-ApiToAudit {
  # bb-fork(windows): docs/api_to_audit.md is regenerated from the merge
  # source plus the fork-owned append-only audit block on every run, so a
  # rerun after a failure heals the file regardless of conflict state. The
  # block comes from the worktree when its markers are usable — an operator
  # may have edited it while resolving — and from HEAD otherwise; a missing
  # block fails loudly rather than dropping fork audit entries.
  $source = Get-MergeSource
  $upstreamLines = @(& git show "${source}:$ApiToAuditPath" 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "could not read $ApiToAuditPath from $source" }

  $blockFile = $null
  if (Test-Path -LiteralPath $ApiToAuditPath) {
    $worktree = Get-Content -Raw -LiteralPath $ApiToAuditPath
    if ($worktree) {
      $begin = $worktree.IndexOf("<!-- bb-fork:begin -->")
      $end = $worktree.IndexOf("<!-- bb-fork:end -->")
      if ($begin -ge 0 -and $end -gt $begin -and
          ($worktree.Substring($begin, $end - $begin) -notmatch '<{7}|>{7}')) {
        $blockFile = $ApiToAuditPath
      }
    }
  }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("bb-api-audit-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    $upstreamTmp = Join-Path $tmp "upstream.md"
    $outputTmp = Join-Path $tmp "merged.md"
    [IO.File]::WriteAllText($upstreamTmp, (($upstreamLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
    if (-not $blockFile) {
      $blockFile = Join-Path $tmp "ours.md"
      $headLines = @(& git show "HEAD:$ApiToAuditPath" 2>$null)
      if ($LASTEXITCODE -ne 0) {
        throw "could not read $ApiToAuditPath from HEAD to recover the fork audit block"
      }
      [IO.File]::WriteAllText($blockFile, (($headLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
    }
    Write-Host "Resolving $ApiToAuditPath from the merge source plus the fork audit block"
    & node "scripts/windows/api-audit-merge.mjs" $upstreamTmp $blockFile $outputTmp
    if ($LASTEXITCODE -ne 0) { throw "api-audit-merge.mjs failed with exit code $LASTEXITCODE" }
    Copy-Item -LiteralPath $outputTmp -Destination $ApiToAuditPath -Force
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Invoke-Git add -- $ApiToAuditPath
  $script:ApiToAuditResolverRan = $true
}

function Get-DrizzleJournalEntries {
  # bb-fork(windows): reads meta/_journal.json from the worktree, or from a
  # revision such as HEAD when $Revision is set. Returns @() when the journal
  # is missing or unparseable.
  param([string]$Revision = "")
  $journalPath = "$DrizzleDir/meta/_journal.json"
  try {
    if ($Revision) {
      $raw = @(& git show "${Revision}:$journalPath" 2>$null) -join "`n"
      if ($LASTEXITCODE -ne 0 -or -not $raw) { return @() }
    } else {
      if (-not (Test-Path -LiteralPath $journalPath)) { return @() }
      $raw = Get-Content -Raw -LiteralPath $journalPath
    }
    return @(($raw | ConvertFrom-Json).entries)
  } catch {
    return @()
  }
}

function Test-SqlAddsForkColumns {
  param([string]$Sql)
  foreach ($column in $ForkColumnNames) {
    if ($Sql -notmatch "(?im)\bALTER\s+TABLE\b[^;]*\bADD\b[^;]*\b$column\b") { return $false }
  }
  return $true
}

function Get-ForkMigrationSqlName {
  # bb-fork(windows): the consolidated fork migration is the .sql under
  # packages/db/drizzle that adds every fork column; $null when absent.
  if (-not (Test-Path -LiteralPath $DrizzleDir)) { return $null }
  foreach ($file in @(Get-ChildItem -LiteralPath $DrizzleDir -Filter *.sql -File)) {
    if (Test-SqlAddsForkColumns -Sql (Get-Content -Raw -LiteralPath $file.FullName)) {
      return $file.Name
    }
  }
  return $null
}

function Test-SchemaCarriesForkColumns {
  if (-not (Test-Path -LiteralPath $SchemaPath)) { return $false }
  $schema = Get-Content -Raw -LiteralPath $SchemaPath
  foreach ($column in $ForkColumnNames) {
    if ($schema -notmatch "\b$column\b") { return $false }
  }
  return $true
}

function Get-PorcelainPaths {
  # bb-fork(windows): -UnstagedOnly keeps entries whose worktree state is
  # pending — modified/deleted but not staged, untracked (??), or unmerged —
  # i.e. anything `git add -A` would still pick up. A fully staged tree
  # (worktree column blank) is not pending and reports empty.
  param([string]$FilterPath, [switch]$UnstagedOnly)
  @(& git -c core.quotepath=false status --porcelain -- $FilterPath |
    ForEach-Object {
      if ($UnstagedOnly -and $_[1] -eq ' ') { return }
      $entry = $_.Substring(3)
      if ($entry.Contains(" -> ")) { $entry = $entry.Substring($entry.LastIndexOf(" -> ") + 4) }
      $entry.Trim().Trim('"')
    })
}

function Assert-DrizzleGeneration {
  # bb-fork(windows): verifies what db:generate emitted before anything new is
  # staged; every failed check is listed in the thrown error.
  param([string[]]$NewSqlFiles, [bool]$ExpectMigration)
  $failures = @()
  $expectedSqlCount = if ($ExpectMigration) { 1 } else { 0 }
  if ($NewSqlFiles.Count -ne $expectedSqlCount) {
    $listed = if ($NewSqlFiles.Count -gt 0) { ": $($NewSqlFiles -join ', ')" } else { "" }
    $failures += "expected $expectedSqlCount new .sql under $DrizzleDir, found $($NewSqlFiles.Count)$listed"
  }
  if ($ExpectMigration -and $NewSqlFiles.Count -eq 1) {
    $sql = Get-Content -Raw -LiteralPath (Join-Path $DrizzleDir $NewSqlFiles[0])
    foreach ($column in $ForkColumnNames) {
      if ($sql -notmatch "(?im)\bALTER\s+TABLE\b[^;]*\bADD\b[^;]*\b$column\b") {
        $failures += "$($NewSqlFiles[0]) does not add fork column '$column' (no 'ALTER TABLE ... ADD $column')"
      }
    }
  }
  $entries = Get-DrizzleJournalEntries
  if ($entries.Count -eq 0) {
    $failures += "$DrizzleDir/meta/_journal.json is missing or has no entries"
  } else {
    for ($i = 0; $i -lt $entries.Count; $i++) {
      if ([long]$entries[$i].idx -ne $i) {
        $failures += "journal entry $($entries[$i].tag) has idx $($entries[$i].idx), expected $i"
      }
      # bb-fork(windows): strictly increasing, matching migration-journal.test.ts
      # — equal 'when' values fail too.
      if ($i -gt 0 -and [long]$entries[$i].when -le [long]$entries[$i - 1].when) {
        $failures += "journal 'when' is not strictly increasing: $($entries[$i].tag) ($($entries[$i].when)) does not exceed $($entries[$i - 1].tag) ($($entries[$i - 1].when))"
      }
    }
    if ($ExpectMigration -and $NewSqlFiles.Count -eq 1 -and $entries.Count -ge 2) {
      $last = $entries[$entries.Count - 1]
      $prev = $entries[$entries.Count - 2]
      if ([long]$last.idx -ne $entries.Count - 1) {
        $failures += "newest journal entry $($last.tag) has idx $($last.idx), expected $($entries.Count - 1)"
      }
      if ([long]$last.when -le [long]$prev.when) {
        $failures += "newest journal entry $($last.tag) 'when' $($last.when) is not strictly after $($prev.tag) 'when' $($prev.when)"
      }
      $newPrefix = "$($last.tag)".Split("_")[0]
      $prevPrefix = "$($prev.tag)".Split("_")[0]
      $newSnapshotPath = "$DrizzleDir/meta/${newPrefix}_snapshot.json"
      $prevSnapshotPath = "$DrizzleDir/meta/${prevPrefix}_snapshot.json"
      foreach ($snapPath in @($newSnapshotPath, $prevSnapshotPath)) {
        if (-not (Test-Path -LiteralPath $snapPath)) { $failures += "missing snapshot $snapPath" }
      }
      if ((Test-Path -LiteralPath $newSnapshotPath) -and (Test-Path -LiteralPath $prevSnapshotPath)) {
        try {
          $newSnap = Get-Content -Raw -LiteralPath $newSnapshotPath | ConvertFrom-Json
          $prevSnap = Get-Content -Raw -LiteralPath $prevSnapshotPath | ConvertFrom-Json
          if ("$($newSnap.prevId)" -ne "$($prevSnap.id)") {
            $failures += "snapshot ${newPrefix}_snapshot.json prevId '$($newSnap.prevId)' does not equal previous snapshot id '$($prevSnap.id)'"
          }
        } catch {
          $failures += "could not parse snapshots for the prevId check: $_"
        }
      }
    }
  }
  if ($failures.Count -gt 0) {
    throw "db:generate output failed validation (nothing new was staged):`n  - $($failures -join "`n  - ")"
  }
}

function Resolve-DrizzleMigrations {
  # bb-fork(windows): the fork carries one generated drizzle migration (the
  # consolidated environments.start_ref + threads.parent_notifications_muted_at
  # columns). Journal and snapshot conflicts recur on almost every merge, so
  # the whole tree is reset to the merge source and the fork migration is
  # regenerated instead of resolved by hand.
  #
  # The resolver enforces a journal-based post-condition rather than keying on
  # conflicts: while schema.ts declares the fork columns, the worktree must
  # hold one .sql that adds them all AND meta/_journal.json must reference it
  # by tag AND the drizzle tree must have no pending worktree state (nothing
  # unstaged or untracked). Anything else regenerates — a generated-but-
  # unjournaled .sql (a run killed inside db:generate), a journal staged
  # without the entry, or a half-finished tree left by a failed git add. A
  # fully staged, journaled resolution early-returns so a resumed run does
  # not throw away already-committed-to-index work and regenerate a
  # differently-named migration; the git add there is an idempotent safety
  # net so a resolved tree is what gets committed.
  $schemaUnmerged = @(& git -c core.quotepath=false diff --name-only --diff-filter=U -- $SchemaPath)
  if ($schemaUnmerged.Count -gt 0) {
    Write-Host "$SchemaPath still has merge conflicts; resolve it, then rerun this script."
    Write-Host "Leaving $DrizzleDir unmerged until $SchemaPath is settled — resetting now could regenerate the wrong schema."
    return
  }

  $schemaCarriesForkColumns = Test-SchemaCarriesForkColumns
  $forkMigration = Get-ForkMigrationSqlName
  $forkMigrationJournaled = $false
  if ($forkMigration) {
    $forkTag = [IO.Path]::GetFileNameWithoutExtension($forkMigration)
    $forkMigrationJournaled = @(@(Get-DrizzleJournalEntries) | Where-Object { "$($_.tag)" -eq $forkTag }).Count -gt 0
  }
  $unmerged = @(& git -c core.quotepath=false diff --name-only --diff-filter=U -- "$DrizzleDir/**")
  $drizzlePending = @(Get-PorcelainPaths -FilterPath $DrizzleDir -UnstagedOnly)
  if ($unmerged.Count -eq 0 -and $drizzlePending.Count -eq 0 -and
      (-not $schemaCarriesForkColumns -or $forkMigrationJournaled)) {
    # bb-fork(windows): post-condition holds — the consolidated migration is
    # journaled (or the fork columns were retired and upstream's tree
    # stands). Stage anyway so a resolved tree is what gets committed.
    # (`Invoke-Git` cannot take -A: PowerShell binds it as a parameter name.)
    if (Test-Path -LiteralPath $DrizzleDir) {
      & git add -A -- $DrizzleDir
      if ($LASTEXITCODE -ne 0) { throw "git add -A -- $DrizzleDir failed with exit code $LASTEXITCODE" }
    }
    return
  }
  Write-Host "Resolving $DrizzleDir from the merge source and regenerating the fork migration"

  $source = Get-MergeSource

  $lsTreeOutput = & git ls-tree -r --name-only $source -- $DrizzleDir
  if ($LASTEXITCODE -ne 0) {
    throw "git ls-tree -r --name-only $source -- $DrizzleDir failed with exit code $LASTEXITCODE"
  }
  $upstreamPaths = @($lsTreeOutput | Where-Object { $_ })
  if ($upstreamPaths.Count -eq 0) {
    throw "git ls-tree lists no paths under $DrizzleDir at $source; refusing to run the git rm sweep, which would delete the whole migration tree"
  }
  # bb-fork(windows): `git checkout <tree> -- dir` restores upstream content
  # for paths upstream tracks but leaves ours-only files (the previous fork
  # migration's .sql and meta/<idx>_snapshot.json) in place; the git rm sweep
  # below deletes them so drizzle-kit regenerates against a clean tree.
  Invoke-Git checkout $source -- $DrizzleDir

  # bb-fork(windows): anything after the upstream reset that throws — the
  # sweep, the baseline staging, db:generate, validation, or the final add —
  # would leave a half-finished tree behind. Restore the "needs regeneration"
  # state (merge-source content re-applied, ours-only files swept, leftovers
  # staged so the next sweep can see them) so the post-condition cannot
  # early-return on it, then surface the original error.
  try {
    # bb-fork(windows): git ls-files prints one line per unmerged stage, so
    # dedupe before git rm — a duplicate path exits 128 on the second removal.
    foreach ($oursPath in @(& git ls-files -- $DrizzleDir | Sort-Object -Unique)) {
      if ($upstreamPaths -notcontains $oursPath) {
        & git rm -q -f -- $oursPath
        if ($LASTEXITCODE -ne 0) { throw "git rm -q -f -- $oursPath failed with exit code $LASTEXITCODE" }
      }
    }

    # bb-fork(windows): stage the reset before capturing the baseline so the
    # recorded `generated` set is exactly the worktree delta the generator
    # produced — journal and snapshot modifications included — not the
    # checkout's staged diff against HEAD.
    & git add -A -- $DrizzleDir
    if ($LASTEXITCODE -ne 0) { throw "git add -A -- $DrizzleDir failed with exit code $LASTEXITCODE" }
    $preGenerateUnstaged = @(Get-PorcelainPaths -FilterPath $DrizzleDir -UnstagedOnly)
    $preGenerateSql = @()
    if (Test-Path -LiteralPath $DrizzleDir) {
      $preGenerateSql = @(Get-ChildItem -LiteralPath $DrizzleDir -Filter *.sql -File | ForEach-Object { $_.Name })
    }

    & pnpm --filter "@bb/db" db:generate 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm --filter @bb/db db:generate failed; fix the cause and rerun this script — the drizzle post-condition regenerates the fork migration"
    }

    $postGenerateSql = @()
    if (Test-Path -LiteralPath $DrizzleDir) {
      $postGenerateSql = @(Get-ChildItem -LiteralPath $DrizzleDir -Filter *.sql -File | ForEach-Object { $_.Name })
    }
    $newSqlFiles = @($postGenerateSql | Where-Object { $preGenerateSql -notcontains $_ })
    Assert-DrizzleGeneration -NewSqlFiles $newSqlFiles -ExpectMigration $schemaCarriesForkColumns

    $postGenerateUnstaged = @(Get-PorcelainPaths -FilterPath $DrizzleDir -UnstagedOnly)
    $script:DrizzleGeneratedPaths = @($postGenerateUnstaged | Where-Object { $preGenerateUnstaged -notcontains $_ })
    & git add -A -- $DrizzleDir
    if ($LASTEXITCODE -ne 0) { throw "git add -A -- $DrizzleDir failed with exit code $LASTEXITCODE" }
    $script:DrizzleResolverRan = $true
  } catch {
    $resolverError = $_
    try {
      Invoke-Git checkout $source -- $DrizzleDir
      foreach ($oursPath in @(& git ls-files -- $DrizzleDir | Sort-Object -Unique)) {
        if ($upstreamPaths -notcontains $oursPath) {
          & git rm -q -f -- $oursPath
        }
      }
      & git add -A -- $DrizzleDir
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "rollback git add -A -- $DrizzleDir failed with exit code $LASTEXITCODE"
      }
    } catch {
      Write-Warning "Could not restore $DrizzleDir to the merge source after the resolver failure; the next run may see a half-finished tree: $_"
    }
    throw $resolverError
  }
}

function Invoke-DrizzleWatermarkCanary {
  # bb-fork(windows): warn when the resolved journal contains upstream entries
  # whose 'when' sits at or before the fork migration's watermark — databases
  # that already ran the fork migration never see them and fail startup
  # validation. Runs unconditionally after the resolvers, including when the
  # drizzle post-condition early-returned (an auto-merged journal staged into
  # the index can carry stale upstream entries without any regeneration), and
  # must never fail the merge. The fork watermark and our pre-merge tags both
  # come from HEAD, which still describes our side while the merge is
  # uncommitted even when a previous run already swept the worktree.
  try {
    $headEntries = Get-DrizzleJournalEntries -Revision "HEAD"
    if ($headEntries.Count -eq 0) { return }
    $preTags = @($headEntries | ForEach-Object { "$($_.tag)" })
    $forkWhen = $null
    $headSqlPaths = @(
      & git ls-tree -r --name-only HEAD -- $DrizzleDir 2>$null |
        Where-Object { $_ -like "$DrizzleDir/*.sql" -and $_ -notlike "$DrizzleDir/*/*.sql" }
    )
    foreach ($headSqlPath in $headSqlPaths) {
      $headSql = (@(& git show "HEAD:$headSqlPath" 2>$null) -join "`n")
      if ($LASTEXITCODE -eq 0 -and (Test-SqlAddsForkColumns -Sql $headSql)) {
        $headTag = [IO.Path]::GetFileNameWithoutExtension($headSqlPath)
        $headEntry = @($headEntries | Where-Object { "$($_.tag)" -eq $headTag }) | Select-Object -First 1
        if ($headEntry) { $forkWhen = [long]$headEntry.when }
        break
      }
    }
    if ($null -eq $forkWhen) { return }
    $generatedTag = $null
    $generatedSql = @($script:DrizzleGeneratedPaths |
      Where-Object { $_ -like "$DrizzleDir/*.sql" -and $_ -notlike "$DrizzleDir/*/*.sql" })
    if ($generatedSql.Count -eq 1) {
      $generatedTag = [IO.Path]::GetFileNameWithoutExtension($generatedSql[0])
    }
    $staleEntries = @(
      Get-DrizzleJournalEntries |
        Where-Object { $preTags -notcontains "$($_.tag)" -and "$($_.tag)" -ne $generatedTag -and [long]$_.when -le $forkWhen }
    )
    if ($staleEntries.Count -gt 0) {
      $listed = ($staleEntries | ForEach-Object { "$($_.tag) (when $($_.when))" }) -join ", "
      $warning = "upstream migrations at or before the fork watermark ${forkWhen}: $listed — existing databases can skip them and fail startup validation; reconcile $DrizzleDir before shipping this merge"
      Write-Host ""
      Write-Host "WARNING: $warning"
      Write-Host ""
      $script:MergeWarnings = @($script:MergeWarnings) + $warning
    }
  } catch {
    Write-Warning "Drizzle watermark canary failed (non-fatal): $_"
  }
}

# bb-fork(windows): paths the auto-resolvers own; Get-ConflictCategory and
# Get-ConflictResolution reuse them so the merge log stays in sync.
$LockfilePath = "pnpm-lock.yaml"
$DrizzleDir = "packages/db/drizzle"
$SchemaPath = "packages/db/src/schema.ts"
# bb-fork(windows): the consolidated fork migration adds every column in this
# list; the drizzle post-condition requires one journaled .sql that adds them all.
$ForkColumnNames = @("start_ref", "parent_notifications_muted_at")
$script:DrizzleGeneratedPaths = @()
$script:DrizzleResolverRan = $false
$script:TurboResolverRan = $false
# bb-fork(windows): docs/api_to_audit.md carries the append-only fork audit
# block; Resolve-ApiToAudit and Get-ConflictResolution share this path.
$ApiToAuditPath = "docs/api_to_audit.md"
$script:ApiToAuditResolverRan = $false
$script:MergeWarnings = @()
$PristineUpstreamPaths = @("plugins/bb-official.json")
$ProtocolPaths = @(
  "packages/host-daemon-contract/src/protocol.ts"
  "packages/host-daemon-contract/test/contract.test.ts"
)

function Get-ConflictCategory {
  param([string]$Path)
  $normalized = $Path -replace '\\', '/'
  if ($normalized -eq $LockfilePath) { return "lockfile" }
  if ($PristineUpstreamPaths -contains $normalized) { return "pristine-upstream" }
  if ($ProtocolPaths -contains $normalized) { return "protocol" }
  if ($normalized -eq "$DrizzleDir/meta/_journal.json") { return "drizzle-journal" }
  if ($normalized -like "$DrizzleDir/*.sql" -and $normalized -notlike "$DrizzleDir/*/*.sql") {
    return "drizzle-migration"
  }
  if ($normalized -like "$DrizzleDir/*") { return "drizzle-snapshot" }
  if ($normalized -like "docs/*" -or $normalized -like "*.md") { return "docs" }
  if ($normalized -like "plugins/*" -or $normalized -like ".github/*" -or
      $normalized -in @("turbo.json", "pnpm-workspace.yaml", ".npmrc", ".gitignore")) {
    return "fork-config"
  }
  return "other"
}

function Get-ConflictResolution {
  param([string]$Path, [string[]]$Unresolved)
  if ($Unresolved -contains $Path) { return "unresolved" }
  $normalized = $Path -replace '\\', '/'
  if ($normalized -eq $LockfilePath -or $PristineUpstreamPaths -contains $normalized) {
    return "auto-upstream"
  }
  if ($ProtocolPaths -contains $normalized) { return "auto-ours" }
  if ($normalized -eq "turbo.json" -and $script:TurboResolverRan) {
    return "auto-merged"
  }
  if ($normalized -eq $ApiToAuditPath -and $script:ApiToAuditResolverRan) {
    return "auto-merged"
  }
  if ($normalized -like "$DrizzleDir/*" -and $script:DrizzleResolverRan) {
    return "auto-regenerated"
  }
  return "resolved-externally"
}

function Write-MergeLog {
  # bb-fork(windows): appends one JSONL record per run to .bb/merge-log.
  # Best-effort only: failures warn and must never change the merge outcome.
  param([string]$Status)
  try {
    # bb-fork(windows): without a resolved repo root the CWD is arbitrary, so
    # there is nowhere sound to write the log.
    if (-not $repoRoot) { return }
    $unresolved = @(& git -c core.quotepath=false diff --name-only --diff-filter=U)
    # bb-fork(windows): MERGE_HEAD names the commit actually being merged; fall
    # back to the upstream ref when no merge is in progress.
    $upstreamSha = ""
    $mergeHead = ""
    $revOutput = & git rev-parse -q --verify MERGE_HEAD 2>$null
    if ($LASTEXITCODE -eq 0) {
      $mergeHead = "$revOutput".Trim()
      $upstreamSha = $mergeHead
    } else {
      $revOutput = & git rev-parse "${Upstream}/${Branch}" 2>$null
      if ($LASTEXITCODE -eq 0) { $upstreamSha = "$revOutput".Trim() }
    }
    $headAfterOutput = & git rev-parse --verify HEAD 2>$null
    $headAfter = ""
    if ($LASTEXITCODE -eq 0) { $headAfter = "$headAfterOutput".Trim() }
    # bb-fork(windows): a hard failure before $rawConflicts was captured can
    # still leave unmerged entries; log them as unresolved instead of an
    # empty record.
    $conflictPaths = $rawConflicts
    if ($rawConflicts.Count -eq 0 -and $unresolved.Count -gt 0) {
      $conflictPaths = $unresolved
    }
    # bb-fork(windows): regenerated drizzle artifacts are resolver output, not
    # merge conflicts; they are recorded in generated/generatedCount so
    # conflicts/conflictCount stay equal to the raw conflicts.
    $generated = @($script:DrizzleGeneratedPaths)
    $entries = @(
      foreach ($path in $conflictPaths) {
        [ordered]@{
          path = $path
          category = Get-ConflictCategory -Path $path
          resolution = Get-ConflictResolution -Path $path -Unresolved $unresolved
        }
      }
    )
    $record = [ordered]@{
      at = (Get-Date).ToUniversalTime().ToString("o")
      upstreamRef = "${Upstream}/${Branch}"
      upstreamSha = $upstreamSha
      headBefore = $headBefore
      mergeHead = $mergeHead
      headAfter = $headAfter
      resumed = [bool]$resumed
      durationMs = [long]$stopwatch.ElapsedMilliseconds
      status = $Status
      conflictCount = $conflictPaths.Count
      unresolvedCount = $unresolved.Count
      generatedCount = $generated.Count
      conflicts = $entries
      generated = $generated
      warnings = @($script:MergeWarnings)
    }
    $logDir = ".bb/merge-log"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logName = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd") + ".jsonl"
    Add-Content -LiteralPath (Join-Path $logDir $logName) -Value ($record | ConvertTo-Json -Compress -Depth 5)
  } catch {
    Write-Warning "Could not append to .bb/merge-log: $_"
  }
}

trap {
  Write-MergeLog -Status "failed"
  break
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
# bb-fork(windows): plain "rev-parse HEAD" prints the literal ref on an unborn
# HEAD; --verify exits nonzero instead so headBefore stays empty there.
$headBeforeOutput = & git rev-parse --verify HEAD 2>$null
$headBefore = ""
if ($LASTEXITCODE -eq 0) { $headBefore = "$headBeforeOutput".Trim() }
$resumed = $false
$rawConflicts = @()

Invoke-Git fetch $Upstream

# bb-fork(windows): exit code 1 means merge conflicts, which this script is
# bb-fork(windows): built to auto-resolve; only harder failures should stop here.
# bb-fork(windows): in a linked worktree .git is a file, so Test-Path
# ".git/MERGE_HEAD" misses a resumed merge; ask git for the ref instead.
& git rev-parse -q --verify MERGE_HEAD 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  $resumed = $true
  Write-Host "Resuming the in-progress merge"
} else {
  & git merge "${Upstream}/${Branch}"
  if ($LASTEXITCODE -gt 1) {
    throw "git merge ${Upstream}/${Branch} failed with exit code $LASTEXITCODE"
  }
}

$rawConflicts = @(& git -c core.quotepath=false diff --name-only --diff-filter=U)

Resolve-Lockfile
Resolve-PristineUpstreamFiles
Set-ForkProtocolVersion
Resolve-TurboJson
Resolve-ApiToAudit
Resolve-DrizzleMigrations
# bb-fork(windows): runs on every resolver exit — regeneration, post-condition
# early-return, or no drizzle involvement at all — and only warns.
Invoke-DrizzleWatermarkCanary

$conflicts = @(& git -c core.quotepath=false diff --name-only --diff-filter=U)
if ($conflicts) {
  Write-Host ""
  Write-Host "Unresolved conflicts remain; resolve them (git add <path>), then rerun"
  Write-Host "this script — it resumes the in-progress merge — or finish with 'git commit'."
  $conflicts | ForEach-Object { Write-Host "  $_" }
  Write-MergeLog -Status "unresolved-conflicts"
  exit 1
}

# bb-fork(windows): the script stages resolutions but never commits, so a
# resolved merge still carries MERGE_HEAD until the operator runs git commit.
& git rev-parse -q --verify MERGE_HEAD 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-MergeLog -Status "resolved-pending-commit"
  Write-Host "Conflicts are resolved and staged; run 'git commit' to finish the merge."
} else {
  # bb-fork(windows): a rerun that merged nothing still exits 0; log it as
  # up-to-date instead of merged so the log does not inflate merge counts.
  $headAfterOutput = & git rev-parse --verify HEAD 2>$null
  $headAfter = ""
  if ($LASTEXITCODE -eq 0) { $headAfter = "$headAfterOutput".Trim() }
  if (-not $resumed -and $headAfter -eq $headBefore) {
    Write-MergeLog -Status "up-to-date"
    Write-Host "Already up to date."
  } else {
    Write-MergeLog -Status "merged"
    Write-Host "Merge complete."
  }
}
Write-Host "Next: pnpm exec turbo run typecheck, then regenerate the marketplace if plugin lists changed."
Write-Host "Restart any running dev instance (pnpm dev:restart-server) so newly bundled upstream plugins are installed."
exit 0
