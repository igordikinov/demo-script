// Шапка A0 (SPEC §4.1:234–240). Разметка — design/catalog-mockup.html:88–95
// (каталог A5) и :185–199 (сценарий A0′). Tag «общий»/«мой» — DN-26, окно
// загрузки — DN-14, адрес страницы — DN-16.
//
// Один <header>, левая часть — одно условное выражение в фиксированной позиции,
// spacer и кнопка «Загрузить из Excel» всегда на своих местах: иначе при смене
// варианта React пересоздаст кнопку и Modal не вернёт на неё фокус
// (§4.8:325, §4.8:346; план DN-10, D1).
import { useAppStore } from '../../state/context.ts';
import { ru } from '../../i18n/ru.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
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
