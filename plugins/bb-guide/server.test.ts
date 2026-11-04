import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

const bundledSkills = readdirSync(new URL("./skills", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

it("introduces bb without user-question guidance", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "bb-guide",
    agentSkillIds: bundledSkills,
  });
  try {
    await plugin(bb);
    const { instructions: introduction } =
      await harness.behavior.resolveAgentConfiguration(
        makePluginAgentConfigurationContext(),
      );
    expect(introduction).toContain("You are working inside bb");
    expect(introduction).toContain("agentic IDE");
    expect(introduction).toContain(
      "Reference a BB thread as `@thread:thr_abc123`",
    );
    expect(introduction).toContain("Do not construct thread URLs manually");
    expect(introduction).toContain("`bb voice transcribe <path>`");
    expect(introduction).not.toContain(
      "Ask the user a blocking question only when",
    );
    expect(introduction).toBe(introduction?.trim());
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("slims the introduction for child threads", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "bb-guide",
    agentSkillIds: bundledSkills,
  });
  try {
    await plugin(bb);
    const parent = (
      await harness.behavior.resolveAgentConfiguration(
        makePluginAgentConfigurationContext(),
      )
    ).instructions;
    const child = (
      await harness.behavior.resolveAgentConfiguration(
        makePluginAgentConfigurationContext({
          thread: { parentThreadId: "thr_parent" },
        }),
      )
    ).instructions;
    expect(parent).toContain("You are working inside bb");
    expect(parent).toContain("Run `bb guide`");
    expect(parent).toContain("`bb voice transcribe <path>`");
    expect(child).toContain("child thread inside bb");
    expect(child).toContain("answer it in your final response");
    expect(child).toContain("bb thread tell");
    expect(child).toContain("`@thread:thr_abc123`");
    expect(child).not.toContain("Run `bb guide`");
    expect(child).not.toContain("Run `bb status` to see");
    expect(child).not.toContain("Do not spawn new threads");
    expect(child).not.toContain("voice transcribe");
    expect(child).toBe(child?.trim());
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("keeps the introduction and skill switches independent across reloads", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "bb-guide",
    agentSkillIds: bundledSkills,
  });
  try {
    await plugin(bb);
    const instructions = async () =>
      (
        await harness.behavior.resolveAgentConfiguration(
          makePluginAgentConfigurationContext(),
        )
      ).instructions;
    const skills = async () =>
      (
        await harness.behavior.resolveAgentConfiguration(
          makePluginAgentConfigurationContext(),
        )
      ).skills;
    expect(await instructions()).toContain("You are working inside bb");
    expect((await skills()).sort()).toEqual([...bundledSkills].sort());
    await harness.behavior.setSettings({
      introduction: false,
      pluginAuthoring: false,
    });
    expect(await instructions()).toBeNull();
    expect(await skills()).toEqual([
      "bb-cli",
      "skill-creator",
      "submit-a-plugin",
    ]);
    await harness.behavior.setSettings({ skills: false });
    expect(await skills()).toEqual([]);
    await harness.lifecycle.reload(plugin);
    expect(await instructions()).toBeNull();
    expect(await skills()).toEqual([]);
    await harness.behavior.setSettings({ introduction: true, skills: true });
    expect(await instructions()).toContain("bb status");
    expect(await skills()).toEqual([
      "bb-cli",
      "skill-creator",
      "submit-a-plugin",
    ]);
  } finally {
    await harness.lifecycle.dispose();
  }
});

describe("individual skill selection", () => {
  it.each([
    ["bbCli", ["bb-plugin-authoring", "skill-creator", "submit-a-plugin"]],
    ["pluginAuthoring", ["bb-cli", "skill-creator", "submit-a-plugin"]],
    ["skillCreator", ["bb-cli", "bb-plugin-authoring", "submit-a-plugin"]],
    ["submitPlugin", ["bb-cli", "bb-plugin-authoring", "skill-creator"]],
  ])("disables %s", async (key, expected) => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "bb-guide",
      agentSkillIds: bundledSkills,
    });
    try {
      await plugin(bb);
      await harness.behavior.setSettings({ [key]: false });
      expect(
        (
          await harness.behavior.resolveAgentConfiguration(
            makePluginAgentConfigurationContext(),
          )
        ).skills,
      ).toEqual(expected);
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
