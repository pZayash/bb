import { getDiffShadowRoots } from "@bb/shared-ui/git-diff/patch-text";
import { useEffect, useId, useMemo, useRef, type RefObject } from "react";

const WORD_CHAR = /[\p{L}\p{N}_$]/u;
const MAX_SELECTION_LENGTH = 200;
const MUTATION_DEBOUNCE_MS = 50;
const STYLE_ATTR = "data-bb-word-highlight";

type HighlightMode = "word" | "substring";

interface HighlightState {
  needle: string;
  mode: HighlightMode;
}

interface CssHighlightsRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

function getHighlightRegistry(): CssHighlightsRegistry | undefined {
  return typeof CSS === "undefined"
    ? undefined
    : (CSS as { highlights?: CssHighlightsRegistry }).highlights;
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

export function expandWordAt(text: string, offset: number): string | null {
  let start = Math.min(offset, text.length);
  let end = start;
  while (start > 0 && isWordChar(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && isWordChar(text[end])) {
    end += 1;
  }
  return start === end ? null : text.slice(start, end);
}

interface CaretPosition {
  node: Node;
  offset: number;
}

function caretAtPoint(
  root: Document | ShadowRoot,
  x: number,
  y: number,
): CaretPosition | null {
  const rangeApi = (
    root as Document & {
      caretRangeFromPoint?(x: number, y: number): Range | null;
    }
  ).caretRangeFromPoint;
  const range = rangeApi?.call(root, x, y);
  if (range !== null && range !== undefined) {
    return { node: range.startContainer, offset: range.startOffset };
  }
  const positionApi = (
    root as Document & {
      caretPositionFromPoint?(
        x: number,
        y: number,
      ): { offsetNode: Node; offset: number } | null;
    }
  ).caretPositionFromPoint;
  const position = positionApi?.call(root, x, y);
  if (position !== null && position !== undefined) {
    return { node: position.offsetNode, offset: position.offset };
  }
  return null;
}

export function extractWordAtPoint(
  x: number,
  y: number,
  roots: ReadonlyArray<Document | ShadowRoot>,
): string | null {
  for (const root of roots) {
    const position = caretAtPoint(root, x, y);
    const node = position?.node;
    if (
      position === null ||
      node === undefined ||
      node.nodeType !== Node.TEXT_NODE ||
      node.parentElement?.closest("[data-column-number]")
    ) {
      continue;
    }
    const word = expandWordAt(node.textContent ?? "", position.offset);
    if (word !== null) {
      return word;
    }
    const tokenText =
      node.parentElement?.closest("[data-char]")?.textContent?.trim() ?? "";
    if (/^[\p{L}\p{N}_$]+$/u.test(tokenText)) {
      return tokenText;
    }
  }
  return null;
}

export function extractWordFromElement(
  element: Element,
  x: number,
  y: number,
): string | null {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return node.parentElement?.closest(
          "[data-column-number],style,script",
        )
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let node = walker.nextNode();
  while (node !== null) {
    const length = node.textContent?.length ?? 0;
    for (let index = 0; index < length; index += 1) {
      const range = element.ownerDocument.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return expandWordAt(node.textContent ?? "", index);
      }
    }
    node = walker.nextNode();
  }
  return null;
}

export function findOccurrenceRanges(
  roots: ReadonlyArray<HTMLElement | Document | ShadowRoot>,
  needle: string,
  mode: HighlightMode,
): Range[] {
  const ranges: Range[] = [];
  if (needle === "") {
    return ranges;
  }
  for (const root of roots) {
    const ownerDocument =
      root instanceof Document ? root : root.ownerDocument;
    const walker = ownerDocument.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (parent === null || parent === undefined) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest("style,script") !== null) {
            return NodeFilter.FILTER_REJECT;
          }
          const line = parent.closest("[data-line]");
          if (line === null) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.parentElement?.closest("[data-column-number]")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    let node = walker.nextNode();
    while (node !== null) {
      const text = node.textContent ?? "";
      let index = text.indexOf(needle);
      while (index !== -1) {
        const before = text[index - 1];
        const after = text[index + needle.length];
        if (mode === "substring" || (!isWordChar(before) && !isWordChar(after))) {
          const range = ownerDocument.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          ranges.push(range);
        }
        index = text.indexOf(needle, index + 1);
      }
      node = walker.nextNode();
    }
  }
  return ranges;
}

function paintHighlight(
  name: string,
  roots: ReadonlyArray<HTMLElement | Document | ShadowRoot>,
  state: HighlightState | null,
): void {
  const registry = getHighlightRegistry();
  const HighlightCtor = (
    globalThis as { Highlight?: new (...ranges: Range[]) => unknown }
  ).Highlight;
  if (registry === undefined || HighlightCtor === undefined) {
    return;
  }
  if (state === null) {
    registry.delete(name);
    return;
  }
  const ranges = findOccurrenceRanges(roots, state.needle, state.mode);
  registry.set(name, new HighlightCtor(...ranges));
}

function injectHighlightStyle(
  root: Document | ShadowRoot,
  name: string,
  injected: HTMLStyleElement[],
): void {
  const target = root instanceof Document ? root.head : root;
  if (target.querySelector(`[${STYLE_ATTR}="${name}"]`)) {
    return;
  }
  const style = target.ownerDocument.createElement("style");
  style.setAttribute(STYLE_ATTR, name);
  style.textContent = `::highlight(${name}) { background-color: color-mix(in oklab, var(--ink) 30%, transparent); }`;
  target.appendChild(style);
  injected.push(style);
}

function rootSelections(
  roots: ReadonlyArray<Document | ShadowRoot>,
): Selection[] {
  const selections: Selection[] = [];
  for (const root of roots) {
    const selection = (
      root as Document & { getSelection?: () => Selection | null }
    ).getSelection?.();
    if (selection !== null && selection !== undefined) {
      selections.push(selection);
    }
  }
  return selections;
}

function selectionInside(
  container: HTMLElement,
  selection: Selection,
): boolean {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  const inside =
    (anchor === null || container.contains(anchor)) &&
    (focus === null || container.contains(focus));
  const insideShadow = [anchor, focus].some((node) => {
    if (node === null) {
      return false;
    }
    const nodeRoot = node.getRootNode();
    return nodeRoot instanceof ShadowRoot && container.contains(nodeRoot.host);
  });
  return inside || insideShadow;
}

function selectionTextInside(
  container: HTMLElement,
  selection: Selection,
): string | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  if (!selectionInside(container, selection)) {
    return null;
  }
  const text = selection.toString().trim();
  if (text === "" || text.includes("\n") || text.length > MAX_SELECTION_LENGTH) {
    return null;
  }
  return text;
}

export function useWordHighlight(
  containerRef: RefObject<HTMLElement | null>,
): void {
  const reactId = useId();
  const highlightName = useMemo(
    () => `bb-word-${reactId.replace(/[^\w-]/g, "")}`,
    [reactId],
  );
  const stateRef = useRef<HighlightState | null>(null);

  useEffect(() => {
    const doc = containerRef.current?.ownerDocument ?? document;
    const styleRoots = (
      container: HTMLElement,
    ): ReadonlyArray<Document | ShadowRoot> => [
      doc,
      ...getDiffShadowRoots(container),
    ];
    const contentRoots = (
      container: HTMLElement,
    ): ReadonlyArray<HTMLElement | Document | ShadowRoot> => [
      container,
      ...getDiffShadowRoots(container),
    ];

    const observedRoots = new Set<Node>();
    const injectedStyles: HTMLStyleElement[] = [];
    const watchRoot = (root: Node) => {
      if (observedRoots.has(root)) {
        return;
      }
      observedRoots.add(root);
      observer.observe(root, { childList: true, subtree: true });
      if (root instanceof ShadowRoot) {
        root.addEventListener("selectionchange", onSelectionChange);
      }
    };
    const observer = new MutationObserver(() => {
      const container = containerRef.current;
      if (container === null) {
        return;
      }
      for (const shadowRoot of getDiffShadowRoots(container)) {
        watchRoot(shadowRoot);
      }
      if (stateRef.current === null) {
        return;
      }
      if (debounceTimer.id !== null) {
        clearTimeout(debounceTimer.id);
      }
      debounceTimer.id = setTimeout(apply, MUTATION_DEBOUNCE_MS);
    });

    const ensureObserved = (container: HTMLElement) => {
      watchRoot(container);
      for (const shadowRoot of getDiffShadowRoots(container)) {
        watchRoot(shadowRoot);
      }
    };

    const apply = () => {
      const container = containerRef.current;
      if (container === null) {
        return;
      }
      ensureObserved(container);
      for (const root of styleRoots(container)) {
        injectHighlightStyle(root, highlightName, injectedStyles);
      }
      paintHighlight(highlightName, contentRoots(container), stateRef.current);
    };
    const clear = () => {
      if (stateRef.current === null) {
        return;
      }
      stateRef.current = null;
      apply();
    };
    const set = (needle: string, mode: HighlightMode) => {
      const current = stateRef.current;
      if (current?.needle === needle && current.mode === mode) {
        return;
      }
      stateRef.current = { needle, mode };
      apply();
    };

    const eventInside = (event: Event, container: HTMLElement) =>
      event.composedPath().includes(container);

    const onClick = (event: MouseEvent) => {
      const container = containerRef.current;
      if (container === null || !eventInside(event, container)) {
        return;
      }
      const active = rootSelections(styleRoots(container)).some(
        (selection) =>
          !selection.isCollapsed && selectionInside(container, selection),
      );
      if (active) {
        return;
      }
      let word = extractWordAtPoint(
        event.clientX,
        event.clientY,
        styleRoots(container),
      );
      if (word === null) {
        const hit = event
          .composedPath()
          .find(
            (target): target is Element =>
              target instanceof Element &&
              target.closest("[data-line]") !== null &&
              target.closest("[data-column-number]") === null,
          );
        if (hit !== undefined) {
          word = extractWordFromElement(hit, event.clientX, event.clientY);
        }
      }
      if (word === null) {
        clear();
        return;
      }
      const current = stateRef.current;
      if (current?.mode === "word" && current.needle === word) {
        clear();
        return;
      }
      set(word, "word");
    };
    const onSelectionChange = () => {
      const container = containerRef.current;
      if (container === null) {
        return;
      }
      for (const selection of rootSelections(styleRoots(container))) {
        const text = selectionTextInside(container, selection);
        if (text !== null) {
          set(text, "substring");
          return;
        }
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container !== null && !eventInside(event, container)) {
        clear();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clear();
      }
    };

    const debounceTimer = {
      id: null as ReturnType<typeof setTimeout> | null,
    };

    doc.addEventListener("click", onClick, true);
    doc.addEventListener("selectionchange", onSelectionChange);
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      for (const root of observedRoots) {
        if (root instanceof ShadowRoot) {
          root.removeEventListener("selectionchange", onSelectionChange);
        }
      }
      if (debounceTimer.id !== null) {
        clearTimeout(debounceTimer.id);
      }
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("selectionchange", onSelectionChange);
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("keydown", onKeyDown);
      getHighlightRegistry()?.delete(highlightName);
      for (const style of injectedStyles) {
        style.remove();
      }
      stateRef.current = null;
    };
  }, [containerRef, highlightName]);
}
