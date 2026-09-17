// Тост внизу по центру (макет v2). Длительность по умолчанию — 3,2 с
// (SPEC §4.8:346, единственное место, где она задана). Одновременно один
// тост: новый текст заменяет текущий и перезапускает отсчёт.
//
// Live-регион role="status" рендерится всегда, даже без текста, — иначе
// скринридер может не заметить появившийся текст. Состояние тоста хранит
// родитель: onDismiss должен сбросить message в null.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

const DEFAULT_DURATION_MS = 3200;

export interface ToastProps {
  /** Текст тоста; `null` — тоста нет. */
  message: string | null;
  /** Вызывается по истечении `durationMs`. */
  onDismiss: () => void;
  /** По умолчанию 3200 мс (SPEC §4.8:346). */
  durationMs?: number;
}

/**
 * Таймер зависит только от `message` и `durationMs`: смена функции
 * `onDismiss` отсчёт не сбрасывает. Чтобы показать тот же текст ещё раз
 * с полным отсчётом, родитель передаёт новый `key`.
 */
export function Toast({ message, onDismiss, durationMs = DEFAULT_DURATION_MS }: ToastProps) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (message === null) {
      return undefined;
    }
    const timer = setTimeout(() => {
      onDismissRef.current();
    }, durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [message, durationMs]);

  return createPortal(
    <div role="status" className={styles.region}>
      {message !== null && <div className={styles.toast}>{message}</div>}
    </div>,
    document.body,
  );
}
