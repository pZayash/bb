import coreThreadActions from "@/core-contributions/thread-actions";
// bb-fork(fork/spawn-child): the fork's own core thread actions live beside bb's.
import forkThreadActions from "@/core-contributions/thread-actions.fork";
import { collectCoreContributionSlots } from "@/lib/core-contributions";

export const CORE_THREAD_ACTIONS = [
  ...collectCoreContributionSlots(coreThreadActions, "threadActions"),
  ...collectCoreContributionSlots(forkThreadActions, "threadActions"),
];
