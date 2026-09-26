// bb-fork(parent-mute): cover reconciliation of the pre-merge 0131 muted-at migration
import { expect, it } from "vitest";
import { createConnection, migrate, type DbConnection } from "../src/index.js";

const LEGACY_MUTED_AT_MIGRATION_WHEN = 1790254777753;
const ENVIRONMENT_RETENTION_MIGRATION_WHEN = 1790230932025;

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
      ALTER TABLE threads DROP COLUMN draft;
      DROP INDEX IF EXISTS environments_provider_lifecycle_idx;
    `);
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
    expect(columns).toContain("draft");
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
