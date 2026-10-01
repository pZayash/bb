import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  definePluginApp,
  experimental_Diff,
  experimental_useCodeTheme,
  Markdown,
  useRpc,
  type PluginFileOpenerProps,
} from "@get-bb/plugin-sdk/app";
import type * as MonacoNs from "monaco-editor";
import type { rpcContract } from "./server.js";
import { CLAIMED_EXTENSIONS, languageForPath } from "./lib/languages.js";
import {
  loadMonaco,
  overflowWidgetsNode,
  setOverflowWidgetsTheme,
} from "./lib/monaco-loader.js";
import { applyCodeTheme, editorBackground } from "./lib/monaco-theme.js";
import { cn } from "@/lib/utils";
import { FileToolbar, type SaveIndicator } from "./components/FileToolbar.js";
import { FileTreePanel } from "./components/FileTreePanel.js";
// bb-fork(file-diff): unified/split diff of the open file against Git.
import {
  FileDiffControls,
  type FileDiffViewMode,
} from "./components/FileDiffControls.fork.js";
import { FileDiffBody } from "./components/FileDiffBody.fork.js";
import { useFileDiff } from "./lib/file-diff.fork.js";
// bb-fork(file-diff-base): the open request can pin the editor's diff base.
import { THREAD_START_SELECTION } from "./lib/file-diff-selection.fork.js";
// bb-fork(md-preview): rendered Markdown preview next to the editor.
import { MarkdownPreviewToggle } from "./components/MarkdownPreviewToggle.fork.js";
import {
  buildMarkdownPreviewDocument,
  isMarkdownPreviewPath,
  type MarkdownPreviewViewMode,
} from "./lib/markdown-preview.fork.js";
import type { FlatEntry } from "./lib/file-tree.js";
import {
  EDITOR_COMMANDS,
  forgetEditor,
  isCommandAvailable,
  markEditorActive,
  runEditorCommand,
} from "./lib/editor-commands.js";

type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

// bb-fork(md-preview): match the built-in preview's Markdown content width.
const MARKDOWN_PREVIEW_WRAPPER_STYLE = {
  "--md-content-w": "100cqi",
} as CSSProperties;

function revealLineRange(
  editor: MonacoNs.editor.IStandaloneCodeEditor,
  lineRange: PluginFileOpenerProps["experimental_lineRange"],
) {
  const model = editor.getModel();
  if (lineRange == null || model === null) return;
  const startLineNumber = Math.min(
    lineRange.startLineNumber,
    model.getLineCount(),
  );
  const endLineNumber = Math.min(lineRange.endLineNumber, model.getLineCount());
  const selection = {
    startLineNumber,
    startColumn: 1,
    endLineNumber,
    endColumn: model.getLineMaxColumn(endLineNumber),
  };
  editor.setSelection(selection);
  editor.revealRangeInCenter(selection);
}

function MonacoFileOpener({
  path,
  source,
  Original,
  experimental_diffIntent,
  experimental_lineRange,
}: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const codeTheme = experimental_useCodeTheme();
  const codeThemeRef = useRef(codeTheme);
  codeThemeRef.current = codeTheme;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<typeof MonacoNs | null>(null);
  const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);

  const navigationRef = useRef({ path, lineRange: experimental_lineRange });

  const [activePath, setActivePath] = useState(path);
  useEffect(() => setActivePath(path), [path]);

  const sha256Ref = useRef<string | null>(null);
  const saveStateRef = useRef<SaveState>({ kind: "clean" });

  const [saveState, setSaveStateValue] = useState<SaveState>({ kind: "clean" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [tree, setTree] = useState<{
    entries: readonly FlatEntry[];
    root: string;
    truncated: boolean;
    isLoading: boolean;
    error: string | null;
  }>({
    entries: [],
    root: "",
    truncated: false,
    isLoading: false,
    error: null,
  });
  const [status, setStatus] = useState<
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "delegate"; reason: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  // bb-fork(md-preview): document identity for rendering the Markdown preview.
  const [fileIdentity, setFileIdentity] = useState<{
    relativePath: string;
    rootPath: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<MarkdownPreviewViewMode>("source");
  const [previewContent, setPreviewContent] = useState("");
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // bb-fork(file-diff): diff mode state for the open file.
  const [isDiffActive, setIsDiffActive] = useState(
    experimental_diffIntent != null,
  );
  // bb-fork(diff-rail): the diff's scroller backs its change map and navigation.
  const [diffScrollElement, setDiffScrollElement] =
    useState<HTMLDivElement | null>(null);
  const [diffSelection, setDiffSelection] = useState<string | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<FileDiffViewMode>("split");
  const fileDiff = useFileDiff({
    enabled: isDiffActive,
    path: activePath,
    rpc,
    selection: diffSelection,
    source,
  });

  const setSaveState = useCallback((next: SaveState) => {
    saveStateRef.current = next;
    setSaveStateValue(next);
  }, []);

  // bb-fork(md-preview): a newly selected file always opens in the editor.
  useEffect(() => {
    setViewMode("source");
  }, [activePath]);

  // bb-fork(file-diff): a newly selected file always opens in the editor.
  useEffect(() => {
    setIsDiffActive(false);
    setDiffSelection(null);
  }, [activePath]);

  // bb-fork(file-diff-open): apply the requested diff view; a null intent changes nothing.
  useEffect(() => {
    if (experimental_diffIntent == null) return;
    setDiffViewMode(experimental_diffIntent.view);
    // bb-fork(file-diff-base): the request's comparison decides the base until the user does.
    setDiffSelection(
      experimental_diffIntent.base === "thread_start"
        ? THREAD_START_SELECTION
        : null,
    );
    setIsDiffActive(true);
  }, [experimental_diffIntent]);

  const writeEditorContent = useCallback(
    async (expectedSha256: string | null) => {
      const editor = editorRef.current;
      if (!editor) return;
      setSaveState({ kind: "saving" });
      try {
        const result = await rpc.call("write", {
          path: activePath,
          source,
          content: editor.getValue(),
          expectedSha256,
        });
        if (result.outcome === "conflict") {
          setSaveState({ kind: "conflict" });
          return;
        }
        sha256Ref.current = result.sha256;
        setSaveState({ kind: "clean" });
      } catch (error) {
        setSaveState({
          kind: "error",
          message: error instanceof Error ? error.message : "Save failed",
        });
      }
    },
    [activePath, rpc, setSaveState, source],
  );

  const save = useCallback(async () => {
    if (saveStateRef.current.kind === "saving") return;
    await writeEditorContent(sha256Ref.current);
  }, [writeEditorContent]);

  const saveRef = useRef(save);
  saveRef.current = save;

  const reloadFromDisk = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setIsRefreshing(true);
    try {
      const file = await rpc.call("read", { path: activePath, source });
      if (file.kind !== "text") return;
      sha256Ref.current = file.sha256;
      setFileIdentity({
        relativePath: file.relativePath,
        rootPath: file.rootPath,
      });
      editor.setValue(file.content);
      setSaveState({ kind: "clean" });
    } catch (error) {
      setSaveState({
        kind: "error",
        message: error instanceof Error ? error.message : "Reload failed",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [activePath, rpc, setSaveState, source]);

  const treeRequestedRef = useRef(false);
  useEffect(() => {
    if (!isFilesOpen || treeRequestedRef.current) return;
    treeRequestedRef.current = true;
    let cancelled = false;
    setTree((current) => ({ ...current, isLoading: true, error: null }));
    void rpc
      .call("tree", { source })
      .then((result) => {
        if (cancelled) return;
        setTree({
          entries: result.entries,
          root: result.root,
          truncated: result.truncated,
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        treeRequestedRef.current = false;
        setTree({
          entries: [],
          root: "",
          truncated: false,
          isLoading: false,
          error:
            error instanceof Error ? error.message : "Could not list files",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isFilesOpen, rpc, source]);

  const openFromTree = useCallback(
    (next: string) => {
      if (next === activePath) return;
      if (saveStateRef.current.kind === "dirty") {
        setPendingOpen(next);
        return;
      }
      setActivePath(next);
    },
    [activePath],
  );

  const requestRefresh = useCallback(() => {
    if (saveStateRef.current.kind === "dirty") {
      setPendingDiscard(true);
      return;
    }
    void reloadFromDisk();
  }, [reloadFromDisk]);

  const overwrite = useCallback(async () => {
    sha256Ref.current = null;
    await writeEditorContent(null);
  }, [writeEditorContent]);

  useEffect(() => {
    let disposed = false;
    setStatus({ kind: "loading" });
    setFileIdentity(null);

    void (async () => {
      try {
        const [{ baseUrl }, file] = await Promise.all([
          rpc.call("assets"),
          rpc.call("read", { path: activePath, source }),
        ]);
        if (disposed) return;
        if (file.kind === "unsupported") {
          setStatus({ kind: "delegate", reason: file.reason });
          return;
        }
        setFileIdentity({
          relativePath: file.relativePath,
          rootPath: file.rootPath,
        });

        const monaco = await loadMonaco(baseUrl);
        if (disposed) return;
        const container = containerRef.current;
        if (!container) return;
        monacoRef.current = monaco;

        sha256Ref.current = file.sha256;
        const applied = applyCodeTheme(monaco, codeThemeRef.current);
        setOverflowWidgetsTheme(applied.base);
        const editor = monaco.editor.create(container, {
          value: file.content,
          language: languageForPath(activePath),
          automaticLayout: true,
          lineNumbers: "on",
          theme: applied.name,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineHeight: 20,
          fontFamily:
            getComputedStyle(document.documentElement).getPropertyValue(
              "--font-mono",
            ) || undefined,
          fixedOverflowWidgets: true,
          overflowWidgetsDomNode: overflowWidgetsNode(),
        });
        editorRef.current = editor;
        if (activePath === navigationRef.current.path) {
          revealLineRange(editor, navigationRef.current.lineRange);
        }
        const active = {
          editor,
          absolutePath: file.absolutePath,
          relativePath: file.relativePath,
        };
        markEditorActive(active);
        editor.onDidFocusEditorWidget(() => markEditorActive(active));
        setStatus({ kind: "ready" });

        editor.onDidChangeModelContent(() => {
          if (saveStateRef.current.kind === "clean") {
            setSaveState({ kind: "dirty" });
          }
          // bb-fork(md-preview): keep the rendered preview in sync with disk.
          if (viewModeRef.current === "preview") {
            setPreviewContent(editor.getValue());
          }
        });
        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => void saveRef.current(),
        );
      } catch (error) {
        if (disposed) return;
        setStatus({
          kind: "error",
          message:
            error instanceof Error ? error.message : "Could not open this file",
        });
      }
    })();

    return () => {
      disposed = true;
      const editor = editorRef.current;
      editorRef.current = null;
      if (editor === null) return;
      forgetEditor(editor);
      const model = editor.getModel();
      editor.dispose();
      if (model !== null && !model.isDisposed()) model.dispose();
    };
  }, [activePath, rpc, setSaveState, source]);

  useEffect(() => {
    navigationRef.current = { path, lineRange: experimental_lineRange };
    const editor = editorRef.current;
    if (editor !== null && activePath === path) {
      revealLineRange(editor, experimental_lineRange);
    }
  }, [activePath, path, experimental_lineRange]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco === null) return;
    const applied = applyCodeTheme(monaco, codeTheme);
    editorRef.current?.updateOptions({ theme: applied.name });
    setOverflowWidgetsTheme(applied.base);
  }, [codeTheme, status]);

  // bb-fork(md-preview): derive the Markdown preview state for the open file.
  const canPreview =
    status.kind === "ready" && isMarkdownPreviewPath(activePath);
  const markdownPreviewDocument = useMemo(
    () =>
      canPreview && fileIdentity !== null
        ? buildMarkdownPreviewDocument({
            relativePath: fileIdentity.relativePath,
            rootPath: fileIdentity.rootPath,
            source,
          })
        : undefined,
    [canPreview, fileIdentity, source],
  );
  const isPreviewVisible =
    canPreview && viewMode === "preview" && !isDiffActive;
  const handleViewModeChange = useCallback((next: MarkdownPreviewViewMode) => {
    if (next === "preview") {
      setPreviewContent(editorRef.current?.getValue() ?? "");
    }
    setViewMode(next);
  }, []);

  if (status.kind === "delegate") return <Original />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isFilesOpen ? (
        <FileTreePanel
          activePath={activePath}
          background={editorBackground(codeTheme.theme)}
          entries={tree.entries}
          error={tree.error}
          isLoading={tree.isLoading}
          root={tree.root}
          onClose={() => setIsFilesOpen(false)}
          onOpenFile={openFromTree}
          truncated={tree.truncated}
        />
      ) : null}
      <FileToolbar
        path={activePath}
        indicator={indicatorFor(saveState, status)}
        isRefreshing={isRefreshing}
        onRefresh={requestRefresh}
        isFilesOpen={isFilesOpen}
        onToggleFiles={() => setIsFilesOpen((open) => !open)}
        previewToggle={
          canPreview ? (
            <MarkdownPreviewToggle
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />
          ) : undefined
        }
        diffControls={
          source.kind === "workspace" ? (
            <FileDiffControls
              isActive={isDiffActive}
              onSelectionChange={setDiffSelection}
              onToggle={() => setIsDiffActive((active) => !active)}
              onViewModeChange={setDiffViewMode}
              options={
                fileDiff.status === "ready" || fileDiff.status === "loading"
                  ? fileDiff.options
                  : []
              }
              selection={
                diffSelection ??
                (fileDiff.status === "ready" ? fileDiff.selection : null)
              }
              scrollElement={diffScrollElement}
              state={fileDiff}
              viewMode={diffViewMode}
            />
          ) : undefined
        }
      />
      <Notice
        onDiscardCancel={() => setPendingDiscard(false)}
        onDiscardConfirm={() => {
          setPendingDiscard(false);
          void reloadFromDisk();
        }}
        onOpenCancel={() => setPendingOpen(null)}
        onOpenConfirm={() => {
          const next = pendingOpen;
          setPendingOpen(null);
          if (next !== null) setActivePath(next);
        }}
        onOverwrite={() => void overwrite()}
        onReload={() => void reloadFromDisk()}
        pendingDiscard={pendingDiscard}
        pendingOpen={pendingOpen}
        saveState={saveState}
        status={status}
      />
      <div
        ref={containerRef}
        className={cn(
          "min-h-0 flex-1",
          (isPreviewVisible || isDiffActive) && "hidden",
        )}
      />
      {isDiffActive ? (
        <FileDiffBody
          onScrollElementChange={setDiffScrollElement}
          path={activePath}
          scrollElement={diffScrollElement}
          state={fileDiff}
          viewMode={diffViewMode}
        />
      ) : null}
      {isPreviewVisible ? (
        <div
          className="@container/page min-h-0 flex-1 overflow-y-auto bg-background"
          style={MARKDOWN_PREVIEW_WRAPPER_STYLE}
        >
          <div className="px-4 py-4">
            <Markdown
              content={previewContent}
              {...(markdownPreviewDocument === undefined
                ? {}
                : { experimental_document: markdownPreviewDocument })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function indicatorFor(
  saveState: SaveState,
  status: { kind: string },
): SaveIndicator {
  if (status.kind === "error") return "error";
  switch (saveState.kind) {
    case "saving":
      return "saving";
    case "dirty":
      return "dirty";
    case "error":
    case "conflict":
      return "error";
    default:
      return "clean";
  }
}

function Notice({
  onDiscardCancel,
  onDiscardConfirm,
  onOpenCancel,
  onOpenConfirm,
  onOverwrite,
  onReload,
  pendingDiscard,
  pendingOpen,
  saveState,
  status,
}: {
  onDiscardCancel: () => void;
  onDiscardConfirm: () => void;
  onOpenCancel: () => void;
  onOpenConfirm: () => void;
  onOverwrite: () => void;
  onReload: () => void;
  pendingDiscard: boolean;
  pendingOpen: string | null;
  saveState: SaveState;
  status: { kind: string; message?: string };
}) {
  if (status.kind === "error") {
    return <NoticeRow tone="error">{status.message}</NoticeRow>;
  }
  if (saveState.kind === "conflict") {
    return (
      <NoticeRow tone="error">
        This file changed on disk since you opened it.
        <NoticeAction onClick={onReload}>Reload</NoticeAction>
        <NoticeAction onClick={onOverwrite}>Overwrite</NoticeAction>
      </NoticeRow>
    );
  }
  if (pendingOpen !== null) {
    return (
      <NoticeRow tone="warning">
        Open {pendingOpen.split("/").at(-1)} and discard your unsaved changes?
        <NoticeAction onClick={onOpenConfirm}>Discard and open</NoticeAction>
        <NoticeAction onClick={onOpenCancel}>Cancel</NoticeAction>
      </NoticeRow>
    );
  }
  if (pendingDiscard) {
    return (
      <NoticeRow tone="warning">
        Reload from disk and discard your unsaved changes?
        <NoticeAction onClick={onDiscardConfirm}>Discard</NoticeAction>
        <NoticeAction onClick={onDiscardCancel}>Cancel</NoticeAction>
      </NoticeRow>
    );
  }
  if (saveState.kind === "error") {
    return <NoticeRow tone="error">{saveState.message}</NoticeRow>;
  }
  return null;
}

function NoticeRow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "error" | "warning";
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-2 px-4 py-1.5 text-xs",
        tone === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-surface-recessed text-foreground",
      )}
    >
      {children}
    </div>
  );
}

function NoticeAction({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-sm font-medium underline underline-offset-2 hover:opacity-80 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

export default definePluginApp((app) => {
  app.slots.fileOpener({
    id: "monaco",
    title: "File Editor",
    extensions: CLAIMED_EXTENSIONS,
    component: MonacoFileOpener,
  });

  for (const command of EDITOR_COMMANDS) {
    app.commands.register({
      id: command.id,
      title: command.title,
      isAvailable: () => isCommandAvailable(command),
      run: () => runEditorCommand(command),
    });
  }
});
