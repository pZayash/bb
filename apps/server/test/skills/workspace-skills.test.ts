import {
  hostDaemonOnlineRpcResponseMessageSchema,
  hostDaemonServerWsMessageSchema,
  type DiscoveredSkill,
} from "@bb/host-daemon-contract";
import { describe, expect, it } from "vitest";
import { resolveWorkspaceProjectSkills } from "../../src/services/skills/workspace-skills.js";
import type { TestDaemonWebSocket } from "../helpers/daemon-ws.js";
import { seedHostSession } from "../helpers/seed.js";
import {
  type TestAppHarness,
  withTestHarness,
} from "../helpers/test-app.js";

// bb-fork(windows): project skills are enumerated through host.list_skills so a
// symlinked <workspace>/.bb/skills root yields linked skills instead of an
// invalid_path failure; an invalid_path response still degrades to empty.
function respondToListSkills(
  harness: TestAppHarness,
  sessionId: string,
  respond: (commandType: string) => Record<string, unknown>,
): TestDaemonWebSocket {
  return {
    close() {},
    send(data) {
      const message = hostDaemonServerWsMessageSchema.parse(JSON.parse(data));
      if (message.type !== "host-rpc.request") {
        throw new Error(`Expected host-rpc.request, got ${message.type}`);
      }
      harness.hub.recordHostOnlineRpcResponse({
        sessionId,
        message: hostDaemonOnlineRpcResponseMessageSchema.parse({
          type: "host-rpc.response",
          requestId: message.requestId,
          commandType: message.command.type,
          ...respond(message.command.type),
        }),
      });
    },
  };
}

function skill(overrides: Partial<DiscoveredSkill>): DiscoveredSkill {
  return {
    id: `skill_${"a".repeat(64)}`,
    name: "alpha",
    description: "Alpha skill",
    filePath: "C:\\ws\\.bb\\skills\\alpha\\SKILL.md",
    rootKind: "bb-project",
    linked: false,
    ...overrides,
  };
}

describe("resolveWorkspaceProjectSkills", () => {
  it("degrades to an empty list when the daemon reports invalid_path", async () => {
    await withTestHarness(async (harness) => {
      const { host, session } = seedHostSession(harness.deps, {
        id: "host-skills-invalid-root",
      });
      const requestedTypes: string[] = [];
      harness.hub.registerDaemon(
        session.id,
        host.id,
        respondToListSkills(harness, session.id, (commandType) => {
          requestedTypes.push(commandType);
          return {
            ok: false,
            errorCode: "invalid_path",
            errorMessage: "Path must not be a symlink",
          };
        }),
      );

      const sources = await resolveWorkspaceProjectSkills(harness.deps, {
        hostId: host.id,
        workspacePath: "C:\\ws",
      });

      expect(sources).toEqual([]);
      expect(requestedTypes).toEqual(["host.list_skills"]);
    });
  });

  it("injects linked bb-project skills from a symlinked skills root", async () => {
    await withTestHarness(async (harness) => {
      const { host, session } = seedHostSession(harness.deps, {
        id: "host-skills-symlink-root",
      });
      harness.hub.registerDaemon(
        session.id,
        host.id,
        respondToListSkills(harness, session.id, () => ({
          ok: true,
          result: {
            skills: [
              skill({ linked: true }),
              skill({
                name: "beta",
                description: "Beta skill",
                filePath: "C:\\ws\\.bb\\skills\\beta\\SKILL.md",
              }),
              skill({
                name: "nodesc",
                description: null,
                filePath: "C:\\ws\\.bb\\skills\\nodesc\\SKILL.md",
              }),
              skill({
                name: "provider-owned",
                filePath: "C:\\ws\\other\\provider-owned\\SKILL.md",
                rootKind: "provider-project",
              }),
            ],
          },
        })),
      );

      const sources = await resolveWorkspaceProjectSkills(harness.deps, {
        hostId: host.id,
        workspacePath: "C:\\ws",
      });

      expect(sources).toEqual([
        {
          kind: "workspace-path",
          sourceType: "project",
          name: "alpha",
          description: "Alpha skill",
          sourceRootPath: "C:\\ws\\.bb\\skills\\alpha",
          skillFilePath: "C:\\ws\\.bb\\skills\\alpha\\SKILL.md",
        },
        {
          kind: "workspace-path",
          sourceType: "project",
          name: "beta",
          description: "Beta skill",
          sourceRootPath: "C:\\ws\\.bb\\skills\\beta",
          skillFilePath: "C:\\ws\\.bb\\skills\\beta\\SKILL.md",
        },
      ]);
    });
  });
});
