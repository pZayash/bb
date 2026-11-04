import type { ThreadDelta } from "@bb/provider-bridge-protocol";

// bb-fork(windows): drop session titles that echo the <system_instructions> block injected into the first prompt (see docs/windows.md).
const injectedBlocks = new WeakMap<object, string>();

const BLOCK_OPEN = "<system_instructions>";
const BLOCK_CLOSE = "</system_instructions>";

export function forkSystemInstructionsBlock(
  session: object,
  instructions: string,
): string {
  const block = `${BLOCK_OPEN}\n${instructions}\n${BLOCK_CLOSE}`;
  injectedBlocks.set(session, block);
  return block;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function stripTruncationMarker(text: string): string {
  return text.replace(/(?:\.{3,}|…+)\s*$/u, "").trimEnd();
}

function titleWithoutInstructionsEcho(
  title: string,
  block: string,
): string | null {
  const collapsedTitle = collapseWhitespace(title);
  const foldedTitle = stripTruncationMarker(collapsedTitle).toLowerCase();
  if (foldedTitle.length === 0) {
    return null;
  }
  const collapsedBlock = collapseWhitespace(block);
  const foldedBlock = collapsedBlock.toLowerCase();
  const blockIndex = collapsedTitle.indexOf(collapsedBlock);
  if (blockIndex !== -1) {
    const remainder = collapseWhitespace(
      `${collapsedTitle.slice(0, blockIndex)} ${collapsedTitle.slice(blockIndex + collapsedBlock.length)}`,
    );
    return remainder.length > 0 ? remainder : null;
  }
  if (foldedBlock.startsWith(foldedTitle)) {
    return null;
  }
  const foldedContent = foldedBlock
    .slice(BLOCK_OPEN.length, foldedBlock.length - BLOCK_CLOSE.length)
    .trim();
  if (foldedContent.startsWith(foldedTitle)) {
    return null;
  }
  if (foldedTitle.startsWith(foldedContent)) {
    const remainder = collapseWhitespace(
      collapsedTitle.slice(foldedContent.length),
    ).replace(/^<\/system_instructions>\s*/iu, "");
    return remainder.length > 0 ? remainder : null;
  }
  return title;
}

export function forkFilterTitleEchoDeltas(
  session: object,
  deltas: readonly ThreadDelta[],
): ThreadDelta[] {
  const block = injectedBlocks.get(session);
  if (block === undefined) {
    return [...deltas];
  }
  return deltas.flatMap((delta): ThreadDelta[] => {
    if (delta.kind !== "thread.name") {
      return [delta];
    }
    const title = titleWithoutInstructionsEcho(delta.name, block);
    if (title === null) {
      return [];
    }
    return [title === delta.name ? delta : { ...delta, name: title }];
  });
}
