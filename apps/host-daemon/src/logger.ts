import type { Logger } from "@bb/logger";

// bb-fork(log-noise): high-frequency periodic detail is logged at optional trace.
export type HostDaemonLogger = Pick<
  Logger,
  "debug" | "info" | "warn" | "error"
> & {
  trace?: Logger["trace"];
};
