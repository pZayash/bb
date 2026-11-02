import type { BbPluginApi } from "@get-bb/plugin-sdk";

type BbSdk = BbPluginApi["sdk"];

// bb-fork(change-log): the read returns a delta union; the change log needs the
// bb-fork(change-log): full snapshot arm that carries rows and the timeline page.
export type ThreadTimelineResult = Extract<
  Awaited<ReturnType<BbSdk["threads"]["timeline"]>>,
  { rows: readonly unknown[] }
>;

export type TimelineRow = ThreadTimelineResult["rows"][number];

export type ThreadPromptHistoryResult = Awaited<
  ReturnType<BbSdk["threads"]["promptHistory"]>
>;

export type PromptHistoryEntry = ThreadPromptHistoryResult[number];
