import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  type PluginThreadActionTarget,
} from "@get-bb/plugin-sdk";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { useCreateChildThread } from "@/components/thread/useCreateChildThread";
import { resolveThread } from "@/lib/cached-thread";

export default definePluginApp((app) => {
  app.slots.experimental_threadAction({
    id: "newChildThread",
    group: GROUPS.organize,
    order: 15,
    title: "New child thread",
    icon: "MessageSquarePlus",
    useData: function useSpawnChild() {
      const queryClient = useQueryClient();
      const createChild = useCreateChildThread();
      return useCallback(
        async (target: PluginThreadActionTarget) =>
          createChild(await resolveThread(queryClient, target.id)),
        [createChild, queryClient],
      );
    },
    item: ({ thread, data: spawnChild }) =>
      thread.archivedAt !== null || thread.environment === null
        ? null
        : {
            label: "New child thread",
            icon: "MessageSquarePlus",
            run: () => spawnChild(thread).then(() => undefined),
          },
  });
});
