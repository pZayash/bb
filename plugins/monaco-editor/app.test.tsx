// @vitest-environment jsdom

import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";

const editor = vi.hoisted(() => ({
  setSelection: vi.fn(),
  revealRangeInCenter: vi.fn(),
  focus: vi.fn(),
  getModel: vi.fn(() => ({
    getLineCount: () => 160,
    getLineMaxColumn: () => 42,
    dispose: vi.fn(),
  })),
  onDidFocusEditorWidget: vi.fn(),
  onDidChangeModelContent: vi.fn(),
  addCommand: vi.fn(),
  updateOptions: vi.fn(),
  getValue: vi.fn(() => "fixture"),
  dispose: vi.fn(),
}));
const create = vi.hoisted(() => vi.fn(() => editor));
vi.mock("./lib/monaco-loader.js", () => ({
  loadMonaco: async () => ({
    editor: { create },
    KeyMod: { CtrlCmd: 1 },
    KeyCode: { KeyS: 2 },
  }),
  overflowWidgetsNode: () => document.body,
  setOverflowWidgetsTheme: vi.fn(),
}));
vi.mock("./lib/monaco-theme.js", () => ({
  applyCodeTheme: () => ({ name: "test", base: "vs-dark" }),
  editorBackground: () => "black",
}));

const app = await loadPluginApp(() => import("./app"));
const registration = app.fileOpeners[0]!;
const Component = registration.component;
const base: PluginFileOpenerProps = {
  path: "target.ts",
  source: {
    kind: "workspace",
    environmentId: "env_1",
    projectId: null,
    threadId: null,
  },
  Original: () => <div>native</div>,
};
const file = {
  kind: "text",
  content: "fixture",
  sha256: "hash",
  absolutePath: "/fixture/target.ts",
  relativePath: "target.ts",
  rootPath: "/fixture",
};
function mount(
  range: PluginFileOpenerProps["experimental_lineRange"],
  read: () => unknown = () => file,
) {
  return renderSlot(
    registration,
    { ...base, experimental_lineRange: range },
    {
      rpc: { assets: () => ({ baseUrl: "/assets", expiresAtMs: 99999 }), read },
    },
  );
}
const range = (startLineNumber: number, endLineNumber = startLineNumber) => ({
  startLineNumber,
  endLineNumber,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each([range(80), range(120, 124)])(
  "selects and reveals the initial target %j after loading",
  async (target) => {
    mount(target);
    await waitFor(() =>
      expect(editor.setSelection).toHaveBeenCalledWith({
        ...target,
        startColumn: 1,
        endColumn: 42,
      }),
    );
    expect(editor.revealRangeInCenter).toHaveBeenCalledWith({
      ...target,
      startColumn: 1,
      endColumn: 42,
    });
  },
);

it.each([null, undefined])(
  "leaves an untargeted initial open alone (%s)",
  async (target) => {
    mount(target);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(editor.setSelection).not.toHaveBeenCalled();
  },
);

it("navigates changed and repeated targets without recreating the editor", async () => {
  const slot = mount(range(80));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const target = range(120, 124);
  slot.lifecycle.rerender(
    <Component {...base} experimental_lineRange={target} />,
  );
  await waitFor(() =>
    expect(editor.setSelection).toHaveBeenLastCalledWith({
      ...target,
      startColumn: 1,
      endColumn: 42,
    }),
  );
  editor.setSelection.mockClear();
  slot.lifecycle.rerender(
    <Component {...base} experimental_lineRange={target} />,
  );
  expect(editor.setSelection).not.toHaveBeenCalled();
  slot.lifecycle.rerender(
    <Component {...base} experimental_lineRange={{ ...target }} />,
  );
  expect(editor.setSelection).toHaveBeenCalledOnce();
  slot.lifecycle.rerender(
    <Component {...base} experimental_lineRange={null} />,
  );
  expect(editor.setSelection).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
  expect(editor.dispose).not.toHaveBeenCalled();
});

it("uses only the latest target when several arrive before the file loads", async () => {
  let resolveRead = (_value: typeof file) => {};
  const pending = new Promise<typeof file>((resolve) => {
    resolveRead = resolve;
  });
  const slot = mount(range(30), () => pending);
  slot.lifecycle.rerender(
    <Component {...base} experimental_lineRange={range(90)} />,
  );
  slot.lifecycle.rerender(
    <Component {...base} experimental_lineRange={range(140)} />,
  );
  await act(async () => resolveRead(file));
  await waitFor(() => expect(editor.setSelection).toHaveBeenCalledOnce());
  expect(editor.setSelection).toHaveBeenLastCalledWith({
    ...range(140),
    startColumn: 1,
    endColumn: 42,
  });
  expect(create).toHaveBeenCalledOnce();
});

it("clamps a target beyond EOF to the final line", async () => {
  mount(range(200, 220));
  await waitFor(() =>
    expect(editor.setSelection).toHaveBeenCalledWith({
      ...range(160),
      startColumn: 1,
      endColumn: 42,
    }),
  );
});

it("does not create or navigate a disposed loading editor", async () => {
  let resolveRead = (_value: typeof file) => {};
  const pending = new Promise<typeof file>((resolve) => {
    resolveRead = resolve;
  });
  const slot = mount(range(80), () => pending);
  slot.lifecycle.unmount();
  await act(async () => resolveRead(file));
  expect(create).not.toHaveBeenCalled();
  expect(editor.setSelection).not.toHaveBeenCalled();
});

it("does not apply a stale target cleared during loading", async () => {
  let resolveRead = (_value: typeof file) => {};
  const pending = new Promise<typeof file>((resolve) => {
    resolveRead = resolve;
  });
  const slot = mount(range(80), () => pending);
  slot.lifecycle.rerender(
    <Component {...base} experimental_lineRange={null} />,
  );
  await act(async () => resolveRead(file));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(editor.setSelection).not.toHaveBeenCalled();
});

const markdownFile = {
  ...file,
  content: "# Title",
  absolutePath: "/fixture/notes/readme.md",
  relativePath: "notes/readme.md",
};

function mountMarkdown() {
  const slot = renderSlot(
    registration,
    { ...base, path: "notes/readme.md" },
    {
      rpc: {
        assets: () => ({ baseUrl: "/assets", expiresAtMs: 99999 }),
        read: () => markdownFile,
      },
    },
  );
  return slot;
}

it("offers no view toggle for non-Markdown files", async () => {
  const slot = mount(null);
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(slot.queryByRole("button", { name: "Preview" })).toBeNull();
  expect(slot.queryByRole("button", { name: "Source" })).toBeNull();
});

it("renders the Markdown preview and returns to the editor", async () => {
  const slot = mountMarkdown();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  editor.getValue.mockReturnValue("# Title");
  const previewButton = await slot.findByRole("button", { name: "Preview" });
  expect(slot.queryByText("# Title")).toBeNull();
  expect(editor.getValue).not.toHaveBeenCalled();

  fireEvent.click(previewButton);
  expect(await slot.findByText("# Title")).toBeTruthy();
  expect(editor.getValue).toHaveBeenCalled();

  fireEvent.click(slot.getByRole("button", { name: "Source" }));
  expect(slot.queryByText("# Title")).toBeNull();
});

it("drops the preview when another file is opened from the tree", async () => {
  const slot = mountMarkdown();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  editor.getValue.mockReturnValue("# Title");
  fireEvent.click(await slot.findByRole("button", { name: "Preview" }));
  expect(await slot.findByText("# Title")).toBeTruthy();
  slot.lifecycle.rerender(
    <Component {...base} path="notes/other.md" experimental_lineRange={null} />,
  );
  await waitFor(() => expect(slot.queryByText("# Title")).toBeNull());
});
