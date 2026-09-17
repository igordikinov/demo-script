// Пилюля: модуль сценария (SPEC §4.2:239 `Badge` модуля) и уровень строки
// отчёта (SPEC §4.8:335 — `danger` / `warning` / `info` цветами §5:360).
// Тон выставляется в data-tone, по нему выбираются стили.
import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'module' | 'danger' | 'warning' | 'info';

export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {children}
    </span>
  );
}
