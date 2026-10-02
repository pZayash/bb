// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_CHANGES_LIST_MAX_ROWS,
  WorkspaceChangesList,
  type WorkspaceChangedFile,
} from "./WorkspaceChangesList";

function makeFiles(count: number): WorkspaceChangedFile[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `dist/output-${index}.js`,
    status: "??" as const,
    insertions: null,
    deletions: null,
  }));
}

afterEach(cleanup);

describe("WorkspaceChangesList", () => {
  it("renders every file when the list fits under the row cap", () => {
    render(<WorkspaceChangesList files={makeFiles(3)} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(/more files not shown/)).toBeNull();
  });

  it("caps the scrollable list and reports the hidden remainder", () => {
    const files = makeFiles(WORKSPACE_CHANGES_LIST_MAX_ROWS + 1234);
    render(<WorkspaceChangesList files={files} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(
      WORKSPACE_CHANGES_LIST_MAX_ROWS + 1,
    );
    expect(
      screen.getByText(`${(1234).toLocaleString()} more files not shown`),
    ).toBeTruthy();
    expect(screen.queryByTitle(files[files.length - 1]!.path)).toBeNull();
  });

  it("offers a diff action per row only when the caller handles it", () => {
    const onOpenDiffClick = vi.fn();
    const files = makeFiles(1);
    const { rerender } = render(
      <WorkspaceChangesList files={files} onOpenDiffClick={onOpenDiffClick} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `Open split diff for ${files[0]!.path}`,
      }),
    );
    expect(onOpenDiffClick).toHaveBeenCalledWith(files[0]);

    rerender(<WorkspaceChangesList files={files} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
