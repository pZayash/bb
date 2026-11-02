// bb-fork(thread-start-ref): the commit summary the start-commit picker reads.
// bb-fork(thread-start-ref): upstream keeps the workspace status reads in the git
// bb-fork(thread-start-ref): plugin, so the fork's daemon command owns its own shape.
import { z } from "zod";

export const workspaceCommitSummarySchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authoredAt: z.number(),
});
export type WorkspaceCommitSummary = z.infer<
  typeof workspaceCommitSummarySchema
>;
