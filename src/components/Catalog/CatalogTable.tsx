// Таблица раздела каталога (SPEC §4.2:252–256), разметка design/catalog-mockup.html:
// :112–129 («Общие») и :137–151 («Мои»). Колонки: «Сценарий» (название 600 и имя
// файла под ним) · «Модуль» (Badge) · «Блоков» · «Шагов» · «Со ссылкой» · дата
// («Обновлён» / «Загружен») · колонка действия 48 px. Ширины колонок задаёт строка
// шапки (table-layout: fixed, Catalog.module.css) — одинаково в обоих разделах.
//
// Вся строка открывает сценарий (§4.2:254):
// - клавиатура и скринридер — через <button> с названием в первой ячейке: Enter и
//   Space работают нативно, у строки одно понятное имя;
// - мышь — обработчик клика на <tr>, клик по любой ячейке. Кнопку не растягиваем
//   на всю строку псевдоэлементом: тогда клик по ячейке «Шагов» формально попадает
//   в чужую ячейку, и Playwright (e2e/catalog.spec.ts) такой клик не выполняет.
// Кнопка и корзина останавливают всплытие: клик по кнопке не открывает дважды, клик
// по корзине не открывает вовсе (§4.2:255). Интерактивное в интерактивное не вложено.
//
// Фокус строки выглядит как hover — фон, акцент и шеврон (Catalog.module.css).
// Шеврон — только у общих: у «моих» колонку действия занимает корзина.
import { useId } from 'react';
import type { MouseEvent } from 'react';
import { ru } from '../../i18n/ru.ts';
import { formatScenarioDate } from '../../i18n/date.ts';
import type { ScenarioIndexItem } from '../../model/scenarioIndex.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { ChevronRightIcon, TrashIcon } from '../ui/icons.tsx';
import styles from './Catalog.module.css';

/** Три строки-скелета, пока грузится индекс «Общих» (§4.2:256). */
const SKELETON_ROWS = 3;

export interface CatalogTableProps {
  rows: readonly ScenarioIndexItem[];
  /** id заголовка раздела — имя таблицы. */
  labelledBy: string;
  /** Заголовок колонки даты: «Обновлён» у общих, «Загружен» у моих (§4.2:252). */
  dateLabel: string;
  /** Текущий момент для «сегодня, ЧЧ:ММ» (§4.2:253). */
  now: Date;
  onOpen(id: string): void;
  /** Есть — в колонке действия корзина (§4.2:255), нет — шеврон. */
  onDelete?(id: string): void;
  /** Вместо строк — скелеты (§4.2:256). */
  loading?: boolean;
}

export function CatalogTable({
  rows,
  labelledBy,
  dateLabel,
  now,
  onOpen,
  onDelete,
  loading = false,
}: CatalogTableProps) {
  const { columns } = ru.catalog;
  return (
    <table className={styles.table} aria-labelledby={labelledBy}>
      <thead>
        <tr>
          <th scope="col">{columns.scenario}</th>
          <th scope="col" className={styles.moduleCol}>
            {columns.module}
          </th>
          <th scope="col" className={`${styles.num} ${styles.blocksCol}`}>
            {columns.blocks}
          </th>
          <th scope="col" className={`${styles.num} ${styles.stepsCol}`}>
            {columns.steps}
          </th>
          <th scope="col" className={`${styles.num} ${styles.linkCol}`}>
            {columns.withLink}
          </th>
          <th scope="col" className={styles.dateCol}>
            {dateLabel}
          </th>
          <th scope="col" className={styles.actionCol} />
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: SKELETON_ROWS }, (_, index) => <SkeletonRow key={index} />)
          : rows.map((item) => (
              <CatalogRow key={item.id} item={item} now={now} onOpen={onOpen} onDelete={onDelete} />
            ))}
      </tbody>
    </table>
  );
}

interface CatalogRowProps {
  item: ScenarioIndexItem;
  now: Date;
  onOpen(id: string): void;
  onDelete?(id: string): void;
}

function CatalogRow({ item, now, onOpen, onDelete }: CatalogRowProps) {
  // Корзина описывается названием строки: «Удалить из браузера» — какой сценарий.
  const titleId = useId();
  const open = (event: MouseEvent) => {
    event.stopPropagation();
    onOpen(item.id);
  };

  return (
    <tr className={styles.row} data-scenario-id={item.id} onClick={open}>
      <td>
        <button type="button" className={styles.open} onClick={open}>
          <span id={titleId} className={styles.titleText}>
            {item.title}
          </span>
        </button>
        <div className={styles.sub}>{item.fileName}</div>
      </td>
      {/* Badge — только у непустого модуля, как в шапке (§4.1:241). */}
      <td className={styles.module}>
        {item.module !== '' && <Badge tone="module">{item.module}</Badge>}
      </td>
      <td className={styles.num}>{item.blocks}</td>
      <td className={styles.num}>{item.steps}</td>
      <td className={styles.num}>{item.withLink}</td>
      <td className={styles.date}>{formatScenarioDate(item.loadedAt, now)}</td>
      <td className={styles.actionCol}>
        {onDelete === undefined ? (
          <ChevronRightIcon className={styles.chevron} />
        ) : (
          <Button
            variant="ghost-destructive"
            size="sm"
            iconOnly
            icon={<TrashIcon />}
            aria-label={ru.catalog.deleteFromBrowser}
            title={ru.catalog.deleteFromBrowser}
            aria-describedby={titleId}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item.id);
            }}
          />
        )}
      </td>
    </tr>
  );
}

/**
 * Строка-скелет: те же 7 ячеек, полосы вместо текста; от скринридера скрыта.
 * Высота — как у строки с данными (Catalog.module.css), ширины колонок задаёт шапка.
 */
function SkeletonRow() {
  return (
    <tr data-skeleton="true" aria-hidden="true">
      <td>
        <div className={styles.skeletonLine}>
          <span className={`${styles.skeletonBar} ${styles.skeletonTitle}`} />
        </div>
        <div className={`${styles.skeletonLine} ${styles.skeletonSubLine}`}>
          <span className={`${styles.skeletonBar} ${styles.skeletonFile}`} />
        </div>
      </td>
      <td>
        <span className={`${styles.skeletonBar} ${styles.skeletonModule}`} />
      </td>
      <td>
        <span className={styles.skeletonBar} />
      </td>
      <td>
        <span className={styles.skeletonBar} />
      </td>
      <td>
        <span className={styles.skeletonBar} />
      </td>
      <td>
        <span className={styles.skeletonBar} />
      </td>
      <td className={styles.actionCol} />
    </tr>
  );
}
