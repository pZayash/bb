# Вердикт ревью: diff-occurrence-highlight — раунд 2

**Когда**: 2026-11-18 (локальное)
**Ревьювер**: SWE-2 High (дочерний тред оркестратора)
**Резюме**: годен

Все находки r1 закрыты, live-проверка оператора пройдена. Остались
только мелочи и один вопрос по цене `useTokenTransformer` — ни один
пункт не блокирует коммит.

## Закрытые находки r1

- ✅ Per-name стили: `[data-bb-word-highlight="<name>"]` + массив
  `injectedStyles`, cleanup удаляет только свои
  (`word-highlight.fork.ts:212-226, 447-450`). Мульти-инстанс работает.
- ✅ `selection.containsNode` убран → `getRootNode()`/`ShadowRoot.host`
  (`:255-261`) + `rootSelections` по document и каждому shadow root с
  per-root `selectionchange` (`:228-241, 305-307`). Firefox-путь
  graceful (нет `shadowRoot.getSelection` → тихий пропуск).
- ✅ `caretAtPoint` пробует `caretRangeFromPoint` →
  `caretPositionFromPoint` (`:48-75`) + composedPath→per-char-rect
  fallback `extractWordFromElement` (`:106-135`).
- ✅ Scope матча: `[data-line]` минус `[data-column-number]`/`style`/
  `script` (`:153-169`) — инжектированный `<style>` и UI-хром не
  матчатся; кейс покрыт тестом.
- ✅ `extractWordAtPoint`: гард `[data-column-number]` (`:89`), строгий
  fallback `^[\p{L}\p{N}_$]+$` (`:99`).
- ✅ Дрифт комментов решён на уровне доков: design.md «Растворение»
  теперь ссылается на `bb/no-comments`; имя теста `.test.ts` совпадает.

## Находки (все 🟡, не блокеры)

- 🟡 `word-highlight.fork.ts:111-134` — `extractWordFromElement` ходит
  Walker'ом по ВСЕМ text node'ам `hit`-элемента без reject'ов: клик по
  номеру строки в fallback-ветке (Firefox, где caret-API не сработал)
  вернёт число и подсветит все `42` в коде — частичный обход гарда r1.
  Фикс: тот же acceptNode без требования `[data-line]` (reject
  `[data-column-number]`, `style`, `script`).
- 🟡 `word-highlight.fork.ts:364-368` — `active`-гард в `onClick`
  не scoped по контейнеру: любое несвёрнутое выделение в любом root
  (в т.ч. застрявшее в чужом shadow root) глушит клик-слово.
  Фикс: фильтровать через `selectionTextInside` / anchor-inside.
- 🟡 `word-highlight.fork.ts:399-411` — `selectionchange` слушается и на
  document, и на каждом shadow root: в Chromium одно изменение
  выделения внутри diff стреляет оба раза → двойной `set`+`apply`
  (полный rescan) на каждый selectionchange во время drag. Фикс:
  дедуп по (needle, mode) в `set` или microtask-debounce.
- 🟡 Док-дрифт scope'а: design.md:40,53-57 и tasks.md:9 по-прежнему
  говорят «матч внутри `span[data-char]`» — реализация теперь
  `[data-line]`, `data-char` остался только в fallback экстракта.
  Поправить формулировки при архиве change.
- 🟡 `BbDiff.tsx:117` / `BbSourceCode.tsx:280` — `useTokenTransformer:
  true` включает per-token `data-char`-спаны во всех diff/file view:
  заметный рост DOM (wrapTokenFragments по каждому токену) ради одного
  fallback-пути — `[data-line]`-матч его не использует. Если live-
  проверка на больших файлах не показала лагов — оставить; иначе
  кандидат на вынос (опция + `closest("[data-char]")` fallback).

## Что сходится

- Capture-фаза click/pointerdown: наш обработчик до pierre, без
  `preventDefault`/`stopPropagation` — конфликтов с line selection нет.
- `onClick` → `rootSelections` non-collapsed-гард: клик после drag-
  выделения не перебивает substring-режим. Порядок событий сохранён.
- Cleanup: слушатели (включая per-shadow `selectionchange`), observer,
  таймер, registry-запись, свои `<style>` — strict-mode безопасно.
- Fork-гигиена: 3 шва по 2 строки на файл, все с маркером
  `bb-fork(occurrence-highlight)`; pierre не форканут;
  `shouldUseTokenTransformer` — штатная опция пакета.

## Что чинить (не блокеры — до/при архиве change)

- [ ] Reject `[data-column-number]`/`style`/`script` в Walker
  `extractWordFromElement`.
- [ ] Scope `active`-гарда в `onClick` по контейнеру.
- [ ] Дедуп двойного `selectionchange` (doc+shadow) в `set`.
- [ ] Синк design.md/tasks.md под `[data-line]`-scope.

## Открытые вопросы

- `useTokenTransformer: true` — подтвердить, что DOM-overhead
  измеряли/приняли (опция включена глобально для всех BbDiff/
  BbSourceCode, а нужна только fallback'у). Если нет — предлагаю
  либо задокументировать решение в design.md, либо убрать вместе с
  `data-char` fallback'ом.

## Ссылки

- Реализация: `apps/app/src/components/code/word-highlight.fork.ts`
- Швы: `BbDiff.tsx:16-17,83-84,117-118`, `BbSourceCode.tsx:40-41,251-252,280-281`
- [design.md](specs/changes/diff-occurrence-highlight/design.md),
  [tasks.md](specs/changes/diff-occurrence-highlight/tasks.md)
- Проверка pierre-стороны: `shouldUseTokenTransformer` +
  `wrapTokenFragments` в `@pierre/diffs@1.2.12` dist — `data-char`
  эмитится только при опции.

## Свободная проза

Раунд чистый: все три r1-проблемы закрыты в правильных местах, а
composedPath→rect fallback — приятная страховка для движков без
caret-API, при этом огорожен `data-line`-фильтром и стоит ноль, пока
не нужен. Единственное, что стоит осознанно зафиксировать, — цена
`useTokenTransformer`: сейчас он покупает только fallback экстракта,
но облагает DOM'ом каждый отрендеренный diff в приложении. Решение
любое, главное — чтобы оно было решением, а не побочкой.
