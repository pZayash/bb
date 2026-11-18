// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  expandWordAt,
  findOccurrenceRanges,
} from "./word-highlight.fork";

function buildContainer(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

function rangeText(range: Range): string {
  const node = range.startContainer;
  return (node.textContent ?? "").slice(range.startOffset, range.endOffset);
}

describe("expandWordAt", () => {
  it("expands to word boundaries", () => {
    expect(expandWordAt("const ОсновнаяСтрана = 1", 9)).toBe("ОсновнаяСтрана");
  });

  it("returns the word when offset is at the end", () => {
    expect(expandWordAt("foo bar", 3)).toBe("foo");
  });

  it("returns null on non-word characters", () => {
    expect(expandWordAt("foo = bar", 4)).toBeNull();
  });

  it("treats digits, underscore and $ as word chars", () => {
    expect(expandWordAt("aa _x$1 bb", 5)).toBe("_x$1");
  });
});

describe("findOccurrenceRanges", () => {
  it("word mode matches whole words only", () => {
    const container = buildContainer(
      '<div data-line><span data-char="0">ОсновнаяСтрана</span><span data-char="14"> = </span><span data-char="17">СтранаОсновнаяСтрана</span><span data-char="36">ОсновнаяСтрана</span></div>',
    );
    const ranges = findOccurrenceRanges(
      [container],
      "ОсновнаяСтрана",
      "word",
    );
    expect(ranges).toHaveLength(2);
    for (const range of ranges) {
      expect(rangeText(range)).toBe("ОсновнаяСтрана");
    }
    container.remove();
  });

  it("substring mode matches inside a token", () => {
    const container = buildContainer(
      '<div data-line><span data-char="0">ПрефиксСтранаПостфикс</span></div>',
    );
    const ranges = findOccurrenceRanges([container], "Страна", "substring");
    expect(ranges).toHaveLength(1);
    expect(rangeText(ranges[0])).toBe("Страна");
    container.remove();
  });

  it("ignores text outside code lines", () => {
    const container = buildContainer(
      'слово <b>слово</b> <div data-line><span data-char="0">слово</span></div> слово',
    );
    const ranges = findOccurrenceRanges([container], "слово", "substring");
    expect(ranges).toHaveLength(1);
    container.remove();
  });

  it("does not match injected highlight styles", () => {
    const container = buildContainer(
      '<div data-line><span data-char="0">highlight</span></div><style data-bb-word-highlight="bb-word-x">::highlight(bb-word-x){}</style>',
    );
    const ranges = findOccurrenceRanges([container], "highlight", "substring");
    expect(ranges).toHaveLength(1);
    container.remove();
  });

  it("skips line-number columns", () => {
    const container = buildContainer(
      '<div data-line><span data-column-number="3902">3902</span><span data-char="0">3902</span></div>',
    );
    const ranges = findOccurrenceRanges([container], "3902", "substring");
    expect(ranges).toHaveLength(1);
    container.remove();
  });

  it("returns empty for no matches and empty needle", () => {
    const container = buildContainer("<span>abc</span>");
    expect(findOccurrenceRanges([container], "zzz", "word")).toHaveLength(0);
    expect(findOccurrenceRanges([container], "", "word")).toHaveLength(0);
    container.remove();
  });

  it("is case sensitive", () => {
    const container = buildContainer(
      '<div data-line><span data-char="0">Foo foo FOO</span></div>',
    );
    const ranges = findOccurrenceRanges([container], "foo", "substring");
    expect(ranges).toHaveLength(1);
    container.remove();
  });
});
