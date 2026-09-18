// Окно загрузки A4 и A4′ — SPEC §4.8:329–350, разметка design/Демо-навигатор v2.dc.html:197–287,
// блок совпадения названия A4′ — design/catalog-mockup.html:208–234.
//
// Совпадение (§4.8:341–346) ищется только среди «Моих» (duplicate.ts). Под отчётом —
// жёлтый блок с двумя переключателями, «Заменить его» выбран по умолчанию и снова
// выбирается при каждом новом файле (§4.8:343). Подпись primary — «Добавить в мои»,
// при совпадении — «Заменить» или «Добавить» по переключателю (§4.8:348).
//
// Нажатие (§4.8:350) пишет сценарий в «Мои» командой стора (§3.6:203–205): замена —
// replaceMine (id прежний), иначе addMine (при «Добавить как новый» — с названием
// «… (N)»). Затем окно закрывается, сохранённый сценарий открывается на первом шаге,
// тост «добавлен» или «обновлён». Не хватило места — тост про квоту показал стор,
// список не изменился: окно остаётся открытым. Адрес страницы — DN-16.
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
import { formatScenarioDate } from '../../i18n/date.ts';
import { ru } from '../../i18n/ru.ts';
import type { Scenario } from '../../model/schema.ts';
import { useAppStore } from '../../state/context.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { downloadTemplate } from '../ui/download.ts';
import { UploadIcon } from '../ui/icons.tsx';
import { Modal } from '../ui/Modal.tsx';
import { SectionCaption } from '../ui/SectionCaption.tsx';
import { findDuplicate, numberedFreeTitle } from './duplicate.ts';
import styles from './ImportModal.module.css';

/** Файл не выбран → идёт разбор → разбор готов. */
type Phase =
  | { kind: 'empty' }
  | { kind: 'checking'; fileName: string }
  | { kind: 'checked'; fileName: string; result: ReadResult };

/** Переключатель блока совпадения: «Заменить его» или «Добавить как новый» (§4.8:343–344). */
type DuplicateChoice = 'replace' | 'addNew';

/** Отчёт длиннее стольких строк получает свою прокрутку (§4.8:339). */
const REPORT_SCROLL_AFTER = 12;

/**
 * Текст блока A4′ (§4.8:341): целиком — имя группы переключателей, частями — на
 * экране, где название выделено (CAT:71, :225). Дата — в формате каталога (§4.2:251).
 */
function duplicateNotice(existing: Scenario, now: Date) {
  const date = formatScenarioDate(existing.loadedAt, now);
  return {
    label: ru.importModal.duplicate(existing.title, date),
    parts: ru.importModal.duplicateParts(existing.title, date),
  };
}

/** Разбор файла и снимки карт — отдельным чанком (см. шапку файла). */
function loadParser() {
  return Promise.all([import('./importFile.ts'), import('../../pm/snapshots.ts')]);
}

export function ImportModal() {
  const { state, dispatch, commands } = useAppStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'empty' });
  const [choice, setChoice] = useState<DuplicateChoice>('replace');
  const zoneRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Номер последнего разбора: ответ более раннего файла не затирает более поздний.
  const requestRef = useRef(0);
  const promptId = useId();
  const hintId = useId();
  const choiceName = useId();

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
    // Новый файл — «Заменить его» снова выбран по умолчанию (§4.8:343).
    setChoice('replace');
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
  // Совпадение — только при отсутствии ошибок (§4.8:341) и только среди «Моих» (§4.8:346).
  const duplicate =
    scenario === undefined ? undefined : findDuplicate(state.library.items, scenario.title);
  const newTitle =
    scenario === undefined || duplicate === undefined
      ? null
      : numberedFreeTitle(state.library.items, scenario.title);
  const notice = duplicate === undefined ? null : duplicateNotice(duplicate, new Date());

  let submitLabel: string;
  if (duplicate === undefined) {
    submitLabel = ru.importModal.submitAdd;
  } else if (choice === 'replace') {
    submitLabel = ru.importModal.submitReplace;
  } else {
    submitLabel = ru.importModal.submitAddNew;
  }

  // Одна команда «Моих» на событие (context.ts): вторая до перерисовки затёрла бы первую.
  const submit = (): void => {
    if (result === null || scenario === undefined) {
      return;
    }
    let saved: Scenario | null;
    let message: string;
    if (duplicate !== undefined && choice === 'replace') {
      saved = commands.replaceMine(duplicate.id, scenario);
      message = ru.importModal.updated(result.summary.steps);
    } else {
      saved = commands.addMine(newTitle === null ? scenario : { ...scenario, title: newTitle });
      message = ru.importModal.added(result.summary.steps);
    }
    // Места нет: тост про квоту уже показан стором, «Мои» прежние (§3.6:205).
    if (saved === null) {
      return;
    }
    close();
    dispatch({ type: 'openScenario', scenario: saved });
    dispatch({ type: 'showToast', message });
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
        {submitLabel}
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
          {/* A4′ (§4.8:341–344, CAT:225–229): под отчётом. Имя группы — текст блока
              целиком (aria-label, а не aria-labelledby: вычисление имени по <p> с <b>
              внутри в jsdom вставляет пробелы вокруг названия); нативные radio дают
              роль, стрелки клавиатуры и место в Tab-ловушке Modal. */}
          {notice !== null && newTitle !== null && (
            <div className={styles.duplicate} role="radiogroup" aria-label={notice.label}>
              {/* Название выделено, как в CAT:225 (`.notice b`, CAT:71). */}
              <p className={styles.duplicateText}>
                {notice.parts.before}
                <b className={styles.duplicateTitle}>{notice.parts.title}</b>
                {notice.parts.after}
              </p>
              <label className={styles.option}>
                <input
                  type="radio"
                  className={styles.radio}
                  name={choiceName}
                  checked={choice === 'replace'}
                  onChange={() => {
                    setChoice('replace');
                  }}
                />
                {ru.importModal.replaceOption}
              </label>
              <label className={styles.option}>
                <input
                  type="radio"
                  className={styles.radio}
                  name={choiceName}
                  checked={choice === 'addNew'}
                  onChange={() => {
                    setChoice('addNew');
                  }}
                />
                {ru.importModal.addAsNewOption(newTitle)}
              </label>
            </div>
          )}
        </section>
      )}
    </Modal>
  );
}
