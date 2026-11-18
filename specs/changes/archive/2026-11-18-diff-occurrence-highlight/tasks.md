# Tasks: подсветка вхождений слова/выделения в diff и file view

## 1. Fork-модуль word-highlight

- [x] 1.1 Создать `apps/app/src/components/code/word-highlight.fork.ts`:
  хук `useWordHighlight(containerRef: RefObject<HTMLElement | null>)`.
  Внутри — чистые функции, экспортируемые для тестов:
  `extractWordAtPoint(x, y)` (caretRangeFromPoint → расширение по
  `/[\p{L}\p{N}_$]+/u`, fallback `span[data-char]`) и
  `findOccurrenceRanges(container, needle, mode: "word" | "substring")`.
- [x] 1.2 В хуке: обработчик `click` на контейнере — слово под кареткой →
  toggle word-подсветки; повторный клик по тому же слову → снять.
- [x] 1.3 В хуке: `mouseup`/`selectionchange` — непустое выделение внутри
  контейнера (`trim()`, без `\n`, ≤200 символов) → substring-подсветка.
- [x] 1.4 В хуке: снятие — `pointerdown` на не-слове, свёрнутое выделение
  без слова, `Escape` (keydown на document, только когда подсветка активна).
- [x] 1.5 Применение через CSS Custom Highlight API: уникальное имя на
  экземпляр (`bb-word-<useId>`), `CSS.highlights.set(name, new
  Highlight(...ranges))`, правило `::highlight(<name>)` инжектить в
  `<head>` один раз на имя; фон `color-mix(in oklab, var(--ink) 30%,
  transparent)`. Гард `!("highlights" in CSS)` → no-op.
- [x] 1.6 `MutationObserver` (childList+subtree) на контейнере, дебаунс
  ~50 мс — перевешивать подсветку на доразмеченные строки.
- [x] 1.7 Cleanup на unmount: observer.disconnect, `CSS.highlights.delete`,
  удаление инжектированного `<style>` если имён больше нет.
- [x] 1.8 Потолки зафиксированы в design.md (комментарии в коде запрещены
  `bb/no-comments`, исключение — только `bb-fork` маркеры): матч только
  внутри одного text node; подсветка только отрендеренного окна; no-op без
  CSS.highlights; caret-API — `caretRangeFromPoint` +
  `caretPositionFromPoint`.

## 2. Проводка в хосты

- [x] 2.1 `apps/app/src/components/code/BbDiff.tsx`: импорт + вызов
  `useWordHighlight(containerRef)` рядом с `containerRef` (~строка 80);
  маркер `// bb-fork(occurrence-highlight): word/selection highlight`.
- [x] 2.2 `apps/app/src/components/code/BbSourceCode.tsx`: то же на его
  контейнерном ref; тот же маркер.

## 3. Тесты и проверки

- [x] 3.1 `apps/app/src/components/code/word-highlight.fork.test.ts`:
  DOM-фикстура — `span[data-char]` внутри `[data-line]`; кейсы — word-матч с границами
  (`ОсновнаяСтрана` ≠ `СтранаОсновнаяСтрана`), substring внутри токена,
  кириллическое слово, ноль совпадений, очистка.
- [x] 3.2 Прогнать тесты пакета:
  `pnpm exec turbo run test --filter=@bb/app` (или существующая команда
  пакета для `*.fork.test.tsx` — см. `BbDiff.fork.test.tsx`).
- [x] 3.3 `pnpm exec turbo run typecheck --filter=@bb/app`.
