import { describe, expect, it } from "vitest";
import { forkSanitizeAgentThreadTitle } from "./agent-title-echo.fork.js";

// bb-fork(windows): agent title echoes of the injected <system_instructions> block.

function sanitize(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

describe("fork agent title echo gate", () => {
  it("keeps an honest agent title", () => {
    expect(forkSanitizeAgentThreadTitle("Fix thread titles", sanitize)).toBe(
      "Fix thread titles",
    );
  });

  it("keeps an honest title that mentions the tag mid-string", () => {
    const title = "Fix <system_instructions> echo in Devin titles";
    expect(forkSanitizeAgentThreadTitle(title, sanitize)).toBe(title);
  });

  it("drops a truncated echo of the injected block", () => {
    expect(
      forkSanitizeAgentThreadTitle(
        "<system_instructions> If the user asks you to move this thread to another che...",
        sanitize,
      ),
    ).toBeNull();
  });

  it("drops a bare tag echo", () => {
    expect(
      forkSanitizeAgentThreadTitle("<system_instructions>", sanitize),
    ).toBeNull();
    expect(forkSanitizeAgentThreadTitle("<system_instru", sanitize)).toBeNull();
  });

  it("drops an echo whose remainder is only a truncation marker", () => {
    expect(
      forkSanitizeAgentThreadTitle(
        "<system_instructions> If the user asks </system_instructions>...",
        sanitize,
      ),
    ).toBeNull();
  });

  it("unwraps real title text that follows the echoed block", () => {
    expect(
      forkSanitizeAgentThreadTitle(
        "<system_instructions> Be terse. </system_instructions> Fix titles",
        sanitize,
      ),
    ).toBe("Fix titles");
  });
});
