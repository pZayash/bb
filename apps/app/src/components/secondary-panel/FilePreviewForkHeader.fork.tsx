// bb-fork(file-diff): the export-menu header action behind one JSX seam.
import { FileExportMenu, type FileExportTarget } from "./FileExportMenu.js";

export function FilePreviewForkHeaderAction({
  className,
  target,
}: {
  className?: string;
  target: FileExportTarget;
}) {
  return <FileExportMenu className={className} target={target} />;
}
