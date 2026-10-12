import type { DbConnection } from "../../src/index.js";

export function dropPluginEnabledFollowsDefaultColumn(db: DbConnection): void {
  const columns = db.$client
    .prepare<[], { name: string }>("PRAGMA table_info(plugins)")
    .all();
  if (columns.some((column) => column.name === "enabled_follows_default")) {
    db.$client.exec("ALTER TABLE plugins DROP COLUMN enabled_follows_default");
  }
}

export function rewindThreadPruningWork(db: DbConnection): void {
  db.$client.exec(`
    DROP TABLE IF EXISTS thread_pruning_work;
    DELETE FROM __drizzle_migrations WHERE created_at >= 1791399370294;
  `);
  const columns = db.$client
    .prepare<[], { name: string }>("PRAGMA table_info(thread_pruning_cursors)")
    .all();
  if (columns.some((column) => column.name === "work_revision"))
    db.$client.exec(
      "ALTER TABLE thread_pruning_cursors DROP COLUMN work_revision",
    );
}

export function dropIdleLifecycleIndexes(db: DbConnection): void {
  for (const name of [
    "hosts_pending_provider_idx",
    "threads_deleted_cleanup_idx",
  ]) {
    db.$client.exec(`DROP INDEX IF EXISTS ${name}`);
  }
}

export function dropQueuedMessageEditHeldUntilColumn(db: DbConnection): void {
  const columns = db.$client
    .prepare<[], { name: string }>("PRAGMA table_info(queued_thread_messages)")
    .all();
  if (columns.some((column) => column.name === "edit_held_until")) {
    db.$client.exec(
      "ALTER TABLE queued_thread_messages DROP COLUMN edit_held_until",
    );
  }
}

// bb-fork(merge-0142): the consolidated migration adds columns the pane-focus
// rewind must undo so re-running 0142 is idempotent in tests.
export function dropEnvironmentStartRefColumn(db: DbConnection): void {
  const columns = db.$client
    .prepare<[], { name: string }>("PRAGMA table_info(environments)")
    .all();
  if (columns.some((column) => column.name === "start_ref")) {
    db.$client.exec("ALTER TABLE environments DROP COLUMN start_ref");
  }
}

export function dropParentNotificationsMutedAtColumn(
  db: DbConnection,
): void {
  const columns = db.$client
    .prepare<[], { name: string }>("PRAGMA table_info(threads)")
    .all();
  if (columns.some((column) => column.name === "parent_notifications_muted_at")) {
    db.$client.exec(
      "ALTER TABLE threads DROP COLUMN parent_notifications_muted_at",
    );
  }
}
