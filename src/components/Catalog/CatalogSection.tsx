// Раздел-карточка каталога «Общие» или «Мои» (SPEC §4.2:249–251), разметка
// design/catalog-mockup.html:107–111 и :132–136: подпись верхним регистром, число
// сценариев с учётом поиска, справа серая подсказка.
//
// <section> с именем из <h2> — область (region), таблица раздела ссылается на тот же
// заголовок. Числа нет, пока у раздела нет списка (загрузка и ошибка «Общих»,
// §4.2:256, §3.7:230). На его месте — пустое место той же строки 12/20: шапка
// остаётся 49 px (design/catalog-mockup.html:41–43) и не прыгает, когда список
// пришёл. aria-busy — пока идёт загрузка: строки-скелеты скрыты от скринридера,
// а свой текст у них не нужен.
import type { ReactNode } from 'react';
import { SectionCaption } from '../ui/SectionCaption.tsx';
import styles from './Catalog.module.css';

export interface CatalogSectionProps {
  /** id заголовка: по нему раздел и его таблица получают имя. */
  headingId: string;
  title: string;
  hint: string;
  /** `null` — числа нет. */
  count: number | null;
  busy?: boolean;
  children: ReactNode;
}

export function CatalogSection({
  headingId,
  title,
  hint,
  count,
  busy = false,
  children,
}: CatalogSectionProps) {
  return (
    <section
      className={styles.section}
      aria-labelledby={headingId}
      aria-busy={busy ? 'true' : undefined}
    >
      <div className={styles.head}>
        <SectionCaption as="h2" id={headingId}>
          {title}
        </SectionCaption>
        {count !== null ? (
          <span className={styles.count} data-count="">
            {count}
          </span>
        ) : (
          <span className={`${styles.count} ${styles.countPlaceholder}`} aria-hidden="true" />
        )}
        <span className={styles.hint}>{hint}</span>
      </div>
      {children}
    </section>
  );
}
