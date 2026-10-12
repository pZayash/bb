import { acpUsageUpdateSchema, type AcpContentBlock } from "../wire.js";

// bb-fork(windows): ACP has no transient channel into a running session, so
// the latest known context usage rides inside the next user prompt. Tracked
// per session object — the entry dies with it. Threshold wording matches the
// pi context-usage extension (tools/pi-extensions/context-usage.ts).
const lastContextUsage = new WeakMap<object, { used: number; size: number }>();

export function forkTrackContextUsage(session: object, update: unknown): void {
	const parsed = acpUsageUpdateSchema.safeParse(update);
	if (parsed.success) {
		lastContextUsage.set(session, parsed.data);
	}
}

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
	return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : `${tokens}`;
}

export function forkContextUsageBlock(session: object): AcpContentBlock | undefined {
	const usage = lastContextUsage.get(session);
	if (!usage || usage.size <= 0) return undefined;
	const pct = Math.round((usage.used / usage.size) * 100);
	let text = `Context: ${formatTokens(usage.used)}/${formatTokens(usage.size)} (${pct}%)`;
	if (pct >= 85) text += " — compact required at next pause";
	else if (pct >= 65) text += " — consider compact";
	return { type: "text", text };
}
