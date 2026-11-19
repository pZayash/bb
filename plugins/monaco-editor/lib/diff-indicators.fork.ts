// bb-fork(file-diff): gutter bars and overview marks on the file's changed lines.
import type * as MonacoNs from "monaco-editor";
import type { DiffRegion } from "./diff-regions.fork.js";

const STYLE_ELEMENT_ID = "bb-monaco-diff-indicators";

const INDICATOR_STYLES = `
.bb-diff-indicator {
  border-left: 3px solid var(--timeline-accent);
}
.bb-diff-indicator--added {
  border-left-color: var(--diff-added);
}
.bb-diff-indicator--deleted {
  border-left-color: var(--diff-removed);
}
`;

const RULER_COLOR: Record<DiffRegion["kind"], string> = {
  added: "var(--diff-added)",
  deleted: "var(--diff-removed)",
  modified: "var(--timeline-accent)",
};

function ensureIndicatorStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID) !== null) return;
  const element = doc.createElement("style");
  element.id = STYLE_ELEMENT_ID;
  element.textContent = INDICATOR_STYLES;
  doc.head.append(element);
}

export function applyDiffIndicators(
  monaco: typeof MonacoNs,
  editor: MonacoNs.editor.IStandaloneCodeEditor,
  regions: readonly DiffRegion[],
): MonacoNs.editor.IEditorDecorationsCollection {
  const doc = editor.getDomNode?.()?.ownerDocument;
  if (doc !== undefined) ensureIndicatorStyles(doc);
  return editor.createDecorationsCollection(
    regions.map((region) => ({
      options: {
        isWholeLine: true,
        linesDecorationsClassName: `bb-diff-indicator bb-diff-indicator--${region.kind}`,
        overviewRuler: {
          color: RULER_COLOR[region.kind],
          position: monaco.editor.OverviewRulerLane.Center,
        },
      },
      range: new monaco.Range(region.startLine, 1, region.endLine, 1),
    })),
  );
}
