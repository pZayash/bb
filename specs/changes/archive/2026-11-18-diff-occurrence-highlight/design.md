# Design: подсветка вхождений слова/выделения в diff и file view

## Решение

DOM-уровневая подсветка поверх `@pierre/diffs`, в fork-owned модуле.
Рендерер не трогаем: pierre отдаёт готовые `span[data-char]` токены и
поддерживает нативное выделение текста — этого достаточно для обоих
триггеров (клик-слово, drag-выделение).

Почему не shiki-transformer/decorations: перетокенизация и ререндер всего
diff на каждый клик — тяжело и ломает virtualization-пайплайн pierre.
Почему не `onTokenClick`: `tokenText` — это shiki-токен, а не слово
(может слипать пунктуацию); точнее слово даёт `caretRangeFromPoint` +
расширение до границ слова. Отказ от pierre-колбэков в пользу нативных
событий убирает проводку опций — кроме вызова хука в хосте ничего не нужно.

Почему CSS Custom Highlight API, а не class на span:
- ноль мутаций DOM — pierre-рендер не конфликтует, очистка = одна строка;
- покрывает подстроки внутри токена (выделение может резать токен);
- `CSS.highlights` — глобальный реестр, поэтому имя хайлайта уникально на
  экземпляр (`bb-word-<useId>`), правило `::highlight(<name>)` инжектится
  модулем в `<head>` один раз — иначе две панели diff гасили бы друг друга.

## Детали

Новый модуль `apps/app/src/components/code/word-highlight.fork.ts`
(имя по конвенции `*.fork.ts`, весь код fork-owned):

- `useWordHighlight(containerRef)` — хук; внутри:
  - `click` на контейнере → `document.caretRangeFromPoint(e.clientX,
    e.clientY)` → text node + offset → расширение в обе стороны по
    `/[\p{L}\p{N}_$]+/u` (кириллица BSL покрыта `\p{L}`). Пусто →
    fallback на `textContent` ближайшего `span[data-char]`, если это
    слово. Тот же word повторно → clear (toggle).
  - `mouseup`/`selectionchange` → `getSelection()`; непустое выделение
    внутри контейнера, `trim()`, без `\n`, ≤200 символов → substring-режим.
  - `pointerdown` вне слова / свёрнутое выделение без клика-слова /
    `keydown` Escape → clear.
- `findOccurrenceRanges(container, needle, mode)` — чистая функция:
  TreeWalker по text node'ам внутри `[data-line]` (минус
  `[data-column-number]`, `style`/`script`); word-режим —
  совпадение с границами слова (символ до/после не word-char),
  substring — `indexOf`. Возвращает `Range[]`. Находит только внутри
  одного text node (потолок: матч на стыке двух shiki-токенов не ловится —
  редкий случай, осознанное упрощение).
- Применение: `CSS.highlights.set(name, new Highlight(...ranges))`;
  `::highlight(<name>)` — `color-mix(in oklab, var(--ink) 30%,
  transparent)` фоном (токены темы, не литерал). Гард: `!("highlights"
  in CSS)` → no-op (jsdom, старые WebKit).
- `MutationObserver` (childList, subtree) + debounce ~50 мс на контейнере
  и shadow roots: pierre виртуализирует строки, новые ряды доразмечаются
  тем же паттерном. Очистка observer + `CSS.highlights.delete(name)` +
  свои `<style>` на unmount.
- Матч идёт только по text node внутри `[data-line]` — код и
  комментарии подсвечиваются, UI-хром (заголовки, номера строк,
  «expand N lines», инжектированные стили) — нет.
  `useTokenTransformer: true` оставлен в опциях pierre: `data-char`
  нужен только fallback-экстракту слова по токену, матч от него не
  зависит.
- Слово под кареткой — `caretRangeFromPoint`, fallback на стандартный
  `caretPositionFromPoint` (Firefox: на ShadowRoot есть только он),
  далее — `composedPath` → Element в `[data-line]` → per-char
  `getBoundingClientRect` хит-тест; клики по `[data-column-number]`
  игнорируются. Выделение читается `getSelection()` по document и
  каждому shadow root; `selectionchange` слушается и на ShadowRoot.

Проводка (upstream-файлы, маркер `// bb-fork(occurrence-highlight):`, ≤5
строк на файл):

- [BbDiff.tsx](../../../../apps/app/src/components/code/BbDiff.tsx) —
  `useWordHighlight(containerRef)` рядом с `containerRef` (строка ~80).
- [BbSourceCode.tsx](../../../../apps/app/src/components/code/BbSourceCode.tsx) —
  то же на его контейнере.

Тест `apps/app/src/components/code/word-highlight.fork.test.ts` —
pure-функции `findOccurrenceRanges` и word-extraction на DOM-фикстуре
(`span[data-char]`), без рендера pierre.

## Растворение

- Поведение → fork-модуль + `bb-fork(occurrence-highlight)` маркеры;
  отслеживается через `rg "bb-fork"` и `git diff upstream/main --stat`.
- Потолки (виртуализация, матч на стыке токенов, jsdom-гард, Firefox
  fallback) → этот design.md и tasks.md 1.8; в коде комментарии запрещены
  `bb/no-comments` (исключение — `bb-fork` маркеры).
- Ручная проверка → operator-checklist.md.
- ADR не нужен: решение откатывается одним файлом + двумя строками
  проводки, критерии ADR не выполнены.

## Риски

- Pierre может перехватывать pointer-события (line selection) — слушаем
  на контейнере в bubble-фазе после pierre; при конфликте — проверить
  вручную (оператор-чеклист).
- Матч на стыке двух shiki-токенов не подсвечивается — осознанный потолок.
- `MutationObserver` на частые ререндеры — дебаунс; цена scan =
  indexOf по text node'ам видимого окна, дёшево.
- strict-mode двойной mount — cleanup хука обязан убирать observer,
  стиль и запись в `CSS.highlights`.
