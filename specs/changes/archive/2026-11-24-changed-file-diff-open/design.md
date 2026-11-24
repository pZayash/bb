# Design: changed-file-diff-open

## Решение

Два независимых исправления на существующих швах — новых абстракций не
вводим (ponytail).

### Часть 1: позиционирование в diff-табе

`DiffFilesPanel` уже получает `scrollToPath` и делает
`virtualizer.scrollToIndex`. Промах объясняется двумя фактами: целевая
карточка может быть свёрнута (auto-collapse при
`> GIT_DIFF_AUTO_COLLAPSE_FILE_THRESHOLD` файлов), и виртуализатор скроллит
по `estimateCardHeight` — после `measureElement` смещения пересчитываются
и курсор уезжает.

Решение: в эффекте `scrollToPath` сначала записать `collapsed: false` для
целевого пути через `writeDiffFileCardStates`, дождаться следующего
layout-прохода (React state update + re-measure) и только потом
`scrollToIndex`. Свёрнутые карточки имеют фиксированную высоту — оценки
для них точны, поэтому скролл попадает. Разворачиваем только целевой
файл: соответствует решению пользователя и сохраняет auto-collapse
остальных.

Альтернатива «скроллить дважды после measure» отвергнута: не чинит
свёрнутую цель и хрупка к порядку RAF.

### Часть 2: прямой diff-просмотр файла (восстановление fork-функционала)

Consumer-цепочка жива end-to-end и не трогается:
`WorkspaceFileTabState.diffIntent` → `experimental_diffIntent` prop →
`plugins/monaco-editor/app.tsx` (diff mode, base picker, split/unified,
marks, `DiffChangeNav` с `jumpToFirstChange`).

Добавляем только producer-поле:

1. `experimental_openFilePreview` принимает опциональное
   `experimental_diffIntent` типа `ExperimentalFileDiffIntent`
   (`{requestId, base?, view}`) — тип уже есть в контракте.
2. Нормализация в `normalizeExperimentalFilePreviewOptions`: строгая
   проверка ключей, `requestId` — непустая строка,
   `view ∈ {"unified","split"}`, `base ∈ {"merge_base","thread_start"}`
   либо отсутствует.
3. `plugin-navigation-hooks` прокидывает в `appNavigation.openFilePreview`;
   дальше intent попадает в `WorkspaceFileTabState.diffIntent` — механизм
   уже существует (равенство через `areFilePreviewDiffIntentsEqual`,
   `requestId` ре-триггерит intent при повторном открытии того же таба).
4. Запись в `docs/api_to_audit.md` для нового экспериментального поля.
5. Git-плагин: `useChangedFileActions` получает
   `onChangedFileDiffClick(selection)`; вызывает
   `experimental_openFilePreview({target: {kind:"workspace",
   environmentId, path, ...ref}, location: null,
   experimental_diffIntent: {requestId: <id>, view: "split"}})`.
   `ref` — через существующий `resolveChangedFileOpen` (deleted →
   `HEAD`/mergeBaseRef). Для preview-веток (added/untracked/deleted-ref)
   intent не шлём — поведение прежнее, diff там недоступен или
   бессмыслен.
6. `ChangedFileRow`: существующий external-link action заменяется на
   diff-open action (label «Open file diff») — пользователь подтвердил
   отдельное действие на строке; основной клик остаётся на
   `onChangedFileClick`.

`requestId` генерируем на стороне плагина — host-сторона не мятит
(плагин-владелец requestId, см. контракт `ExperimentalFileDiffIntent`:
«requestId is new for every request»).

View по умолчанию `"split"` — историческое поведение `9c68eefe7c`,
пользователь подтвердил monaco-редактор. Переключение в unified — штатная
кнопка `FileDiffControls`, отметки строк сохраняются (уже реализовано).
Позиционирование на первое изменение — `DiffChangeNav.fork.tsx`
`jumpToFirstChange=true` по умолчанию.

`base` не передаём (default `merge_base`) — совпадает с историческим
поведением; семантика секций uncommitted/untracked/committed не мапится
на двоичный base, и расширять enum ради этого не будем.

## Детали

Файлы (прогноз точек изменения):

- `plugins/git/ui/diff/DiffFilesPanel.tsx` — эффект `scrollToPath`: expand
  перед scroll (`// bb-fork(file-diff-open)`).
- `plugins/git/ui/changed-files.tsx` — `onChangedFileDiffClick`, action
  в `ChangedFileRow`.
- `packages/plugin-sdk/src/app-contract.ts` — `experimental_diffIntent`
  в options `experimental_openFilePreview`; JSDoc.
- `packages/plugin-sdk/src/internal/file-navigation-validation.ts` —
  нормализация intent (возврат `{options, opener, diffIntent}`;
  `ExperimentalFileOpenOptions` не расширяем — exact-keys
  `["target","location"]` сохраняется, intent не уходит в
  `experimental_openFileExternally`).
- `apps/app/src/lib/app-navigation-host.tsx` —
  `AppFilePreviewIntent.diffIntent?: FilePreviewDiffIntent`.
- `apps/app/src/lib/plugin-navigation-hooks.ts` — pass-through.
- `apps/app/src/components/secondary-panel/usePanelFiles.ts` —
  `livePreviewRequest` копирует `intent.diffIntent` →
  `WorkspaceFileTabState.diffIntent` (только ветка `workspace`;
  ref-source отклоняет intent на стороне producer).
- `docs/api_to_audit.md` — audit-запись.
- Тесты: `DiffFilesPanel.test.tsx` (expand+scroll), `changed-files.test.ts`
  (producer intent), `plugin-sdk-app-impl.test.tsx` и
  `usePanelFiles.test.tsx` (нормализация и проброс), monaco
  `app.fork.test.tsx` (smoke применения intent).

Все fork-правки маркируются `// bb-fork(file-diff-open)` в upstream-файлах;
изменения в SDK/app-файлах — минимальные швы.

## Растворение

- Требования → анкеры `// VERIFIED-BY: changed-file-diff-open` в коде на
  ключевых решениях (expand-перед-scroll, producer intent).
- `experimental_diffIntent` стабилизируется через `api_to_audit` как
  остальные experimental API.
- Ручные проверки → `operator-checklist.md` (UI-прогон в dev-app).

## Риски

- Раскрытие карточки до scroll сдвигает offsets виртуализатора —
  митигация: scroll в отдельном эффекте/кадре после записи состояния;
  тест с виртуализатором.
- Файл не в списке diff (binary/empty patch): intent открывает tab без
  изменений — Monaco покажет «No changes», поведение терпимое.
- `experimental_ref` + `diffIntent` одновременно не шлём (ref-preview без
  intent) — исключает спорную комбинацию.
- Совместимость SDK: поле опционально, старые caller'ы не ломаются;
  `experimental_` префикс по AGENTS.
