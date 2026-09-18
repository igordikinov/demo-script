// Метка источника сценария: «общий» или «мой» в шапке открытого сценария
// (SPEC §2:55 — примитив ui, §4.1:241). Стиль — design/catalog-mockup.html:26.
// Не интерактивна: просто <span>, в отличие от строки каталога и «‹ Сценарии».
import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export interface TagProps {
  children: ReactNode;
}

export function Tag({ children }: TagProps) {
  return <span className={styles.tag}>{children}</span>;
}
