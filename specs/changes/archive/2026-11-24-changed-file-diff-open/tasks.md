# Tasks: changed-file-diff-open

## 1. Diff-таб: раскрытие и позиционирование целевого файла

- [x] 1.1 `plugins/git/ui/diff/DiffFilesPanel.tsx` — в эффекте,
  реагирующем на `scrollToPath`: перед `virtualizer.scrollToIndex`
  вызвать `writeDiffFileCardStates(diffIdentity, [{ path: scrollToPath,
  collapsed: false }])`. Запись состояния — в том же эффекте, скролл —
  после того как состояние применено (разделить на два эффекта или один
  эффект + `requestAnimationFrame`, ориентируясь на то, как уже читается
  `readDiffFileCardState` в файле). Добавить fork-маркер
  `// bb-fork(file-diff-open): <why>`. Остальные карточки не трогать —
  раскрывается только целевой путь.
- [x] 1.2 `plugins/git/ui/diff/DiffFilesPanel.test.tsx` — тест: при
  получении `scrollToPath` целевая карточка становится `collapsed: false`
  и выполняется scroll к её индексу; нецелевая свёрнутая карточка
  остаётся свёрнутой.

## 2. SDK: `experimental_diffIntent` в `experimental_openFilePreview`

- [x] 2.1 `packages/plugin-sdk/src/app-contract.ts` — в тип options
  `experimental_openFilePreview` (сигнатура
  `BbNavigate.experimental_openFilePreview`, ~строки 2907 и 5613)
  добавить опциональное поле
  `experimental_diffIntent?: ExperimentalFileDiffIntent` с JSDoc:
  «request a diff view for the opened file; `requestId` mints a fresh
  intent per call; absent `base` means `merge_base`».
- [x] 2.2 `packages/plugin-sdk/src/internal/file-navigation-validation.ts`
  — в `normalizeExperimentalFilePreviewOptions`: извлечь
  `experimental_diffIntent` (default `null`), валидировать: объект с
  ключами `requestId` (непустая строка), `view` ∈ `{"unified","split"}`,
  опциональный `base` ∈ `{"merge_base","thread_start"}`; лишние ключи →
  `null`. Вернуть `{ options, opener, diffIntent }`.
  `ExperimentalFileOpenOptions` и `normalizeExperimentalFileOpenOptions`
  не менять.
- [x] 2.3 `apps/app/src/lib/app-navigation-host.tsx` —
  `AppFilePreviewIntent` получает
  `diffIntent?: FilePreviewDiffIntent` (импорт типа из `@bb/client-core`;
  SDK-тип `ExperimentalFileDiffIntent` структурно совместим).
- [x] 2.4 `apps/app/src/lib/plugin-navigation-hooks.ts` —
  `experimental_openFilePreview`: `normalized.diffIntent !== null` →
  добавить `diffIntent: normalized.diffIntent` в intent, передаваемый в
  `appNavigation.openFilePreview`.
- [x] 2.5 `apps/app/src/components/secondary-panel/usePanelFiles.ts` —
  `livePreviewRequest`: в ветке `target.kind === "workspace"` добавить
  `diffIntent: intent.diffIntent ?? null` в `tab` (поле
  `WorkspaceFileTabState.diffIntent` уже существует); ветки `host` и
  `thread-storage` — без intent.
- [x] 2.6 `docs/api_to_audit.md` — запись про `experimental_diffIntent`:
  поведение (file opener получает `experimental_diffIntent`,
  поддерживающие opener'ы показывают diff-режим; остальные
  игнорируют), критерии стабилизации, caller — git plugin changed-files
  row action.
- [x] 2.7 `apps/app/src/lib/plugin-sdk-app-impl.test.tsx` (или ближайший
  файл тестов навигации) — `experimental_openFilePreview` с валидным
  intent прокидывает `diffIntent` в `openFilePreview`; с невалидным
  возвращает `false`; без intent — `diffIntent` отсутствует.
- [x] 2.8 `apps/app/src/components/secondary-panel/usePanelFiles.test.tsx`
  — intent с `diffIntent` → созданный tab несёт `tab.diffIntent`;
  intent без — `diffIntent` отсутствует.

## 3. Git-плагин: действие строки «open file diff»

- [x] 3.1 `plugins/git/ui/changed-files.tsx` — `ChangedFileActions`:
  `onOpenChangedFile(path)` заменить на
  `onChangedFileDiffClick(selection: WorkspaceChangedFileSelection<
  WorkspaceFileStatus>)`. В `useChangedFileActions`: вызвать
  `resolveChangedFileOpen(selection)`; для `kind === "preview"` —
  `navigate.experimental_openFilePreview` с `experimental_ref` как в
  `onChangedFileClick` (без intent); для `kind === "diff"` — тот же вызов
  с `experimental_diffIntent: { requestId: <fresh id>, view: "split" }`.
  Генератор id: проверить наличие `nanoid`/uuid в deps git-плагина; если
  нет — `crypto.randomUUID()`.
- [x] 3.2 `plugins/git/ui/changed-files.tsx` — `ChangedFileRow`:
  существующий action `ExternalLink` «Open file in tab» → вызывать
  `actions.onChangedFileDiffClick({ file, section })`; label — «Open
  file diff».
- [x] 3.3 `plugins/git/ui/changed-files.actions.test.tsx` — тест producer:
  `onChangedFileDiffClick` для модифицированного файла шлёт
  `experimental_diffIntent` с `view: "split"` и уникальным `requestId`
  на каждый вызов; для deleted — `experimental_ref` без intent.

## 4. Проверки

- [x] 4.1 `pnpm exec turbo run typecheck` для затронутых пакетов:
  `apps/app`, `plugins/git`, `packages/plugin-sdk` (фильтры по именам из
  их `package.json`).
- [x] 4.2 Прогнать затронутые тесты vitest: `DiffFilesPanel.test.tsx`,
  `changed-files.test.ts`, `plugin-sdk-app-impl.test.tsx`,
  `usePanelFiles.test.tsx`, monaco `app.fork.test.tsx` (consumer не
  менялся, но регрессию исключить).
- [x] 4.3 `pnpm run check:generated` — убедиться, что generated-файлы не
  задеты.
