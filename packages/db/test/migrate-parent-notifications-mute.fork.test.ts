// bb-fork(parent-mute): cover reconciliation of the pre-merge 0131 muted-at migration
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { createConnection, migrate, type DbConnection } from "../src/index.js";
import {
  dropEnvironmentStartRefColumn,
  dropIdleLifecycleIndexes,
  dropMarketplaceSourceGitSubdirectoryColumn,
  dropPluginEnabledFollowsDefaultColumn,
  dropQueuedMessageEditHeldUntilColumn,
  dropThreadParentNotificationsColumn,
  dropThreadStatusChangedAtColumn,
  rewindThreadPruningWork,
} from "./helpers/rewind.js";

const LEGACY_MUTED_AT_MIGRATION_WHEN = 1790254777753;
const LEGACY_START_REF_MIGRATION_WHEN = 1790682398124;
const ENVIRONMENT_RETENTION_MIGRATION_WHEN = 1790230932025;
const REMOVE_THREAD_DRAFTS_MIGRATION_WHEN = 1790613729994;
const LEGACY_PUBLISHED_CONSOLIDATED_MIGRATION_WHEN = 1794224009392;
const LEGACY_CONSOLIDATED_MIGRATION_WHEN = 1793689513289;
const THREAD_STATUS_CHANGED_AT_MIGRATION_WHEN = 1793664307128;
const THREAD_PURGES_MIGRATION_WHEN = 1794003147178;

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = resolve(PACKAGE_DIR, "drizzle");

// bb-fork(parent-mute): the consolidated fork migration is regenerated on
// every upstream merge, so find it by the columns its SQL adds.
function consolidatedMigrationWhen(): number {
  const { entries } = JSON.parse(
    readFileSync(resolve(MIGRATIONS_DIR, "meta", "_journal.json"), "utf-8"),
  ) as { entries: { tag: string; when: number }[] };
  for (const entry of [...entries].reverse()) {
    const sql = readFileSync(
      resolve(MIGRATIONS_DIR, `${entry.tag}.sql`),
      "utf-8",
    );
    if (
      sql.includes("ADD `start_ref`") &&
      sql.includes("ADD `parent_notifications_muted_at`")
    ) {
      return entry.when;
    }
  }
  throw new Error("consolidated fork migration not found in journal");
}

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

function tableExists(db: DbConnection, tableName: string): boolean {
  return (
    db.$client
      .prepare<[string], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(tableName) !== undefined
  );
}

// bb-fork(parent-mute): seed one row per staged column so crash-resume tests
// can assert the staged values land back on the real columns.
function seedConsolidatedColumnRows(
  db: DbConnection,
  values: { mutedAt: number; startRef: string },
): void {
  db.$client.exec(`
    INSERT INTO projects (id, name, created_at, updated_at)
    VALUES ('proj_consolidated', 'Consolidated', 1000, 1000);
    INSERT INTO hosts (id, name, type, created_at, updated_at)
    VALUES ('host_consolidated', 'Consolidated Host', 'persistent', 1000, 1000);
    INSERT INTO environments (id, project_id, host_id, path, status, start_ref, created_at, updated_at)
    VALUES ('env_consolidated', 'proj_consolidated', 'host_consolidated', '/tmp/consolidated', 'ready', '${values.startRef}', 1000, 1000);
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
      'thr_consolidated',
      'proj_consolidated',
      'codex',
      'consolidated',
      1000,
      ${values.mutedAt},
      1000,
      1000
    );
  `);
}

function expectConsolidatedColumnValues(
  db: DbConnection,
  values: { mutedAt: number; startRef: string },
): void {
  const threadColumns = tableColumns(db, "threads");
  expect(threadColumns).toContain("parent_notifications_muted_at");
  expect(threadColumns).not.toContain(
    "_bb_parent_notifications_muted_at_pending",
  );
  const environmentColumns = tableColumns(db, "environments");
  expect(environmentColumns).toContain("start_ref");
  expect(environmentColumns).not.toContain("_bb_start_ref_pending");
  expect(
    db.$client
      .prepare<[], { mutedAt: number | null }>(
        "SELECT parent_notifications_muted_at AS mutedAt FROM threads WHERE id = 'thr_consolidated'",
      )
      .get(),
  ).toEqual({ mutedAt: values.mutedAt });
  expect(
    db.$client
      .prepare<[], { startRef: string | null }>(
        "SELECT start_ref AS startRef FROM environments WHERE id = 'env_consolidated'",
      )
      .get(),
  ).toEqual({ startRef: values.startRef });
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
    dropThreadParentNotificationsColumn(db);
    dropThreadStatusChangedAtColumn(db);
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

it("replays the consolidated migration when a legacy database already carries start_ref", () => {
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
    db.$client.exec(`
      DELETE FROM __drizzle_migrations
      WHERE created_at = ${consolidatedMigrationWhen()};
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('legacy-tired-red-ghost', ${LEGACY_PUBLISHED_CONSOLIDATED_MIGRATION_WHEN});
    `);

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

it("applies 0150 skipped under the legacy consolidated timestamp", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    db.$client.exec(`
      DELETE FROM __drizzle_migrations WHERE created_at = ${THREAD_STATUS_CHANGED_AT_MIGRATION_WHEN};
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('legacy-opposite-juggernaut', ${LEGACY_CONSOLIDATED_MIGRATION_WHEN});
    `);
    dropThreadStatusChangedAtColumn(db);

    expect(() => migrate(db)).not.toThrow();

    expect(tableColumns(db, "threads")).toContain("status_changed_at");
    expect(appliedCreatedAts(db)).toContain(
      THREAD_STATUS_CHANGED_AT_MIGRATION_WHEN,
    );

    expect(() => migrate(db)).not.toThrow();
  } finally {
    closeConnection(db);
  }
});

// bb-fork(parent-mute): a legacy ledger row newer than an unapplied upstream
// migration makes drizzle skip it under the MAX(created_at) watermark; that
// must surface as an explicit failure, never a silent skip.
it("fails loudly when a legacy watermark crowds out an unlisted upstream migration", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    db.$client.exec(`
      DELETE FROM __drizzle_migrations
      WHERE created_at = ${THREAD_PURGES_MIGRATION_WHEN};
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('legacy-tired-red-ghost', ${LEGACY_PUBLISHED_CONSOLIDATED_MIGRATION_WHEN});
    `);

    expect(() => migrate(db)).toThrow(/0154_thread_purges/);
  } finally {
    closeConnection(db);
  }
});

it("warns about applied migrations stamped in the future", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    const futureWhen = Date.now() + 3_600_000;
    db.$client
      .prepare<[string, number]>(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      )
      .run("future-migration", futureWhen);

    const warnings: {
      message: string;
      migrations: { createdAt: number; hash: string }[];
    }[] = [];
    migrate(db, {
      logger: {
        warn: (fields, message) => {
          warnings.push({ message, migrations: fields.migrations });
        },
      },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("future timestamps");
    expect(warnings[0].migrations).toEqual([
      { createdAt: futureWhen, hash: "future-migration" },
    ]);
  } finally {
    closeConnection(db);
  }
});

// bb-fork(parent-mute): a crash between the column rename and drizzle's
// re-apply must not strand values in the _pending columns.
it("heals staged columns when a run was interrupted before the consolidated migration applied", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    seedConsolidatedColumnRows(db, {
      mutedAt: 424242,
      startRef: "refs/heads/interrupted-early",
    });
    db.$client.exec(`
      ALTER TABLE threads RENAME COLUMN parent_notifications_muted_at TO _bb_parent_notifications_muted_at_pending;
      ALTER TABLE environments RENAME COLUMN start_ref TO _bb_start_ref_pending;
      DELETE FROM __drizzle_migrations WHERE created_at = ${consolidatedMigrationWhen()};
    `);

    expect(() => migrate(db)).not.toThrow();

    expectConsolidatedColumnValues(db, {
      mutedAt: 424242,
      startRef: "refs/heads/interrupted-early",
    });
    expect(appliedCreatedAts(db)).toContain(consolidatedMigrationWhen());
    expect(() => migrate(db)).not.toThrow();
  } finally {
    closeConnection(db);
  }
});

// bb-fork(parent-mute): a crash after drizzle re-added the columns but before
// restore must still merge the staged values back.
it("heals staged columns when a run was interrupted after the consolidated migration applied", () => {
  const db = createConnection(":memory:");
  try {
    migrate(db);
    seedConsolidatedColumnRows(db, {
      mutedAt: 989898,
      startRef: "refs/heads/interrupted-late",
    });
    db.$client.exec(`
      ALTER TABLE threads RENAME COLUMN parent_notifications_muted_at TO _bb_parent_notifications_muted_at_pending;
      ALTER TABLE environments RENAME COLUMN start_ref TO _bb_start_ref_pending;
      ALTER TABLE threads ADD parent_notifications_muted_at integer;
      ALTER TABLE environments ADD start_ref text;
    `);

    expect(() => migrate(db)).not.toThrow();

    expectConsolidatedColumnValues(db, {
      mutedAt: 989898,
      startRef: "refs/heads/interrupted-late",
    });
    expect(() => migrate(db)).not.toThrow();
  } finally {
    closeConnection(db);
  }
});

// bb-fork(parent-mute): the real handoff hazard — a legacy ledger watermark
// crowds out an upstream migration with an older `when`, so drizzle's
// MAX(created_at) gate silently skips it. migrate() resolves its folder from
// its own module URL, so run the real pipeline against a temp package copy.
async function setupSyntheticWatermarkCopy(tmp: string): Promise<{
  syntheticTag: string;
  syntheticWhen: number;
  migrationsFolder: string;
  migrateAgainstTempFolder: (connection: DbConnection) => void;
  excludeConsolidatedMigrationRowsFromWatermark: (
    connection: DbConnection,
    migrationsFolder: string,
  ) => boolean;
}> {
  cpSync(join(PACKAGE_DIR, "src"), join(tmp, "src"), { recursive: true });
  cpSync(join(PACKAGE_DIR, "drizzle"), join(tmp, "drizzle"), {
    recursive: true,
  });
  const syntheticTag = "0156_synthetic_upstream_watermark";
  const syntheticWhen =
    LEGACY_PUBLISHED_CONSOLIDATED_MIGRATION_WHEN - 100_000_000;
  const migrationsFolder = join(tmp, "drizzle");
  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: Record<string, unknown>[];
  };
  journal.entries.push({
    idx: journal.entries.length,
    version: "6",
    when: syntheticWhen,
    tag: syntheticTag,
    breakpoints: true,
  });
  writeFileSync(journalPath, JSON.stringify(journal, null, 2));
  writeFileSync(
    join(migrationsFolder, `${syntheticTag}.sql`),
    "CREATE TABLE synthetic_upstream_probe (id text PRIMARY KEY);\n",
  );
  const { migrate: migrateAgainstTempFolder } = (await import(
    pathToFileURL(join(tmp, "src", "migrate.ts")).href
  )) as { migrate: (connection: DbConnection) => void };
  const { excludeConsolidatedMigrationRowsFromWatermark } = (await import(
    pathToFileURL(join(tmp, "src", "migrate-parent-notifications-mute.fork.ts"))
      .href
  )) as {
    excludeConsolidatedMigrationRowsFromWatermark: (
      connection: DbConnection,
      migrationsFolder: string,
    ) => boolean;
  };
  return {
    syntheticTag,
    syntheticWhen,
    migrationsFolder,
    migrateAgainstTempFolder,
    excludeConsolidatedMigrationRowsFromWatermark,
  };
}

function applyPublishedConsolidatedRow(db: DbConnection): void {
  db.$client
    .prepare<[number, number]>(
      "UPDATE __drizzle_migrations SET created_at = ? WHERE created_at = ?",
    )
    .run(
      LEGACY_PUBLISHED_CONSOLIDATED_MIGRATION_WHEN,
      consolidatedMigrationWhen(),
    );
}

// bb-fork(parent-mute): a synthetic upstream migration journaled below the
// applied fork watermark must be replayed through the exclusion + staging
// path, preserving the staged column data.
it("replays a synthetic upstream migration crowded out by the applied fork watermark", async () => {
  const tmp = mkdtempSync(join(PACKAGE_DIR, ".tmp-watermark-"));
  const db = createConnection(":memory:");
  try {
    const { syntheticWhen, migrateAgainstTempFolder } =
      await setupSyntheticWatermarkCopy(tmp);

    migrate(db);
    seedConsolidatedColumnRows(db, {
      mutedAt: 313131,
      startRef: "refs/heads/watermark",
    });
    applyPublishedConsolidatedRow(db);

    expect(() => migrateAgainstTempFolder(db)).not.toThrow();

    expect(tableExists(db, "synthetic_upstream_probe")).toBe(true);
    expectConsolidatedColumnValues(db, {
      mutedAt: 313131,
      startRef: "refs/heads/watermark",
    });
    const applied = appliedCreatedAts(db);
    expect(applied).toContain(syntheticWhen);
    expect(applied).toContain(consolidatedMigrationWhen());

    const appliedCount = db.$client
      .prepare<[], { count: number }>(
        "SELECT COUNT(*) AS count FROM __drizzle_migrations",
      )
      .get()?.count;
    expect(() => migrateAgainstTempFolder(db)).not.toThrow();
    expect(
      db.$client
        .prepare<[], { count: number }>(
          "SELECT COUNT(*) AS count FROM __drizzle_migrations",
        )
        .get()?.count,
    ).toBe(appliedCount);
  } finally {
    closeConnection(db);
    rmSync(tmp, { recursive: true, force: true });
  }
});

// bb-fork(parent-mute): a kill between the watermark exclusion delete and the
// drizzle replay leaves the consolidated columns intact with the ledger row
// gone; the next start must stage and heal through the same path.
it("heals when a crash lands between the watermark exclusion and the drizzle replay", async () => {
  const tmp = mkdtempSync(join(PACKAGE_DIR, ".tmp-watermark-crash-"));
  const db = createConnection(":memory:");
  try {
    const {
      syntheticWhen,
      migrationsFolder,
      migrateAgainstTempFolder,
      excludeConsolidatedMigrationRowsFromWatermark,
    } = await setupSyntheticWatermarkCopy(tmp);

    migrate(db);
    seedConsolidatedColumnRows(db, {
      mutedAt: 777777,
      startRef: "refs/heads/watermark-crash",
    });
    applyPublishedConsolidatedRow(db);

    expect(
      excludeConsolidatedMigrationRowsFromWatermark(db, migrationsFolder),
    ).toBe(true);
    expect(tableColumns(db, "threads")).toContain(
      "parent_notifications_muted_at",
    );
    expect(tableColumns(db, "environments")).toContain("start_ref");
    expect(appliedCreatedAts(db)).not.toContain(
      LEGACY_PUBLISHED_CONSOLIDATED_MIGRATION_WHEN,
    );

    expect(() => migrateAgainstTempFolder(db)).not.toThrow();

    expect(tableExists(db, "synthetic_upstream_probe")).toBe(true);
    expectConsolidatedColumnValues(db, {
      mutedAt: 777777,
      startRef: "refs/heads/watermark-crash",
    });
    expect(appliedCreatedAts(db)).toContain(syntheticWhen);
    expect(appliedCreatedAts(db)).toContain(consolidatedMigrationWhen());

    expect(() => migrateAgainstTempFolder(db)).not.toThrow();
  } finally {
    closeConnection(db);
    rmSync(tmp, { recursive: true, force: true });
  }
});
