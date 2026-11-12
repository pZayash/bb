// bb-fork(windows): drop agent thread titles that echo the injected <system_instructions> block; covers plugin bridges bundled against the published SDK that never carry the bridge-side filter (see docs/windows.md).

const BLOCK_OPEN = "<system_instructions>";
const BLOCK_CLOSE = "</system_instructions>";

type SanitizeTitle = (value: string) => string | null;

export function forkSanitizeAgentThreadTitle(
  threadName: string,
  sanitize: SanitizeTitle,
): string | null {
  const collapsed = threadName.replace(/\s+/gu, " ").trim();
  const folded = collapsed.toLowerCase();
  const echoes =
    folded.startsWith(BLOCK_OPEN) ||
    (folded.startsWith("<") && BLOCK_OPEN.startsWith(folded));
  if (!echoes) {
    return sanitize(threadName);
  }
  const closeIndex = folded.indexOf(BLOCK_CLOSE);
  if (closeIndex === -1) {
    return null;
  }
  const remainder = collapsed
    .slice(closeIndex + BLOCK_CLOSE.length)
    .replace(/(?:\.{3,}|…+)\s*$/u, "")
    .trim();
  return remainder.length > 0 ? sanitize(remainder) : null;
}
