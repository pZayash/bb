// bb-fork(diff-rail): @pierre/diffs renders rows into the shadow root of a `diffs-container`.
import { DIFFS_TAG_NAME } from "@pierre/diffs";

const DIFF_CHANGE_ROW_SELECTOR = "[data-line][data-line-type]";

export function collectDiffChangeRows(root: ParentNode): HTMLElement[] {
  const rows = [
    ...root.querySelectorAll<HTMLElement>(DIFF_CHANGE_ROW_SELECTOR),
  ];
  for (const host of root.querySelectorAll(DIFFS_TAG_NAME)) {
    const shadowRoot = host.shadowRoot;
    if (shadowRoot === null) continue;
    rows.push(...collectDiffChangeRows(shadowRoot));
  }
  return rows;
}

export function observeDiffRows(
  root: HTMLElement,
  onChange: () => void,
): () => void {
  const observedShadowRoots = new Set<ShadowRoot>();
  const shadowObservers: MutationObserver[] = [];
  const resizeObserver = new ResizeObserver(onChange);
  let observedContent: Element | null = null;
  const observeContent = () => {
    const content = root.firstElementChild;
    if (content === observedContent) return;
    if (observedContent !== null) resizeObserver.unobserve(observedContent);
    observedContent = content;
    if (content !== null) resizeObserver.observe(content);
  };
  const observeShadowRoots = () => {
    for (const host of root.querySelectorAll(DIFFS_TAG_NAME)) {
      const shadowRoot = host.shadowRoot;
      if (shadowRoot === null || observedShadowRoots.has(shadowRoot)) continue;
      observedShadowRoots.add(shadowRoot);
      const observer = new MutationObserver(onChange);
      observer.observe(shadowRoot, { childList: true, subtree: true });
      shadowObservers.push(observer);
    }
  };
  const lightObserver = new MutationObserver(() => {
    observeContent();
    observeShadowRoots();
    onChange();
  });
  lightObserver.observe(root, { childList: true, subtree: true });
  resizeObserver.observe(root);
  observeContent();
  observeShadowRoots();
  return () => {
    lightObserver.disconnect();
    for (const observer of shadowObservers) observer.disconnect();
    resizeObserver.disconnect();
  };
}
