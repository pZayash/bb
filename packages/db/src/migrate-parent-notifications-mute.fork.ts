// bb-fork(parent-mute): keep the consolidated 0143 fork columns replay-safe for legacy databases
import { readMigrationFiles } from "drizzle-orm/migrator";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DbConnection } from "./connection.js";

const MIGRATION_TAG = "0150_opposite_juggernaut";
const LEGACY_MUTED_AT_MIGRATION_WHEN = 1790254777753;
const LEGACY_START_REF_MIGRATION_WHEN = 1790682398124;
const ENVIRONMENT_RETENTION_MIGRATION_TAG =
  "0131_environment_retention_indexes";
const REMOVE_THREAD_DRAFTS_MIGRATION_TAG = "0133_remove_thread_drafts";
const JOURNAL_PATH = "meta/_journal.json";

// bb-fork(parent-mute): legacy databases already carry these columns from
// pre-merge fork migrations that the consolidated 0143 re-adds.
const STAGED_LEGACY_COLUMNS = [
  {
    table: "threads",
    column: "parent_notifications_muted_at",
    stagedColumn: "_bb_parent_notifications_muted_at_pending",
  },
  {
    table: "environments",
    column: "start_ref",
    stagedColumn: "_bb_start_ref_pending",
  },
] as const;

function tableExists(db: DbConnection, tableName: string): boolean {
  return (
    db.$client
      .prepare<
        [string],
        { name: string }
      >("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  );
}

function columnExists(
  db: DbConnection,
  tableName: string,
  columnName: string,
): boolean {
  const rows = db.$client.pragma(`table_info(${tableName})`);
  if (!Array.isArray(rows)) {
    return false;
  }
  return rows.some((row) => (row as { name?: unknown }).name === columnName);
}

function migrationCreatedAt(
  migrationsFolder: string,
  tag: string,
): number | null {
  const journal: unknown = JSON.parse(
    readFileSync(resolve(migrationsFolder, JOURNAL_PATH), "utf-8"),
  );
  const entries = (journal as { entries?: readonly unknown[] }).entries;
  if (!Array.isArray(entries)) {
    return null;
  }
  const entry = entries.find(
    (candidate) => (candidate as { tag?: unknown }).tag === tag,
  );
  const when = (entry as { when?: unknown } | undefined)?.when;
  return typeof when === "number" ? when : null;
}

function readAppliedMigrationCreatedAts(db: DbConnection): Set<number> {
  if (!tableExists(db, "__drizzle_migrations")) {
    return new Set();
  }
  const rows = db.$client
    .prepare<
      [],
      { createdAt: number | null }
    >("SELECT created_at AS createdAt FROM __drizzle_migrations WHERE created_at IS NOT NULL")
    .all();
  return new Set(
    rows
      .map((row) => row.createdAt)
      .filter((createdAt): createdAt is number => createdAt !== null),
  );
}

export function stageExistingConsolidatedMigrationColumns(
  db: DbConnection,
  migrationsFolder: string,
): boolean {
  if (!tableExists(db, "__drizzle_migrations")) {
    return false;
  }
  const createdAt = migrationCreatedAt(migrationsFolder, MIGRATION_TAG);
  if (createdAt === null || readAppliedMigrationCreatedAts(db).has(createdAt)) {
    return false;
  }
  let staged = false;
  for (const legacyColumn of STAGED_LEGACY_COLUMNS) {
    if (
      !tableExists(db, legacyColumn.table) ||
      !columnExists(db, legacyColumn.table, legacyColumn.column) ||
      columnExists(db, legacyColumn.table, legacyColumn.stagedColumn)
    ) {
      continue;
    }
    db.$client.exec(
      `ALTER TABLE ${legacyColumn.table} RENAME COLUMN ${legacyColumn.column} TO ${legacyColumn.stagedColumn}`,
    );
    staged = true;
  }
  return staged;
}

// bb-fork(parent-mute): legacy fork migrations journal later timestamps, so
// drizzle skips these expected migrations even though the legacy database
// never applied them. Apply and journal them when the marker row exists.
const LEGACY_SKIP_REPAIRS = [
  {
    markerWhen: LEGACY_MUTED_AT_MIGRATION_WHEN,
    tag: ENVIRONMENT_RETENTION_MIGRATION_TAG,
  },
  {
    markerWhen: LEGACY_START_REF_MIGRATION_WHEN,
    tag: REMOVE_THREAD_DRAFTS_MIGRATION_TAG,
  },
] as const;

export function repairLegacySkippedMigrations(
  db: DbConnection,
  migrationsFolder: string,
): void {
  if (!tableExists(db, "__drizzle_migrations")) {
    return;
  }
  const appliedCreatedAts = readAppliedMigrationCreatedAts(db);
  const migrations = readMigrationFiles({ migrationsFolder });
  for (const repair of LEGACY_SKIP_REPAIRS) {
    if (!appliedCreatedAts.has(repair.markerWhen)) {
      continue;
    }
    const expectedCreatedAt = migrationCreatedAt(migrationsFolder, repair.tag);
    if (
      expectedCreatedAt === null ||
      appliedCreatedAts.has(expectedCreatedAt)
    ) {
      continue;
    }
    const migration = migrations.find(
      (candidate) => candidate.folderMillis === expectedCreatedAt,
    );
    if (migration === undefined) {
      continue;
    }
    const apply = db.$client.transaction(() => {
      for (const statement of migration.sql) {
        db.$client.exec(statement);
      }
      db.$client
        .prepare(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        )
        .run(migration.hash, migration.folderMillis);
    });
    apply();
    appliedCreatedAts.add(expectedCreatedAt);
  }
}

export function restoreStagedConsolidatedMigrationColumns(
  db: DbConnection,
): void {
  for (const legacyColumn of STAGED_LEGACY_COLUMNS) {
    if (!columnExists(db, legacyColumn.table, legacyColumn.stagedColumn)) {
      continue;
    }
    if (!columnExists(db, legacyColumn.table, legacyColumn.column)) {
      db.$client.exec(
        `ALTER TABLE ${legacyColumn.table} RENAME COLUMN ${legacyColumn.stagedColumn} TO ${legacyColumn.column}`,
      );
      continue;
    }
    db.$client.exec(
      `UPDATE ${legacyColumn.table} SET ${legacyColumn.column} = ${legacyColumn.stagedColumn};
       ALTER TABLE ${legacyColumn.table} DROP COLUMN ${legacyColumn.stagedColumn};`,
    );
  }
}
