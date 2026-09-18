// Пустые «Мои» — A5.1 (SPEC §4.2:257), разметка design/catalog-mockup.html:169–174:
// вместо таблицы пунктирная рамка --brand-200, иконка upload, текст, ссылка
// «Скачать шаблон» (§6) и кнопка primary «Загрузить из Excel».
//
// «Скачать шаблон» — то же действие, что в окне загрузки (§4.8:331): шаблон
// собирается в браузере при клике (§6:368). SheetJS в стартовый набор не попадает:
// книгу пишет src/excel/write.ts через loadXlsx() — динамический импорт (§1:20).
// По виду это ссылка, но это действие, а не переход, поэтому <button>.
import { ru } from '../../i18n/ru.ts';
import { Button } from '../ui/Button.tsx';
import { downloadTemplate } from '../ui/download.ts';
import { UploadIcon } from '../ui/icons.tsx';
import styles from './Catalog.module.css';

export interface EmptyMineProps {
  /** «Загрузить из Excel» — окно загрузки A4 (§4.8). */
  onUpload(): void;
}

export function EmptyMine({ onUpload }: EmptyMineProps) {
  return (
    <div className={styles.empty}>
      <UploadIcon className={styles.emptyIcon} />
      <p className={styles.emptyText}>{ru.catalog.localEmpty}</p>
      <button
        type="button"
        className={styles.link}
        onClick={() => {
          // Не загрузилась SheetJS — шаблон не скачивается; текста ошибки в SPEC нет.
          downloadTemplate().catch(() => undefined);
        }}
      >
        {ru.catalog.downloadTemplate}
      </button>
      <Button variant="primary" onClick={onUpload}>
        {ru.catalog.upload}
      </Button>
    </div>
  );
}
