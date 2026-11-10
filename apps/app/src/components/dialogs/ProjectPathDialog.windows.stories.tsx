import {
  ProjectPathDialogContent,
  type ProjectPathDialogTarget,
} from "./ProjectPathDialog";
import { StoryCard, StoryRow } from "../../../.ladle/story-card";
import { DialogStage } from "../../../.ladle/story-dialog-stage";

// bb-fork(windows): Windows variant of the upstream Project Path overview.
export default {
  title: "dialogs/Project Path (windows)",
};

const noop = async () => {};

const createTarget: ProjectPathDialogTarget = { kind: "create" };

export function Windows() {
  return (
    <StoryCard>
      <StoryRow
        label="windows"
        hint="Windows host — description and placeholder show drive-letter and UNC paths"
      >
        <DialogStage>
          <ProjectPathDialogContent
            target={createTarget}
            pending={false}
            platform="win32"
            hostId={null}
            hostName="Sawyer's PC"
            onSubmit={noop}
          />
        </DialogStage>
      </StoryRow>
    </StoryCard>
  );
}
