// bb-fork(parent-mute): cover reconciliation of the pre-merge 0131 muted-at migration
import { expect, it } from "vitest";
import { createConnection, migrate, type DbConnection } from "../src/index.js";
import {
  dropEnvironmentStartRefColumn,
  dropIdleLifecycleIndexes,
  dropMarketplaceSourceGitSubdirectoryColumn,
  dropPluginEnabledFollowsDefaultColumn,
  dropQueuedMessageEditHeldUntilColumn,
  rewindThreadPruningWork,
} from "./helpers/rewind.js";

const LEGACY_MUTED_AT_MIGRATION_WHEN = 1790254777753;
const LEGACY_START_REF_MIGRATION_WHEN = 1790682398124;
const ENVIRONMENT_RETENTION_MIGRATION_WHEN = 1790230932025;
const REMOVE_THREAD_DRAFTS_MIGRATION_WHEN = 1790613729994;
const CONSOLIDATED_MIGRATION_WHEN = 1791879075079;

function closeConnection(db: DbConnection): void {
  db.$client.close();
}

function tableColumns(db: DbConnection, tableName: string): string[] {
  return db.$client
    .prepare<[], { name: string }>(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

function indexExists(db: DbConnection, indexName: string): boolean {
  return (
    db.$client
      .prepare<[string], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .get(indexName) !== undefined
  );
}

function appliedCreatedAts(db: DbConnection): Set<number> {
  return new Set(
    db.$client
      .prepare<[], { createdAt: number }>(
        "SELECT created_at AS createdAt FROM __drizzle_migrations WHERE created_at IS NOT NULL",
      )
      .all()
      .map((row) => row.createdAt),
  );
}

it("reconciles the pre-merge 0131 muted-at migration with upstream's renumbered migrations", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    db.$client.exec(`
      INSERT INTO projects (id, name, created_at, updated_at)
      VALUES ('proj_parent_mute_legacy', 'Parent Mute Legacy', 1000, 1000);
      INSERT INTO threads (
        id,
        project_id,
        provider_id,
        title,
        latest_attention_at,
        parent_notifications_muted_at,
        created_at,
        updated_at
      )
      VALUES (
        'thr_parent_mute_legacy',
        'proj_parent_mute_legacy',
        'codex',
        'parent mute',
        1000,
        12345,
        1000,
        1000
      );
    `);
    expect(indexExists(db, "environments_provider_lifecycle_idx")).toBe(true);

    db.$client.exec(`
      DROP INDEX IF EXISTS environments_provider_lifecycle_idx;
    `);
    dropIdleLifecycleIndexes(db);
    dropPluginEnabledFollowsDefaultColumn(db);
    dropQueuedMessageEditHeldUntilColumn(db);
    dropEnvironmentStartRefColumn(db);
    dropMarketplaceSourceGitSubdirectoryColumn(db);
    rewindThreadPruningWork(db);
    db.$client
      .prepare<[number]>(
        "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
      )
      .run(ENVIRONMENT_RETENTION_MIGRATION_WHEN);
    db.$client
      .prepare<[string, number]>(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      )
      .run("legacy-cute-praxagora", LEGACY_MUTED_AT_MIGRATION_WHEN);

    expect(() => migrate(db)).not.toThrow();

    const columns = tableColumns(db, "threads");
    expect(columns).toContain("parent_notifications_muted_at");
    expect(columns).not.toContain("_bb_parent_notifications_muted_at_pending");
    expect(indexExists(db, "environments_provider_lifecycle_idx")).toBe(true);
    expect(appliedCreatedAts(db)).toContain(
      ENVIRONMENT_RETENTION_MIGRATION_WHEN,
    );
    expect(
      db.$client
        .prepare<[], { mutedAt: number | null }>(
          "SELECT parent_notifications_muted_at AS mutedAt FROM threads WHERE id = 'thr_parent_mute_legacy'",
        )
        .get(),
    ).toEqual({ mutedAt: 12345 });

    expect(() => migrate(db)).not.toThrow();
  } finally {
    closeConnection(db);
  }
});

it("replays 0143 when a legacy database already carries start_ref", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    db.$client.exec(`
      INSERT INTO projects (id, name, created_at, updated_at)
      VALUES ('proj_start_ref_legacy', 'Start Ref Legacy', 1000, 1000);
      INSERT INTO hosts (id, name, type, created_at, updated_at)
      VALUES ('host_start_ref_legacy', 'Start Ref Host', 'persistent', 1000, 1000);
      INSERT INTO environments (id, project_id, host_id, path, status, start_ref, created_at, updated_at)
      VALUES ('env_start_ref_legacy', 'proj_start_ref_legacy', 'host_start_ref_legacy', '/tmp/start-ref', 'ready', 'refs/heads/start', 1000, 1000);
      INSERT INTO threads (
        id,
        project_id,
        provider_id,
        title,
        latest_attention_at,
        parent_notifications_muted_at,
        created_at,
        updated_at
      )
      VALUES (
        'thr_start_ref_legacy',
        'proj_start_ref_legacy',
        'codex',
        'start ref',
        1000,
        54321,
        1000,
        1000
      );
    `);
    db.$client
      .prepare<[number]>(
        "DELETE FROM __drizzle_migrations WHERE created_at = ?",
      )
      .run(CONSOLIDATED_MIGRATION_WHEN);

    expect(() => migrate(db)).not.toThrow();

    const environmentColumns = tableColumns(db, "environments");
    expect(environmentColumns).toContain("start_ref");
    expect(environmentColumns).not.toContain("_bb_start_ref_pending");
    expect(tableColumns(db, "threads")).not.toContain(
      "_bb_parent_notifications_muted_at_pending",
    );
    expect(
      db.$client
        .prepare<[], { startRef: string | null }>(
          "SELECT start_ref AS startRef FROM environments WHERE id = 'env_start_ref_legacy'",
        )
        .get(),
    ).toEqual({ startRef: "refs/heads/start" });
    expect(
      db.$client
        .prepare<[], { mutedAt: number | null }>(
          "SELECT parent_notifications_muted_at AS mutedAt FROM threads WHERE id = 'thr_start_ref_legacy'",
        )
        .get(),
    ).toEqual({ mutedAt: 54321 });

    expect(() => migrate(db)).not.toThrow();
  } finally {
    closeConnection(db);
  }
});

it("applies migrations skipped under legacy fork timestamps", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    db.$client.exec(`
      ALTER TABLE threads ADD draft text;
      DELETE FROM __drizzle_migrations WHERE created_at = ${REMOVE_THREAD_DRAFTS_MIGRATION_WHEN};
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('legacy-numerous-spacker-dave', ${LEGACY_START_REF_MIGRATION_WHEN});
    `);
    expect(tableColumns(db, "threads")).toContain("draft");

    expect(() => migrate(db)).not.toThrow();

    expect(tableColumns(db, "threads")).not.toContain("draft");
    expect(appliedCreatedAts(db)).toContain(
      REMOVE_THREAD_DRAFTS_MIGRATION_WHEN,
    );

    expect(() => migrate(db)).not.toThrow();
  } finally {
    closeConnection(db);
  }
});
