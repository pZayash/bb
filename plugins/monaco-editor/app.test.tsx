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
    isDisposed: () => false,
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

it("disposes the editor before its model when the opener unmounts", async () => {
  const slot = mount(range(80));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  slot.lifecycle.unmount();
  const model = editor.getModel.mock.results.at(-1)?.value as {
    dispose: ReturnType<typeof vi.fn>;
  };
  expect(editor.dispose).toHaveBeenCalledOnce();
  expect(model.dispose).toHaveBeenCalledOnce();
  expect(editor.dispose.mock.invocationCallOrder[0]).toBeLessThan(
    model.dispose.mock.invocationCallOrder[0]!,
  );
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

// bb-fork(file-diff): diff mode for the open file.
const diffPatch = [
  "diff --git a/target.ts b/target.ts",
  "--- a/target.ts",
  "+++ b/target.ts",
  "@@ -1,1 +1,1 @@",
  "-old",
  "+new",
  "",
].join("\n");

function readDiffSelection(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const selection = (input as { selection?: unknown }).selection;
  return typeof selection === "string" ? selection : null;
}

function mountDiff(
  respond: (selection: string | null) => unknown = (selection) => ({
    contents: { new: "new side", old: "old side" },
    outcome: "available",
    options: [
      { label: "All changes", value: "all" },
      { label: "Uncommitted changes", value: "uncommitted" },
      ...(selection === "thread_start_ref"
        ? []
        : [
            {
              label: "Since thread start (abc1234)",
              value: "thread_start_ref",
            },
          ]),
    ],
    patch: diffPatch,
    selection: selection ?? "all",
    truncated: false,
  }),
  extra: Partial<PluginFileOpenerProps> = {},
) {
  const diff = vi.fn((input: unknown) => respond(readDiffSelection(input)));
  const slot = renderSlot(
    registration,
    { ...base, ...extra },
    {
      rpc: {
        assets: () => ({ baseUrl: "/assets", expiresAtMs: 99999 }),
        read: () => file,
        diff,
      },
    },
  );
  return { diff, slot };
}

it("shows the change diff in split view and can switch to stacked", async () => {
  const { diff, slot } = mountDiff();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  fireEvent.click(await slot.findByRole("button", { name: "Show changes" }));

  const rendered = await slot.findByTestId("bb-diff");
  expect(rendered.getAttribute("data-view")).toBe("split");
  expect(rendered.getAttribute("data-has-full-file-contents")).toBe("true");
  expect(rendered.getAttribute("data-expand-unchanged")).toBe("true");
  expect(rendered.textContent).toContain("+new");
  expect(diff).toHaveBeenCalledWith({
    path: "target.ts",
    selection: null,
    source: base.source,
  });

  fireEvent.click(slot.getByRole("button", { name: "Unified" }));
  await waitFor(() =>
    expect(slot.getByTestId("bb-diff").getAttribute("data-view")).toBe(
      "unified",
    ),
  );
});

it("loads the diff for a picked base without recreating the editor", async () => {
  const { diff, slot } = mountDiff();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  fireEvent.click(await slot.findByRole("button", { name: "Show changes" }));
  await slot.findByTestId("bb-diff");

  fireEvent.change(slot.getByRole("combobox", { name: "Diff base" }), {
    target: { value: "uncommitted" },
  });

  await waitFor(() =>
    expect(diff).toHaveBeenLastCalledWith({
      path: "target.ts",
      selection: "uncommitted",
      source: base.source,
    }),
  );
  expect(create).toHaveBeenCalledOnce();
  expect(editor.dispose).not.toHaveBeenCalled();
});

it("switches the comparison to the thread start commit", async () => {
  const { diff, slot } = mountDiff();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  fireEvent.click(await slot.findByRole("button", { name: "Show changes" }));
  await slot.findByTestId("bb-diff");

  fireEvent.change(slot.getByRole("combobox", { name: "Diff base" }), {
    target: { value: "thread_start_ref" },
  });

  await waitFor(() =>
    expect(diff).toHaveBeenLastCalledWith({
      path: "target.ts",
      selection: "thread_start_ref",
      source: base.source,
    }),
  );
  expect(slot.getByRole("combobox", { name: "Diff base" })).toBeTruthy();
});

it("returns to the editor when the diff is hidden", async () => {
  const { slot } = mountDiff();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  fireEvent.click(await slot.findByRole("button", { name: "Show changes" }));
  await slot.findByTestId("bb-diff");

  fireEvent.click(slot.getByRole("button", { name: "Hide changes" }));

  await waitFor(() => expect(slot.queryByTestId("bb-diff")).toBeNull());
  expect(slot.queryByRole("combobox", { name: "Diff base" })).toBeNull();
});

it("explains a workspace without a diff instead of rendering one", async () => {
  const { slot } = mountDiff(() => ({
    outcome: "unavailable",
    message: "This workspace is not a Git repository.",
  }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  fireEvent.click(await slot.findByRole("button", { name: "Show changes" }));

  expect(
    await slot.findByText("This workspace is not a Git repository."),
  ).toBeTruthy();
  expect(slot.queryByTestId("bb-diff")).toBeNull();
});

it("flags a truncated diff patch", async () => {
  const { slot } = mountDiff((selection) => ({
    contents: null,
    outcome: "available",
    options: [{ label: "All changes", value: "all" }],
    patch: diffPatch,
    selection: selection ?? "all",
    truncated: true,
  }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  fireEvent.click(await slot.findByRole("button", { name: "Show changes" }));

  expect(
    await slot.findByText("This diff was truncated for display."),
  ).toBeTruthy();
});

it("offers no diff switch for files outside a workspace", async () => {
  const slot = renderSlot(
    registration,
    {
      ...base,
      source: {
        kind: "host",
        environmentId: "env_1",
        projectId: null,
        threadId: null,
      },
    },
    {
      rpc: {
        assets: () => ({ baseUrl: "/assets", expiresAtMs: 99999 }),
        read: () => file,
      },
    },
  );
  await waitFor(() => expect(create).toHaveBeenCalledOnce());

  expect(slot.queryByRole("button", { name: "Show changes" })).toBeNull();
});

// bb-fork(file-diff-open): the host can open a file straight into its diff.
it("opens the diff in the view the host asked for", async () => {
  const { slot } = mountDiff(undefined, {
    experimental_diffIntent: { requestId: "req_1", view: "split" },
  });

  await waitFor(() =>
    expect(slot.queryByRole("button", { name: "Hide changes" })).not.toBeNull(),
  );
  expect(
    slot.getByRole("button", { name: "Split" }).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("reapplies a repeat request after the user picked another view", async () => {
  const { slot } = mountDiff(undefined, {
    experimental_diffIntent: { requestId: "req_1", view: "split" },
  });
  await waitFor(() =>
    expect(slot.queryByRole("button", { name: "Hide changes" })).not.toBeNull(),
  );

  fireEvent.click(slot.getByRole("button", { name: "Unified" }));
  expect(
    slot.getByRole("button", { name: "Unified" }).getAttribute("aria-pressed"),
  ).toBe("true");

  slot.lifecycle.rerender(
    <Component
      {...base}
      experimental_diffIntent={{ requestId: "req_2", view: "split" }}
    />,
  );
  await waitFor(() =>
    expect(
      slot.getByRole("button", { name: "Split" }).getAttribute("aria-pressed"),
    ).toBe("true"),
  );
});
