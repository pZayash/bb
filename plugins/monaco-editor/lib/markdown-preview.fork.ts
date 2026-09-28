// bb-fork(md-preview): source/preview switching for Markdown files.
import type {
  MarkdownProps,
  PluginFileOpenerSource,
} from "@get-bb/plugin-sdk/app";

const MARKDOWN_PREVIEW_EXTENSIONS = new Set(["md", "markdown", "mdx"]);

export function isMarkdownPreviewPath(path: string): boolean {
  const name = path.split(/[/\\]/u).at(-1) ?? path;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return false;
  }
  return MARKDOWN_PREVIEW_EXTENSIONS.has(
    name.slice(dotIndex + 1).toLowerCase(),
  );
}

export type MarkdownPreviewViewMode = "source" | "preview";

type MarkdownPreviewDocument = NonNullable<
  MarkdownProps["experimental_document"]
>;

interface BuildMarkdownPreviewDocumentArgs {
  relativePath: string | null;
  rootPath: string | null;
  source: PluginFileOpenerSource;
}

export function buildMarkdownPreviewDocument({
  relativePath,
  rootPath,
  source,
}: BuildMarkdownPreviewDocumentArgs): MarkdownPreviewDocument | undefined {
  const threadId = source.threadId;
  if (
    rootPath === null ||
    relativePath === null ||
    threadId === null ||
    threadId.length === 0
  ) {
    return undefined;
  }
  if (source.kind === "workspace") {
    return source.environmentId === null
      ? undefined
      : {
          rootPath,
          target: {
            environmentId: source.environmentId,
            kind: "workspace",
            path: relativePath,
          },
          threadId,
        };
  }
  if (source.kind === "thread-storage") {
    return {
      rootPath,
      target: { kind: "thread-storage", path: relativePath, threadId },
      threadId,
    };
  }
  return undefined;
}
