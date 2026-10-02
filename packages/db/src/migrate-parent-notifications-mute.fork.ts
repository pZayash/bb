// bb-fork(parent-mute): keep the fork's muted-at migration replay-safe for legacy databases
import { readMigrationFiles } from "drizzle-orm/migrator";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DbConnection } from "./connection.js";

const MIGRATION_TAG = "0133_modern_vermin";
const LEGACY_MUTED_AT_MIGRATION_WHEN = 1790254777753;
const ENVIRONMENT_RETENTION_MIGRATION_TAG =
  "0131_environment_retention_indexes";
const MUTED_AT_COLUMN = "parent_notifications_muted_at";
const STAGED_MUTED_AT_COLUMN = "_bb_parent_notifications_muted_at_pending";
const JOURNAL_PATH = "meta/_journal.json";

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

export function stageExistingParentNotificationsMutedAtColumn(
  db: DbConnection,
  migrationsFolder: string,
): boolean {
  if (
    !tableExists(db, "__drizzle_migrations") ||
    !tableExists(db, "threads") ||
    !columnExists(db, "threads", MUTED_AT_COLUMN)
  ) {
    return false;
  }
  const createdAt = migrationCreatedAt(migrationsFolder, MIGRATION_TAG);
  if (createdAt === null || readAppliedMigrationCreatedAts(db).has(createdAt)) {
    return false;
  }
  db.$client.exec(
    `ALTER TABLE threads RENAME COLUMN ${MUTED_AT_COLUMN} TO ${STAGED_MUTED_AT_COLUMN}`,
  );
  return true;
}

export function repairLegacyParentNotificationsMuteMigration(
  db: DbConnection,
  migrationsFolder: string,
): void {
  if (!tableExists(db, "__drizzle_migrations")) {
    return;
  }
  const appliedCreatedAts = readAppliedMigrationCreatedAts(db);
  if (!appliedCreatedAts.has(LEGACY_MUTED_AT_MIGRATION_WHEN)) {
    return;
  }
  const environmentRetentionCreatedAt = migrationCreatedAt(
    migrationsFolder,
    ENVIRONMENT_RETENTION_MIGRATION_TAG,
  );
  if (
    environmentRetentionCreatedAt === null ||
    appliedCreatedAts.has(environmentRetentionCreatedAt)
  ) {
    return;
  }
  const migration = readMigrationFiles({ migrationsFolder }).find(
    (candidate) => candidate.folderMillis === environmentRetentionCreatedAt,
  );
  if (migration === undefined) {
    return;
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
}

export function restoreStagedParentNotificationsMutedAtColumn(
  db: DbConnection,
): void {
  if (!columnExists(db, "threads", STAGED_MUTED_AT_COLUMN)) {
    return;
  }
  if (!columnExists(db, "threads", MUTED_AT_COLUMN)) {
    db.$client.exec(
      `ALTER TABLE threads RENAME COLUMN ${STAGED_MUTED_AT_COLUMN} TO ${MUTED_AT_COLUMN}`,
    );
    return;
  }
  db.$client.exec(
    `UPDATE threads SET ${MUTED_AT_COLUMN} = ${STAGED_MUTED_AT_COLUMN};
     ALTER TABLE threads DROP COLUMN ${STAGED_MUTED_AT_COLUMN};`,
  );
}
