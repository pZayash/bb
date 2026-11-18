# Вердикт ревью: diff-occurrence-highlight — раунд 1

**Когда**: 2026-11-18 (локальное)
**Ревьювер**: SWE-2 High (дочерний тред оркестратора)
**Резюме**: на доработку

Заявки `r1-request.md` в треде нет — ревью по брифу оркестратора
(фокусы: DOM-события, shadow DOM, React lifecycle, fork-гигиена,
семантика матчей vs CONTEXT.md). Архитектура и fork-гигиена в порядке;
блокер — баг в дедупликации инжекта стилей: фича не видна ни в одном
инстансе, кроме первого.

## Находки

- 🔴 `apps/app/src/components/code/word-highlight.fork.ts:142-151` —
  `injectHighlightStyle` проверяет наличие ЛЮБОГО `[data-bb-word-highlight]`,
  а не конкретного имени. Второй `BbDiff` на странице (а их много в
  «All changes») видит стиль первого инстанса → свой `::highlight(bb-word-B)`
  не инжектит → `CSS.highlights.set` отрабатывает, но красить нечем:
  подсветка работает только у первого смонтированного инстанса.
  Симметрично `removeHighlightStyles:153-164` при unmount одного инстанса
  сносит чужие правила — у выжившего подсветка гаснет до следующего apply.
  Фикс: писать имя в значение атрибута
  (`style.setAttribute(STYLE_ATTR, name)`), искать
  `[data-bb-word-highlight="${name}"]`, удалять только своё.
- 🟠 `word-highlight.fork.ts:178-181` — `selection.containsNode(host, true)`
  нестандартный (WebKit/Blink only, нет в Firefox): при любом реальном
  выделении на странице с отрендеренным diff → TypeError внутри
  `selectionchange`, substring-режим мёртв + спам в консоль.
  Фикс: заменить на проверку корня — `anchor.getRootNode()` /
  `focus.getRootNode()` является `ShadowRoot`, чей `host` внутри
  контейнера (покрывает и retargeting, и частичное выделение).
- 🟠 `word-highlight.fork.ts:48-70` — `extractWordAtPoint` пробует только
  `caretRangeFromPoint`. В Blink/WebKit document-вариант пирсит shadow —
  работает. В Firefox document.caretRangeFromPoint не пирсит shadow,
  а на `ShadowRoot` есть только стандартный `caretPositionFromPoint`
  (его код не пробует) → клик-слово внутри pierre-diff мёртво на Firefox.
  Фикс: пробовать оба имени; `caretPositionFromPoint` возвращает
  `{offsetNode, offset}` — обернуть в Range одинаково.
- 🟡 `word-highlight.fork.ts:84-94` — TreeWalker принимает все text node
  кроме `[data-column-number]`: матчится текст UI-хрома контейнера
  (заголовки файлов, «expand N lines») и, что хуже, текст самого
  инжектированного `<style>` внутри shadow root (needle вида
  `highlight`/`oklab` создаст Range в style). Дизайн обещал обход только
  `span[data-char]`. Фикс: acceptNode → text node внутри `[data-char]`
  (либо минимум добавить reject для `[data-bb-word-highlight]`). Если
  хром нужен осознанно — отметь в дизайне.
- 🟡 `word-highlight.fork.ts:63-67` — асимметрия extract↔find: клик по
  номеру строки (`[data-column-number]`) вытащит слово-число, хотя
  `findOccurrenceRanges` его же игнорирует → подсветит все `42` в коде.
  И fallback `WORD_CHAR.test(tokenText)` пропускает смешанный токен
  `foo(` как «слово». Фикс: reject по `closest("[data-column-number]")`
  в extract; fallback → `^[\p{L}\p{N}_$]+$`.
- 🟡 tasks 1.8 + design.md «Растворение» обещают `// ponytail:` у
  потолков — в модуле ноль комментариев. Либо добавь 2–3 штуки (стык
  токенов, виртуализированное окно, no-op без CSS.highlights), либо
  сними обещание в tasks/design. Тот же дрифт: тест назван
  `word-highlight.fork.test.ts`, а в design/tasks — `.test.tsx`.

## Что сходится со спекой

- Семантика по CONTEXT.md: word-режим с границами + case-sensitive
  `indexOf`, substring для выделения, toggle/клик мимо/Esc — верно.
- События: `click` после `selectionchange` + гард `!isCollapsed` —
  drag-выделение не перебивается кликом; `pointerdown` снаружи чистит
  чужие инстансы. `keydown Escape` чистит только при активном state.
- Shadow DOM: стили инжектятся в каждый root (правильно — `::highlight`
  scoped per tree), observer подписывается на поздно появившиеся
  shadow root, lazy attach до первого `apply` — ок.
- Strict-mode двойной mount: cleanup снимает слушателей, observer,
  таймер, registry-запись — чисто.
- Fork-гигиена: `*.fork.ts`, швы по 2 строки с маркером
  `bb-fork(occurrence-highlight)`, upstream-файлы не тронуты,
  `getDiffShadowRoots` переиспользован без правок.

## Что чинить

- [ ] Per-name дедупликация стилей + удаление только своего `<style>`
  (находка 1) — блокер, без этого фича видна только в одном инстансе.
- [ ] Заменить `selection.containsNode` на getRootNode-проверку
  (находка 2).
- [ ] Пробовать `caretPositionFromPoint` рядом с `caretRangeFromPoint`
  (находка 3) — или зафиксировать «Chromium/WebKit only» в design.
- [ ] Ограничить TreeWalker `[data-char]` / исключить инжектированный
  `<style>` (находка 4).
- [ ] Гард `[data-column-number]` + строгий fallback в
  `extractWordAtPoint` (находка 5).
- [ ] Разрулить дрифт: `// ponytail:` комменты и имя тест-файла vs
  tasks/design (находка 6).
- [ ] Перепрогнать vitest + tsc6 после правок.

## Открытые вопросы

- Целевой браузерный контур: bb desktop — Chromium, но hosted/web и
  iOS Safari в scope? От ответа зависит, оставить ли Firefox-пункты
  (2, 3) как 🟠 или понизить до «известный потолок» в design.md.
- `handoffs/` не в `.gitignore` — файл вердикта лежит untracked;
  оставить как scratch или добавить `handoffs/` в gitignore?

## Ссылки

- [proposal.md](specs/changes/diff-occurrence-highlight/proposal.md),
  [design.md](specs/changes/diff-occurrence-highlight/design.md),
  [tasks.md](specs/changes/diff-occurrence-highlight/tasks.md)
- [CONTEXT.md](CONTEXT.md) — согласованная семантика.
- Реализация: `apps/app/src/components/code/word-highlight.fork.ts`,
  швы в `BbDiff.tsx:83`, `BbSourceCode.tsx:251`.

## Свободная проза

Каркас крепкий: ленивый attach observer, per-instance имя хайлайта,
правильный порядок click vs selectionchange — всё продумано. Но
дедупликация стилей сломана именно в главном кейсе — «All changes» с
десятком диффов. Вероятно, при разработке проверяли одиночный diff и
баг не всплыл. После правки находки 1 стоит вручную открыть панель с
несколькими файлами и кликнуть слово во втором — это минутная проверка,
которая покрывает обе половины бага (инжект и cleanup).
