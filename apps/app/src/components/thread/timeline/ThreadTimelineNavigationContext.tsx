import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PromptMentionLinkResolver } from "@bb/client-core";
import type { ThreadTimelineLocalFileLinkHandler } from "./types.js";
import type { MarkdownLinkRouting } from "@/components/ui/markdown-link-routing";
import { buildThreadHostFileContentUrl } from "@/lib/file-content-urls";

interface ThreadTimelineNavigation {
  environmentId: string | null;
  // bb-fork(file-links): extra roots for relative file refs, e.g. the project checkout behind a worktree.
  fallbackRelativeRoots?: readonly string[];
  hostId: string | null;
  onOpenLocalFileLink: ThreadTimelineLocalFileLinkHandler;
  resolveMentionLink: PromptMentionLinkResolver;
  threadId?: string;
  workspaceRootPath: string | undefined;
}

const ThreadTimelineNavigationContext =
  createContext<ThreadTimelineNavigation | null>(null);

export function ThreadTimelineNavigationProvider({
  children,
  environmentId,
  fallbackRelativeRoots,
  hostId,
  onOpenLocalFileLink,
  resolveMentionLink,
  threadId,
  workspaceRootPath,
}: ThreadTimelineNavigation & { children: ReactNode }) {
  const navigation = useMemo<ThreadTimelineNavigation>(
    () => ({
      environmentId,
      fallbackRelativeRoots,
      hostId,
      onOpenLocalFileLink,
      resolveMentionLink,
      threadId,
      workspaceRootPath,
    }),
    [
      environmentId,
      fallbackRelativeRoots,
      hostId,
      onOpenLocalFileLink,
      resolveMentionLink,
      threadId,
      workspaceRootPath,
    ],
  );

  return (
    <ThreadTimelineNavigationContext.Provider value={navigation}>
      {children}
    </ThreadTimelineNavigationContext.Provider>
  );
}

export function useThreadTimelineNavigation(): ThreadTimelineNavigation | null {
  return useContext(ThreadTimelineNavigationContext);
}

export function useMessageLinkRouting(
  threadId: string | undefined,
): MarkdownLinkRouting | undefined {
  const navigation = useThreadTimelineNavigation();
  const hostId = navigation?.hostId ?? null;
  const onOpenLocalFileLink = navigation?.onOpenLocalFileLink;
  const workspaceRootPath = navigation?.workspaceRootPath;
  const fallbackRelativeRoots = navigation?.fallbackRelativeRoots;
  return useMemo(() => {
    if (onOpenLocalFileLink === undefined && threadId === undefined) {
      return undefined;
    }
    const relativePaths =
      workspaceRootPath === undefined
        ? undefined
        : { baseDir: workspaceRootPath, rootPath: workspaceRootPath };
    const routing: MarkdownLinkRouting = {};
    if (threadId !== undefined) {
      routing.localImage = {
        absolutePaths: { kind: "trusted-host" },
        resolveSrc: ({ path }) => buildThreadHostFileContentUrl(threadId, path),
        ...(relativePaths === undefined ? {} : { relativePaths }),
      };
    }
    if (onOpenLocalFileLink !== undefined) {
      routing.localFile = {
        absoluteLinks: { kind: "trusted-host" },
        hostId,
        onOpenLink: onOpenLocalFileLink,
        ...(relativePaths === undefined
          ? {}
          : { relativeLinks: relativePaths }),
        // bb-fork(file-links): extra roots, e.g. the project checkout behind a worktree.
        ...(fallbackRelativeRoots === undefined ||
        fallbackRelativeRoots.length === 0
          ? {}
          : { fallbackRelativeRoots }),
      };
    }
    return routing;
  }, [
    fallbackRelativeRoots,
    hostId,
    onOpenLocalFileLink,
    threadId,
    workspaceRootPath,
  ]);
}
