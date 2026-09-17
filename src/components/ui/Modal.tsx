// Модальное окно: загрузка из Excel — 720 px (SPEC §4.8:325), подтверждение
// удаления — 480 px (SPEC §4.2:253). Поведение по §4.8:325: затемнение фона,
// закрытие крестиком, Esc и кликом по фону; фокус при открытии — на
// initialFocusRef (зона выбора файла), при закрытии — обратно на элемент,
// который был в фокусе до открытия. Кнопки «Отмена» и действия передаёт
// потребитель через footer; своих подписей у окна нет.
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

export type ModalWidth = 480 | 720;

export interface ModalProps {
  open: boolean;
  /** Заголовок окна; он же доступное имя диалога. */
  title: string;
  width: ModalWidth;
  /** Esc, клик по фону и крестик. */
  onClose: () => void;
  /** Подпись крестика (aria-label и title). Без неё крестик не рисуется. */
  closeLabel?: string;
  footer?: ReactNode;
  /** Элемент, получающий фокус при открытии; иначе — первый фокусируемый. */
  initialFocusRef?: RefObject<HTMLElement>;
  children?: ReactNode;
}

/** Что считаем фокусируемым внутри окна (начальный фокус и Tab-ловушка). */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({
  open,
  title,
  width,
  onClose,
  closeLabel,
  footer,
  initialFocusRef,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Фокус ставится синхронно: при открытии — внутрь окна, при закрытии
  // (или размонтировании) — обратно на элемент, открывший окно.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const target =
      initialFocusRef?.current ?? dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? dialog;
    target?.focus();

    return () => {
      opener?.focus();
    };
  }, [open, initialFocusRef]);

  // Esc слушаем на документе: окно закрывается, даже если фокус ушёл наружу.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  // Tab-ловушка: обход не уходит за пределы окна.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || active === dialog) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Закрывает только клик по самому фону, не всплывший из окна.
  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-width={width}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {closeLabel !== undefined && (
            <button
              type="button"
              className={styles.close}
              aria-label={closeLabel}
              title={closeLabel}
              onClick={onClose}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
        {footer !== undefined && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
