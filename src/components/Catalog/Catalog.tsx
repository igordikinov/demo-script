// Каталог сценариев — стартовый экран A5 и пустые «Мои» A5.1 (SPEC §4.2:243–259),
// макет design/catalog-mockup.html:96–154 (A5) и :162–177 (A5.1), снимок design/v3-catalog.png.
// App показывает его, пока сценарий не открыт (§4.7:320).
//
// - Заголовок «Сценарии», поиск и «Загрузить из Excel» справа (§4.2:247, DN-ysk);
//   поиск фильтрует оба раздела сразу, число в шапке раздела — с учётом поиска
//   (§4.2:249). Кнопка загрузки лежит в разметке после разделов (порядок Tab,
//   §4.2:254), а в строку заголовка её ставит сетка .page. При пустых «Моих»
//   (A5.1) её нет вовсе: загрузку открывает primary в пунктирном блоке
//   (§4.2:257).
// - Разделы сверху вниз: «Общие» (§3.7) и «Мои» (§3.6). Порядок строк — как в
//   сторе: «Общие» — порядок index.json (§3.7:228), «Мои» — новые сверху (§3.6:204).
//   Каталог сам не сортирует.
// - Сначала состояние источника, потом поиск: загрузка, ошибка и «Общих сценариев
//   пока нет» у «Общих» (§4.2:256, §3.7:230) и A5.1 у пустых «Моих» (§4.2:257)
//   показываются при любом запросе. «Ничего не найдено» — только когда список
//   есть, а поиск всё отсеял (§4.2:247).
// - Строки «Моих» — тот же элемент индекса, что у «Общих» (toIndexItem): блоки,
//   шаги и «со ссылкой» по isScreenUrl считаются по сценарию.
//
// Открытие на первом шаге (§4.2:254): «мой» — сразу из стора, общий — командой
// openShared (файл через кэш, §3.7:230). Не загрузился общий — тост
// ru.catalog.openFailed с названием сценария (§4.2:252, DN-51k); текст
// ru.shared.loadFailed остаётся за состоянием всего раздела. Адрес страницы —
// DN-16, окно удаления A5.2 — DN-25: корзина только открывает его (openDelete).
import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ru } from '../../i18n/ru.ts';
import { toIndexItem } from '../../model/scenarioIndex.ts';
import { useAppStore } from '../../state/context.ts';
import { findInLibrary } from '../../state/library.ts';
import { Button } from '../ui/Button.tsx';
import { UploadIcon } from '../ui/icons.tsx';
import { SearchField } from '../ui/SearchField.tsx';
import { CatalogSection } from './CatalogSection.tsx';
import { CatalogTable } from './CatalogTable.tsx';
import { EmptyMine } from './EmptyMine.tsx';
import { filterByTitle } from './search.ts';
import styles from './Catalog.module.css';

export interface CatalogProps {
  /** Часы для «сегодня, ЧЧ:ММ» (§4.2:253); по умолчанию — текущее время. */
  now?: () => Date;
}

const defaultNow = (): Date => new Date();

export function Catalog({ now = defaultNow }: CatalogProps) {
  const { state, dispatch, commands } = useAppStore();
  const { library, shared } = state;
  const [query, setQuery] = useState('');
  const sharedHeadingId = useId();
  const localHeadingId = useId();
  const current = now();

  const localItems = useMemo(() => library.items.map(toIndexItem), [library.items]);
  const sharedRows = useMemo(() => filterByTitle(shared.items, query), [shared.items, query]);
  const localRows = useMemo(() => filterByTitle(localItems, query), [localItems, query]);

  const openLocal = (id: string) => {
    const scenario = findInLibrary(library.items, id);
    if (scenario !== undefined) {
      dispatch({ type: 'openScenario', scenario });
    }
  };

  const openShared = (id: string) => {
    // Название берётся из строки индекса до ожидания промиса: к ответу список мог
    // перезагрузиться. Нет строки — в тосте id (§4.2:252, DN-51k).
    const title = shared.items.find((item) => item.id === id)?.title ?? id;
    void commands.openShared(id).then((opened) => {
      if (!opened) {
        dispatch({ type: 'showToast', message: ru.catalog.openFailed(title) });
      }
    });
  };

  let sharedBody: ReactNode;
  let sharedCount: number | null;
  if (shared.status === 'loading') {
    sharedBody = (
      <CatalogTable
        rows={[]}
        labelledBy={sharedHeadingId}
        dateLabel={ru.catalog.columns.updated}
        now={current}
        onOpen={openShared}
        loading
      />
    );
    sharedCount = null;
  } else if (shared.status === 'error') {
    sharedBody = (
      <div className={styles.message}>
        <span>{ru.shared.loadFailed}</span>
        <Button
          variant="stroked"
          size="sm"
          onClick={() => {
            commands.retryShared();
          }}
        >
          {ru.shared.retry}
        </Button>
      </div>
    );
    sharedCount = null;
  } else if (shared.items.length === 0) {
    sharedBody = <p className={styles.message}>{ru.catalog.sharedEmpty}</p>;
    sharedCount = 0;
  } else if (sharedRows.length === 0) {
    sharedBody = <p className={styles.message}>{ru.catalog.notFound}</p>;
    sharedCount = 0;
  } else {
    sharedBody = (
      <CatalogTable
        rows={sharedRows}
        labelledBy={sharedHeadingId}
        dateLabel={ru.catalog.columns.updated}
        now={current}
        onOpen={openShared}
      />
    );
    sharedCount = sharedRows.length;
  }

  let localBody: ReactNode;
  if (localItems.length === 0) {
    localBody = (
      <EmptyMine
        onUpload={() => {
          dispatch({ type: 'openImport' });
        }}
      />
    );
  } else if (localRows.length === 0) {
    localBody = <p className={styles.message}>{ru.catalog.notFound}</p>;
  } else {
    localBody = (
      <CatalogTable
        rows={localRows}
        labelledBy={localHeadingId}
        dateLabel={ru.catalog.columns.loaded}
        now={current}
        onOpen={openLocal}
        onDelete={(id) => {
          dispatch({ type: 'openDelete', scenarioId: id });
        }}
      />
    );
  }

  return (
    <div className={styles.catalog}>
      <div className={styles.page}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{ru.catalog.title}</h1>
          {/* Подписи нет на экране — доступное имя совпадает с placeholder (§4.2:247). */}
          <SearchField
            className={styles.search}
            value={query}
            onChange={setQuery}
            placeholder={ru.catalog.searchPlaceholder}
            label={ru.catalog.searchPlaceholder}
          />
        </div>
        <CatalogSection
          headingId={sharedHeadingId}
          title={ru.catalog.sharedTitle}
          hint={ru.catalog.sharedHint}
          count={sharedCount}
          busy={shared.status === 'loading'}
        >
          {sharedBody}
        </CatalogSection>
        <CatalogSection
          headingId={localHeadingId}
          title={ru.catalog.localTitle}
          hint={library.available ? ru.catalog.localHint : ru.library.storageUnavailable}
          count={localRows.length}
        >
          {localBody}
        </CatalogSection>
        {/*
          Кнопка загрузки (§4.2:247, DN-ysk): верхней полосы A0 больше нет
          (§4.1:238), и при непустых «Моих» загрузить файл было бы неоткуда —
          primary-кнопку рисует только A5.1 (§4.2:257). data-upload — хук для
          тестов (как data-scheme-row): текст тот же, что у кнопки A5.1.

          Пока «Мои» пусты, кнопки в строке заголовка нет: на A5.1 загрузку
          открывает primary в пунктирном блоке (§4.2:257), двух входов рядом
          не держим. Условие — по библиотеке, а не по localRows: поиск,
          который всё отсеял, кнопку не убирает.

          В разметке кнопка идёт последней в .page, а показывается в строке
          заголовка справа (.upload в Catalog.module.css кладёт её в первую
          строку сетки). Иначе Tab из поиска попадал бы на неё, а не на первую
          строку списка, как требует §4.2:254 (вся строка — кнопка, Enter
          открывает сценарий).
        */}
        {localItems.length > 0 && (
          <Button
            className={styles.upload}
            variant="stroked"
            icon={<UploadIcon />}
            data-upload="catalog"
            onClick={() => {
              dispatch({ type: 'openImport' });
            }}
          >
            {ru.catalog.upload}
          </Button>
        )}
      </div>
    </div>
  );
}
