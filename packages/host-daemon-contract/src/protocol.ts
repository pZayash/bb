// bb-fork: upstream version + 2 while the fork carries wire deltas
// (workspace.commits, terminal shell enumeration); resolve merge conflicts
// as max(upstream) + 2.
export const HOST_DAEMON_PROTOCOL_VERSION = 236 as const;

export const HOST_ARTIFACT_MAX_BYTES = 256 * 1024 * 1024;

export const HOST_DAEMON_TERMINAL_EXIT_RETENTION_MS = 30 * 60 * 1000;
