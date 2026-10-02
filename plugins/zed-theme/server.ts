// bb-fork(windows): the Zed typeface theme lives in this plugin's manifest, so this entry only exists to load the plugin.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(_bb: BbPluginApi): Promise<void> {
  return;
}
