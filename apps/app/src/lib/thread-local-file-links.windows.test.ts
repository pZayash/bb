import { describe, expect, it } from "vitest";
import { resolveThreadLocalFileLink } from "./thread-local-file-links";

// bb-fork(windows): native Windows paths through the shared host-path parser.
describe("resolveThreadLocalFileLink on native Windows paths", () => {
  it("resolves workspace containment for native Windows paths", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        hostId: "host_1",
        link: {
          lineRange: { startLineNumber: 3, endLineNumber: 5 },
          openTargetId: null,
          path: "C:\\Users\\me\\Работа\\проект\\src\\..\\canvas-demo.html",
        },
        threadStorage: null,
        workspace: {
          environmentId: "env_1",
          rootPath: "C:\\Users\\me\\Работа\\проект",
        },
      }),
    ).toEqual({
      kind: "preview",
      options: {
        target: {
          kind: "workspace",
          environmentId: "env_1",
          path: "canvas-demo.html",
        },
        location: { kind: "range", startLine: 3, endLine: 5 },
      },
    });
  });

  it("keeps native Windows paths outside the workspace as host files", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        hostId: "host_1",
        link: {
          lineRange: null,
          openTargetId: null,
          path: "C:\\Users\\me\\outside\\id_rsa",
        },
        threadStorage: null,
        workspace: {
          environmentId: "env_1",
          rootPath: "C:\\Users\\me\\project",
        },
      }),
    ).toEqual({
      kind: "preview",
      options: {
        target: {
          kind: "host",
          hostId: "host_1",
          path: "C:\\Users\\me\\outside\\id_rsa",
        },
        location: null,
      },
    });
  });
});
