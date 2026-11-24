# Changed files: целевое открытие в diff-панели и прямой diff-просмотр файла

## Проблема

Клик по файлу в списке изменённых файлов над полем ввода (composer segment
Git-плагина) открывает diff-таб во вторичной панели, но не позиционируется
на выбранном файле: любая строка открывает один и тот же вид. Причин две:

- целевая карточка файла остаётся свёрнутой
  (`GIT_DIFF_AUTO_COLLAPSE_FILE_THRESHOLD` сворачивает все карточки при
  большом списке), а `virtualizer.scrollToIndex` считает позицию по
  оценочным высотам — после `measureElement` реальные смещения уплывают;
- до мержа `58db300210` (upstream #6157) существовал fork-функционал
  прямого открытия файла в diff-режиме редактора
  (`handleChangedFileDiffClick`, commit `9c68eefe7c`), который потерян:
  consumer-сторона (`WorkspaceFileTabState.diffIntent` →
  `experimental_diffIntent` → Monaco) жива, но producer-поле
  `experimental_openFilePreview` не принимает diff-intent, и ни один caller
  его не создаёт.

## Цель

1. Клик по файлу в списке изменённых открывает diff-таб, прокручивает к
   нажатому файлу и раскрывает его карточку; остальные карточки сохраняют
   своё состояние (остаются свёрнутыми по auto-collapse).
2. Отдельное действие строки (иконка «open file») открывает файл в
   Monaco-табе в diff-режиме `split` с отметками изменённых строк,
   навигацией по изменениям и позиционированием на первое изменение;
   пользователь может переключиться в `unified` с сохранением отметок.
   Для файлов, открываемых по git-ref (удалённые), intent не применяется —
   остаётся preview.

## Не-цели

- Новый diff-view архитектурно: переиспользуются существующие fork-швы
  (`bb-fork(file-diff*)`).
- Восстановление `DiffChangeRail`/stepper в diff-панели списка файлов.
- Diff-intent для built-in preview (не-Monaco opener): intent допустимо
  отбрасывается.
- Изменение правил выбора diff/preview по статусу файла
  (`resolveChangedFileOpen` остаётся).

## Артефакты

- [design.md](design.md)
- [tasks.md](tasks.md)
- [operator-checklist.md](operator-checklist.md)

## Связанное

- [docs/api_to_audit.md](../../../docs/api_to_audit.md) — новый
  `experimental_diffIntent` в `experimental_openFilePreview` потребует
  записи.
- Исторический контекст: коммит `9c68eefe7c` (one-click split diffs),
  merge `58db300210` (#6157).
