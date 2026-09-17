// Визуально скрытый текст для скринридера (SPEC §4.3:267, §11:623): у шага
// схемы со ссылкой иконка декоративная (aria-hidden), а доступное имя кнопки
// дополняет скрытая подпись. Строку передаёт потребитель из src/i18n/ru.ts.
import type { ReactNode } from 'react';
import styles from './VisuallyHidden.module.css';

export interface VisuallyHiddenProps {
  children: ReactNode;
}

export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return <span className={styles.visuallyHidden}>{children}</span>;
}
