// Окно загрузки A4 — SPEC §4.8:329–350, разметка design/Демо-навигатор v2.dc.html:197–287.
// Блока совпадения названия A4′ (§4.8:341–346), его переключателей и кнопок
// «Заменить» / «Добавить» здесь нет — это DN-25.
//
// Нажатие primary — по решению владельца от 18.09.2026 (bd DN-14), а не по
// §4.8:350. Библиотеки «Мои» ещё нет (DN-25), поэтому сценарий в неё не
// записывается: окно закрывается, сценарий открывается на первом шаге, тост
// «Сценарий добавлен в „Мои“: …». Адрес страницы — DN-16.
//
// Окно монтируется на каждое открытие (App.tsx), поэтому после «Отмены» оно
// открывается пустым.
//
// Разбор (read.ts вместе с zod) и снимки карт подгружаются динамическим импортом
// при открытии окна, одновременно с SheetJS (§1:20). До выбора файла они не нужны,
// а иначе стартовый набор перешёл бы лимит 120 KB gzip (§8:427, tests/build.test.ts).
// Если чанк не загрузился, это обрабатывается так же, как отказ SheetJS.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import type { ReadResult } from '../../excel/read.ts';
import { loadXlsx } from '../../excel/xlsx.ts';
import { ru } from '../../i18n/ru.ts';
import { useAppStore } from '../../state/context.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { downloadTemplate } from '../ui/download.ts';
import { UploadIcon } from '../ui/icons.tsx';
import { Modal } from '../ui/Modal.tsx';
import { SectionCaption } from '../ui/SectionCaption.tsx';
import styles from './ImportModal.module.css';

/** Файл не выбран → идёт разбор → разбор готов. */
type Phase =
  | { kind: 'empty' }
  | { kind: 'checking'; fileName: string }
  | { kind: 'checked'; fileName: string; result: ReadResult };

/** Отчёт длиннее стольких строк получает свою прокрутку (§4.8:339). */
const REPORT_SCROLL_AFTER = 12;

/** Разбор файла и снимки карт — отдельным чанком (см. шапку файла). */
function loadParser() {
  return Promise.all([import('./importFile.ts'), import('../../pm/snapshots.ts')]);
}

export function ImportModal() {
  const { dispatch } = useAppStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'empty' });
  const zoneRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Номер последнего разбора: ответ более раннего файла не затирает более поздний.
  const requestRef = useRef(0);
  const promptId = useId();
  const hintId = useId();

  // SheetJS и разбор грузятся при первом открытии окна (§1:20), чтобы после выбора
  // файла не ждать. Если загрузка не удалась, разбор повторит её и сам обработает отказ.
  useEffect(() => {
    loadXlsx().catch(() => undefined);
    loadParser().catch(() => undefined);
  }, []);

  const close = useCallback(() => {
    dispatch({ type: 'closeModal' });
  }, [dispatch]);

  const check = async (file: File): Promise<void> => {
    requestRef.current += 1;
    const request = requestRef.current;
    setPhase({ kind: 'checking', fileName: file.name });
    try {
      // Загрузка чанка и pmSnapshots() — внутри try: при их сбое зона тоже вернётся в начало.
      const [{ readImportFile }, { pmSnapshots }] = await loadParser();
      const result = await readImportFile(file, pmSnapshots());
      if (request === requestRef.current) {
        setPhase({ kind: 'checked', fileName: file.name, result });
      }
    } catch {
      // Не загрузилась SheetJS или чанк разбора. Текста для этого случая в SPEC нет:
      // зона молча возвращается к выбору файла.
      if (request === requestRef.current) {
        setPhase({ kind: 'empty' });
      }
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Сброс значения: повторный выбор того же, уже исправленного файла снова даст change.
    input.value = '';
    if (file !== undefined) {
      void check(file);
    }
  };

  // Без preventDefault на dragover не будет drop: браузер откроет файл сам и уйдёт со страницы.
  const handleDragOver = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      void check(file);
    }
  };

  const result = phase.kind === 'checked' ? phase.result : null;
  const hasDanger = result?.report.some((row) => row.level === 'danger') ?? false;
  const scenario = hasDanger ? undefined : result?.scenario;
  // Кнопка недоступна, пока файл не выбран, не разобран или есть danger (§4.8:348).
  const canSubmit = scenario !== undefined;

  const submit = (): void => {
    if (result === null || scenario === undefined) {
      return;
    }
    close();
    dispatch({ type: 'openScenario', scenario });
    dispatch({ type: 'showToast', message: ru.importModal.added(result.summary.steps) });
  };

  // Текст зоны до выбора, во время разбора и после (§4.8:331, :337). «Исправленный
  // файл» — только при danger, как в макете (v2:487, :533): предупреждения не мешают загрузке.
  let prompt: string;
  let hint: string | null;
  switch (phase.kind) {
    case 'empty':
      prompt = ru.importModal.dropPrompt;
      hint = ru.importModal.dropHint;
      break;
    case 'checking':
      prompt = ru.importModal.checking;
      hint = null;
      break;
    case 'checked':
      prompt = phase.fileName;
      hint = hasDanger ? ru.importModal.reselectHint : ru.importModal.checkedOk;
      break;
  }

  const footer = (
    <>
      {hasDanger && <p className={styles.footerHint}>{ru.importModal.fixErrors}</p>}
      <Button variant="neutral" onClick={close}>
        {ru.importModal.cancel}
      </Button>
      <Button variant="primary" disabled={!canSubmit} onClick={submit}>
        {ru.importModal.submitAdd}
      </Button>
    </>
  );

  return (
    <Modal
      open
      width={720}
      title={ru.importModal.title}
      closeLabel={ru.importModal.close}
      onClose={close}
      initialFocusRef={zoneRef}
      footer={footer}
    >
      <section>
        <SectionCaption as="h3">{ru.importModal.step1}</SectionCaption>
        {/* Имя зоны — главный текст, описание — подсказка: иначе они склеятся в одно имя. */}
        <button
          ref={zoneRef}
          type="button"
          className={styles.zone}
          aria-labelledby={promptId}
          aria-describedby={hint === null ? undefined : hintId}
          onClick={() => {
            inputRef.current?.click();
          }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <UploadIcon className={styles.zoneIcon} />
          <span id={promptId}>{prompt}</span>
          {/* Строка подсказки есть всегда: во время разбора она пустая (§4.8:337 задаёт
              только «Проверяю файл…»), но держит высоту зоны — иначе ссылка, «Схема
              шаблона» и подвал прыгают при каждом выборе файла. */}
          <span
            id={hintId}
            className={styles.zoneHint}
            aria-hidden={hint === null ? true : undefined}
          >
            {hint}
          </span>
        </button>
        {/* Сразу за зоной, а не первым или последним: Tab-ловушка Modal ищет крайние
            фокусируемые, а скрытое поле фокус не получит. */}
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={handleInputChange} />
        <div className={styles.links}>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              // Не загрузилась SheetJS — шаблон не скачивается; текста ошибки в SPEC нет.
              downloadTemplate().catch(() => undefined);
            }}
          >
            {ru.importModal.downloadTemplate}
          </button>
        </div>
        <div className={styles.rules}>
          <div className={styles.rulesTitle}>{ru.importModal.templateSchema}</div>
          <ul className={styles.rulesList}>
            {ru.importModal.templateRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>

      {result !== null && (
        <section>
          <SectionCaption as="h3">{ru.importModal.step2}</SectionCaption>
          <p className={styles.summary}>{ru.summary.text(result.summary)}</p>
          {/* Строки — блоки сценария. При danger readWorkbook блоков не отдаёт — таблицы нет. */}
          {scenario !== undefined && (
            <table className={`${styles.table} ${styles.sheetTable}`}>
              <thead>
                <tr>
                  <th>{ru.importModal.sheetColumns.sheet}</th>
                  <th className={styles.stepsCol}>{ru.importModal.sheetColumns.steps}</th>
                </tr>
              </thead>
              <tbody>
                {scenario.blocks.map((block) => (
                  <tr key={block.n}>
                    <td>{ru.importModal.blockRow(block.n, block.title)}</td>
                    <td className={styles.stepsCol}>{block.steps.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* data-scroll, а не класс: состояние видно и в тестах, где классы CSS-модулей — прокси. */}
          <div
            className={styles.report}
            data-scroll={result.report.length > REPORT_SCROLL_AFTER ? 'true' : undefined}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.levelCol}>{ru.importModal.reportColumns.level}</th>
                  <th className={styles.sheetCol}>{ru.importModal.reportColumns.sheet}</th>
                  <th className={styles.rowCol}>{ru.importModal.reportColumns.row}</th>
                  <th>{ru.importModal.reportColumns.message}</th>
                </tr>
              </thead>
              <tbody>
                {result.report.map((row, index) => (
                  // Отчёт не меняется после разбора — индекс как ключ безопасен.
                  <tr key={index}>
                    <td>
                      {/* Уровень — пилюля цветами §5:364 с подписью по-русски (§3.5:193). */}
                      <Badge tone={row.level}>{ru.report.levels[row.level]}</Badge>
                    </td>
                    {/* У строк уровня книги (E01, E02, I03) лист — '' (bd DN-05): ячейка пустая. */}
                    <td>{row.sheet}</td>
                    <td>{row.row ?? ru.report.noRow}</td>
                    <td className={styles.messageCol}>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Modal>
  );
}
