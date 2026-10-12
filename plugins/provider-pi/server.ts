import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { piProviderDeclaration } from "./src/declaration.js";

export default function plugin(bb: BbPluginApi): void {
  // bb-fork(compaction-model): pi-side compaction may run on a configured model.
  bb.settings.define({
    compactionModel: {
      type: "string",
      label: "Compaction model",
      description:
        "Model used for manual /compact summaries, as provider/model-id from the Pi catalog (for example deepseek/deepseek-flash). Empty uses the thread's own model.",
      experimental_model: { providerId: "pi" },
      default: "",
    },
  });
  const registered = bb.providers.register(piProviderDeclaration());
  bb.onDispose(() => {
    registered.dispose();
  });
}
