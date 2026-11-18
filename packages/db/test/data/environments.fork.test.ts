// bb-fork(thread-start-ref): the pinned start commit is written once and its
// bb-fork(thread-start-ref): changes notify like other metadata.
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { noopNotifier } from "../../src/notifier.js";
import type { DbNotifier } from "../../src/notifier.js";
import { createEnvironment } from "../../src/data/environments.js";
import {
  recordEnvironmentStartRefOnce,
  updateEnvironmentMetadata,
} from "../../src/data/environment-lifecycle.js";
import { environments } from "../../src/schema.js";
import { createProject } from "../../src/data/projects.js";
import { upsertHost } from "../../src/data/hosts.js";
import { createMigratedConnection } from "../../src/testing.js";

function setup() {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, {
    name: "test-host",
  });
  const { project } = createProject(db, noopNotifier, {
    name: "test-project",
    source: { type: "local_path", hostId: host.id, path: "/tmp/test" },
  });
  return { db, host, project };
}

function createNotifierSpy(): DbNotifier {
  return {
    notifyThread: vi.fn(),
    notifyProject: vi.fn(),
    notifyEnvironment: vi.fn(),
    notifyHost: vi.fn(),
    notifySystem: vi.fn(),
  };
}

describe("environments", () => {
  it("notifies when the pinned start commit changes", () => {
    const { db, host, project } = setup();
    const environment = createEnvironment(db, noopNotifier, {
      providerOwnsPath: false,
      projectId: project.id,
      hostId: host.id,
      branchName: "main",
      defaultBranch: "main",
      status: "ready",
    });
    const notifier = createNotifierSpy();

    const updated = updateEnvironmentMetadata(db, notifier, environment.id, {
      startRef: "abc1234567890",
    });

    expect(updated).toMatchObject({ startRef: "abc1234567890" });
    expect(notifier.notifyEnvironment).toHaveBeenCalledWith(environment.id, [
      "metadata-changed",
    ]);

    vi.mocked(notifier.notifyEnvironment).mockClear();
    updateEnvironmentMetadata(db, notifier, environment.id, {
      startRef: "abc1234567890",
    });
    expect(notifier.notifyEnvironment).not.toHaveBeenCalled();
  });

  it("pins the start commit once and never overwrites it", () => {
    const { db, host, project } = setup();
    const environment = createEnvironment(db, noopNotifier, {
      providerOwnsPath: false,
      projectId: project.id,
      hostId: host.id,
      branchName: "main",
      defaultBranch: "main",
      status: "ready",
    });
    const notifier = createNotifierSpy();

    expect(
      recordEnvironmentStartRefOnce(db, notifier, environment.id, "abc1234567890"),
    ).toMatchObject({ startRef: "abc1234567890" });

    const second = recordEnvironmentStartRefOnce(
      db,
      notifier,
      environment.id,
      "def4567890123",
    );
    expect(second).toBeNull();
    expect(
      db
        .select({ startRef: environments.startRef })
        .from(environments)
        .where(eq(environments.id, environment.id))
        .get(),
    ).toEqual({ startRef: "abc1234567890" });

    expect(
      recordEnvironmentStartRefOnce(db, notifier, environment.id, null),
    ).toBeNull();
    expect(
      recordEnvironmentStartRefOnce(db, notifier, "env_missing", "abc"),
    ).toBeNull();
  });
});
