// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartCommitPicker } from "./StartCommitPicker.fork";

const commitsQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isError: false,
  isLoading: false,
}));

vi.mock("@/hooks/queries/environment-queries", () => ({
  useEnvironmentCommits: () => commitsQuery,
}));

const COMMITS = [
  {
    sha: "abc1234567890",
    shortSha: "abc1234",
    subject: "Commit the work",
    authorName: "BB",
    authoredAt: 1,
  },
  {
    sha: "def4567890123",
    shortSha: "def4567",
    subject: "Earlier change",
    authorName: "BB",
    authoredAt: 2,
  },
];

function openPicker(
  overrides: Partial<Parameters<typeof StartCommitPicker>[0]> = {},
) {
  const onSelect = vi.fn();
  const onToggle = vi.fn();
  render(
    <StartCommitPicker
      environmentId="env_1"
      isActive
      isSaving={false}
      onSelect={onSelect}
      onToggle={onToggle}
      startRef="abc1234567890"
      {...overrides}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Since start|Start commit/ }),
  );
  return { onSelect, onToggle };
}

beforeEach(() => {
  commitsQuery.data = { outcome: "available", commits: COMMITS };
  commitsQuery.isError = false;
  commitsQuery.isLoading = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StartCommitPicker", () => {
  it("lists the recent commits and reports the picked one", async () => {
    const { onSelect } = openPicker();

    const row = await screen.findByTitle("def4567 Earlier change");
    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith("def4567890123");
  });

  it("toggles the comparison from the menu row", async () => {
    const { onToggle } = openPicker();

    fireEvent.click(
      await screen.findByTitle(
        "Compare the workspace against the start commit",
      ),
    );

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows the current start commit subject in the section header", async () => {
    openPicker();

    expect(
      await screen.findByText("Start commit · abc1234 Commit the work"),
    ).toBeTruthy();
  });

  it("filters the list by the search query", async () => {
    openPicker();

    fireEvent.change(await screen.findByLabelText("Search commits"), {
      target: { value: "earlier" },
    });

    expect(await screen.findByTitle("def4567 Earlier change")).toBeTruthy();
    expect(screen.queryByTitle("abc1234 Commit the work")).toBeNull();
  });

  it("explains an empty or failed commit read", async () => {
    commitsQuery.data = { outcome: "available", commits: [] };
    openPicker();
    expect(await screen.findByText("No commits found.")).toBeTruthy();

    cleanup();
    commitsQuery.data = undefined;
    commitsQuery.isError = true;
    openPicker();
    expect(await screen.findByText("Could not load commits.")).toBeTruthy();
  });

  it("offers the picker before any start commit is known", async () => {
    openPicker({ isActive: false, startRef: null });

    expect(screen.getByRole("button", { name: "Start commit" })).toBeTruthy();
    expect(await screen.findByLabelText("Search commits")).toBeTruthy();
  });
});
