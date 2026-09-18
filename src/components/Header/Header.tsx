// Шапка A0 (SPEC §4.1:236–241). Разметка — design/catalog-mockup.html:88–95
// (каталог A5) и :185–199 (сценарий A0′). Окно загрузки — DN-14, адрес
// страницы — DN-16.
//
// Tag «общий»/«мой» (§4.1:241, DN-26) выбирается по scenario.source (§3.1:90) —
// полю источника, а не по префиксу id `my-` (§3.6:203). Tag стоит вне условия
// по модулю: он нужен и без Badge.
//
// Один <header>, левая часть — одно условное выражение в фиксированной позиции,
// spacer и кнопка «Загрузить из Excel» всегда на своих местах: иначе при смене
// варианта React пересоздаст кнопку и Modal не вернёт на неё фокус
// (§4.8:329, §4.8:350; DN-10).
import { useAppStore } from '../../state/context.ts';
import { ru } from '../../i18n/ru.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Tag } from '../ui/Tag.tsx';
import { ChevronLeftIcon, UploadIcon } from '../ui/icons.tsx';
import styles from './Header.module.css';

export function Header() {
  const { state, dispatch } = useAppStore();
  const { scenario } = state;

  return (
    <header className={styles.header}>
      {scenario === null ? (
        <>
          <span className={styles.monogram}>{ru.header.monogram}</span>
          <span className={styles.appTitle}>{ru.header.appTitle}</span>
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles.back}
            onClick={() => {
              dispatch({ type: 'closeScenario' });
            }}
          >
            <ChevronLeftIcon className={styles.backIcon} />
            {ru.header.back}
          </button>
          <span className={styles.separator}>{ru.header.separator}</span>
          <span className={styles.title}>{scenario.title}</span>
          {scenario.module !== '' && <Badge tone="module">{scenario.module}</Badge>}
          <Tag>{scenario.source === 'repo' ? ru.header.tagRepo : ru.header.tagLocal}</Tag>
        </>
      )}
      <div className={styles.spacer} />
      <Button
        variant="stroked"
        icon={<UploadIcon />}
        onClick={() => {
          dispatch({ type: 'openImport' });
        }}
      >
        {ru.header.upload}
      </Button>
    </header>
  );
}
