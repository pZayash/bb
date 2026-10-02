// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePreview, type FilePreviewDiffSlot } from "./FilePreview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const EMPTY_FILE_STATE = { kind: "empty" } as const;

function diffSlot(
  overrides: Partial<FilePreviewDiffSlot> = {},
): FilePreviewDiffSlot {
  return {
    content: <div data-testid="file-diff-content" />,
    isActive: false,
    toggle: (
      <button type="button" aria-label="Show changes">
        toggle
      </button>
    ),
    ...overrides,
  };
}

describe("FilePreview file diff slot", () => {
  it("renders the toggle and keeps the file body by default", () => {
    render(
      <FilePreview
        path="src/file.ts"
        state={EMPTY_FILE_STATE}
        fileDiff={diffSlot()}
      />,
    );

    expect(screen.getByRole("button", { name: "Show changes" })).not.toBeNull();
    expect(screen.queryByTestId("file-diff-content")).toBeNull();
    expect(screen.getByText("Empty file.")).not.toBeNull();
  });

  it("replaces the file body while the diff is active", () => {
    render(
      <FilePreview
        path="src/file.ts"
        state={EMPTY_FILE_STATE}
        fileDiff={diffSlot({ isActive: true })}
      />,
    );

    expect(screen.getByTestId("file-diff-content")).not.toBeNull();
    expect(screen.queryByText("Empty file.")).toBeNull();
  });

  it("lets the caller own the toggle state", () => {
    const onToggle = vi.fn();
    render(
      <FilePreview
        path="src/file.ts"
        state={EMPTY_FILE_STATE}
        onOpenInEditor={undefined}
        fileDiff={diffSlot({
          toggle: (
            <button type="button" aria-label="Show changes" onClick={onToggle}>
              toggle
            </button>
          ),
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show changes" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders no diff controls when no slot is supplied", () => {
    render(<FilePreview path="src/file.ts" state={EMPTY_FILE_STATE} />);

    expect(screen.queryByRole("button", { name: "Show changes" })).toBeNull();
    expect(screen.getByText("Empty file.")).not.toBeNull();
  });
});
