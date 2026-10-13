// bb-fork(inline-vis-export): document export menu (Save source / Word / Print)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { toast } from "sonner";

type PreviewSource = "workspace" | "thread-storage";

const EXPORT_ENDPOINT = "/api/v1/files/export";
const PRINT_IFRAME_SANDBOX = "allow-scripts allow-modals";
const CAPTURE_IFRAME_SANDBOX = "allow-scripts";
const PRINT_IFRAME_REMOVE_DELAY_MS = 60_000;
const CAPTURE_TIMEOUT_MS = 15_000;
const POST_MESSAGE_CHANNEL = "bb-document-export";
const RENDERED_CONTENT_PATTERN = /<(?:canvas|svg|script)\b/i;

function encodePathSegments(file: string): string {
  return file.split("/").map(encodeURIComponent).join("/");
}

const PREVIEW_ROUTE = {
  workspace: "worktree/files",
  "thread-storage": "thread-storage/files",
} as const satisfies Record<PreviewSource, string>;

function buildPreviewUrl(
  threadId: string,
  file: string,
  source: PreviewSource,
): string {
  return `/api/v1/threads/${encodeURIComponent(threadId)}/${PREVIEW_ROUTE[source]}/${encodePathSegments(file)}`;
}

function artifactBaseName(file: string): string {
  const name = file.split("/").pop() ?? file;
  const extensionIndex = name.lastIndexOf(".");
  return extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function printHtmlDocument(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", PRINT_IFRAME_SANDBOX);
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.position = "fixed";
  iframe.style.top = "0";
  iframe.style.left = "0";
  iframe.style.width = "1024px";
  iframe.style.height = "768px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.srcdoc = html;
  document.body.append(iframe);
  window.setTimeout(() => iframe.remove(), PRINT_IFRAME_REMOVE_DELAY_MS);
}

async function requestExport(input: {
  baseHref: string;
  content: string;
  fileName: string;
  format: "docx" | "print" | "capture";
  sourceKind: "html" | "markdown";
}): Promise<Blob> {
  const response = await fetch(EXPORT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseHref: input.baseHref,
      content: input.content,
      filename: input.fileName,
      format: input.format,
      sourceKind: input.sourceKind,
    }),
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      raw.replace(/\s+/g, " ").trim() || `Export failed (${response.status})`,
    );
  }
  return response.blob();
}

function hasRenderedContent(content: string): boolean {
  return RENDERED_CONTENT_PATTERN.test(content);
}

function runCaptureFrame(html: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", CAPTURE_IFRAME_SANDBOX);
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "1024px";
    iframe.style.height = "768px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";

    let settled = false;
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    };
    const finish = (result: { html: string } | { error: string }): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if ("html" in result) {
        resolve(result.html);
        return;
      }
      reject(new Error(result.error));
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframe.contentWindow) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null) return;
      const message = data as {
        channel?: unknown;
        ok?: unknown;
        html?: unknown;
        error?: unknown;
      };
      if (message.channel !== POST_MESSAGE_CHANNEL) return;
      if (message.ok === true && typeof message.html === "string") {
        finish({ html: message.html });
        return;
      }
      finish({
        error:
          typeof message.error === "string"
            ? message.error
            : "Rendered capture failed",
      });
    };
    const timeout = window.setTimeout(() => {
      finish({ error: "Rendered capture timed out" });
    }, CAPTURE_TIMEOUT_MS);

    window.addEventListener("message", onMessage);
    iframe.srcdoc = html;
    document.body.append(iframe);
  });
}

function reportExportError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : String(error));
}

export function InlineVisExportMenu({
  content,
  file,
  kind,
  threadId,
  source,
}: {
  content: string;
  file: string;
  kind: "html" | "markdown";
  threadId: string;
  source: PreviewSource;
}) {
  const [busy, setBusy] = useState(false);
  const baseName = artifactBaseName(file);
  const sourceExtension = kind === "markdown" ? "md" : "html";
  const sourceMimeType = kind === "markdown" ? "text/markdown" : "text/html";
  const baseHref = new URL(
    buildPreviewUrl(threadId, file, source),
    window.location.href,
  ).toString();

  const exportDocument = (format: "print") => {
    setBusy(true);
    void requestExport({
      baseHref,
      content,
      fileName: file,
      format,
      sourceKind: kind,
    })
      .then(async (blob) => {
        printHtmlDocument(await blob.text());
      })
      .catch(reportExportError)
      .finally(() => {
        setBusy(false);
      });
  };

  const exportWord = () => {
    setBusy(true);
    void (async () => {
      try {
        let wordContent = content;
        let wordSourceKind: "html" | "markdown" = kind;
        if (kind === "html" && hasRenderedContent(content)) {
          try {
            const captureBlob = await requestExport({
              baseHref,
              content,
              fileName: file,
              format: "capture",
              sourceKind: kind,
            });
            wordContent = await runCaptureFrame(await captureBlob.text());
            wordSourceKind = "html";
          } catch {
            wordContent = content;
            wordSourceKind = kind;
          }
        }
        const blob = await requestExport({
          baseHref,
          content: wordContent,
          fileName: file,
          format: "docx",
          sourceKind: wordSourceKind,
        });
        downloadBlob(blob, `${baseName}.docx`);
      } catch (error) {
        reportExportError(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={`Export ${file}`}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon name="Download" aria-hidden className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            downloadBlob(
              new Blob([content], { type: sourceMimeType }),
              `${baseName}.${sourceExtension}`,
            );
          }}
        >
          Save {kind === "markdown" ? "Markdown" : "HTML"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportWord}>Word (.docx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportDocument("print")}>
          Печать
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
