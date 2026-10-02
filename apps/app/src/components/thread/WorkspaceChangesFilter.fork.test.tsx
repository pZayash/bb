// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceChangesFilteredList,
  type WorkspaceChangesFilteredListProps,
} from "./WorkspaceChangesFilter.fork";
import type { WorkspaceChangedFile } from "./WorkspaceChangesList";

function makeFiles(paths: readonly string[]): WorkspaceChangedFile[] {
  return paths.map((path) => ({
    path,
    status: "M" as const,
    insertions: 1,
    deletions: 0,
  }));
}

const MANY_FILES = makeFiles([
  "apps/app/src/Panel.tsx",
  "apps/app/src/Panel.test.tsx",
  "apps/app/src/Button.tsx",
  "apps/server/src/routes/diff.ts",
  "apps/server/src/routes/files.ts",
  "README.md",
  "docs/api.mdx",
  "docs/guide.md",
  "package.json",
]);

const FEW_FILES = MANY_FILES.slice(0, 3);

const FILTER_LABEL = "Filter changed files by path";

function visiblePaths(): string[] {
  return MANY_FILES.map((file) => file.path).filter(
    (path) => screen.queryByTitle(path) !== null,
  );
}

function renderList(
  props: Partial<WorkspaceChangesFilteredListProps> = {},
): void {
  render(
    <MemoryRouter initialEntries={["/projects/proj/threads/thr_one"]}>
      <Routes>
        <Route
          path="/projects/:projectId/threads/:threadId"
          element={
            <>
              <Link to="/projects/proj/threads/thr_two">Other thread</Link>
              <Link to="/projects/proj/threads/thr_one">First thread</Link>
              <WorkspaceChangesFilteredList files={MANY_FILES} {...props} />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function setFilter(value: string): void {
  fireEvent.change(screen.getByLabelText(FILTER_LABEL), {
    target: { value },
  });
}

afterEach(cleanup);

describe("WorkspaceChangesFilteredList", () => {
  it("hides the filter field for a short list", () => {
    renderList({ files: FEW_FILES });

    expect(screen.queryByLabelText(FILTER_LABEL)).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(FEW_FILES.length);
  });

  it("narrows the rows to the matching paths and counts the matches", async () => {
    renderList();

    expect(screen.getAllByRole("listitem")).toHaveLength(MANY_FILES.length);

    setFilter("*.md");

    await waitFor(() => {
      expect(visiblePaths()).toEqual(["README.md", "docs/guide.md"]);
    });
    expect(screen.getByText("2 / 9")).toBeTruthy();

    setFilter("apps/server, !*.test.tsx");

    await waitFor(() => {
      expect(visiblePaths()).toEqual([
        "apps/server/src/routes/diff.ts",
        "apps/server/src/routes/files.ts",
      ]);
    });
  });

  it("reports an empty result and recovers when the query is cleared", async () => {
    renderList();

    setFilter("*.py");

    await waitFor(() => {
      expect(visiblePaths()).toEqual([]);
    });
    expect(screen.getByText("No changed files match “*.py”.")).toBeTruthy();
    expect(screen.getByText("0 / 9")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Clear file filter"));

    expect(screen.getAllByRole("listitem")).toHaveLength(MANY_FILES.length);
    expect(screen.queryByText("0 / 9")).toBeNull();
  });

  it("clears the query on Escape", async () => {
    renderList();

    setFilter("*.md");
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    fireEvent.keyDown(screen.getByLabelText(FILTER_LABEL), { key: "Escape" });

    expect(screen.getAllByRole("listitem")).toHaveLength(MANY_FILES.length);
    expect(
      (screen.getByLabelText(FILTER_LABEL) as HTMLInputElement).value,
    ).toBe("");
  });

  it("keeps each thread's query apart and restores it when returning", async () => {
    renderList();

    setFilter("*.md");
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("link", { name: "Other thread" }));

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(MANY_FILES.length);
    });
    expect(
      (screen.getByLabelText(FILTER_LABEL) as HTMLInputElement).value,
    ).toBe("");

    fireEvent.click(screen.getByRole("link", { name: "First thread" }));

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });
    expect(
      (screen.getByLabelText(FILTER_LABEL) as HTMLInputElement).value,
    ).toBe("*.md");
  });

  it("keeps the row click and diff actions working on filtered rows", async () => {
    const onFileClick = vi.fn();
    const onOpenDiffClick = vi.fn();
    renderList({ onFileClick, onOpenDiffClick });

    setFilter("README.md");
    await waitFor(() => {
      expect(visiblePaths()).toEqual(["README.md"]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Open README.md" }));
    expect(onFileClick).toHaveBeenCalledWith(MANY_FILES[5]);

    fireEvent.click(
      screen.getByRole("button", { name: "Open split diff for README.md" }),
    );
    expect(onOpenDiffClick).toHaveBeenCalledWith(MANY_FILES[5]);
  });
});
