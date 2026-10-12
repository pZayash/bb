import { describe, expect, it } from "vitest";
import {
	forkContextUsageBlock,
	forkTrackContextUsage,
} from "./context-usage.fork.js";

describe("fork context usage prompt tail", () => {
	it("returns undefined before any usage_update", () => {
		expect(forkContextUsageBlock({})).toBeUndefined();
	});

	it("ignores updates that are not usage_update", () => {
		const session = {};
		forkTrackContextUsage(session, {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "hi" },
		});
		expect(forkContextUsageBlock(session)).toBeUndefined();
	});

	it("appends percentage and thresholds to the prompt tail", () => {
		const session = {};
		forkTrackContextUsage(session, {
			sessionUpdate: "usage_update",
			used: 144_000,
			size: 262_000,
		});
		expect(forkContextUsageBlock(session)).toEqual({
			type: "text",
			text: "Context: 144k/262k (55%)",
		});

		forkTrackContextUsage(session, {
			sessionUpdate: "usage_update",
			used: 183_300,
			size: 262_000,
		});
		expect(forkContextUsageBlock(session)).toEqual({
			type: "text",
			text: "Context: 183k/262k (70%) — consider compact",
		});

		forkTrackContextUsage(session, {
			sessionUpdate: "usage_update",
			used: 235_800,
			size: 262_000,
		});
		expect(forkContextUsageBlock(session)).toEqual({
			type: "text",
			text: "Context: 236k/262k (90%) — compact required at next pause",
		});
	});

	it("skips a zero-size window", () => {
		const session = {};
		forkTrackContextUsage(session, {
			sessionUpdate: "usage_update",
			used: 10,
			size: 0,
		});
		expect(forkContextUsageBlock(session)).toBeUndefined();
	});
});
