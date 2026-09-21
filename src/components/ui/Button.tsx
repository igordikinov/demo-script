// Кнопка на токенах SPEC §5 (SPEC §1:22 — компоненты свои, без UI-китов).
// Варианты по макетам: primary — «Открыть экран» (§4.4:274), stroked —
// «Загрузить из Excel» (§4.2:247), neutral — «Отмена», ‹ › (§4.5),
// destructive — «Удалить» (§4.2:253), ghost-destructive — корзина «Удалить
// из браузера» (§4.2:253, CAT:33–34). Стили выбираются по data-variant,
// data-size и data-icon-only: так вариант виден и в тестах, где классы
// CSS-модулей — прокси-строки. Своего текста у кнопки нет — подписи передаёт
// потребитель.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'stroked' | 'neutral' | 'destructive' | 'ghost-destructive';

export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** По умолчанию `primary`. */
  variant?: ButtonVariant;
  /** По умолчанию `md`; `sm` + `iconOnly` — 32×32 (CAT:33). */
  size?: ButtonSize;
  /** Иконка (обычно inline SVG со `stroke="currentColor"`); скрыта от скринридера. */
  icon?: ReactNode;
  /** Иконка до текста (`start`, по умолчанию) или после него (`end`). */
  iconPosition?: 'start' | 'end';
  /** Квадратная кнопка только с иконкой; имя задаётся через `aria-label` / `title`. */
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconPosition = 'start',
    iconOnly = false,
    type,
    className,
    children,
    ...rest
  },
  ref,
) {
  const iconNode =
    icon === undefined || icon === null ? null : (
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    );

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly ? 'true' : undefined}
      className={[styles.button, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {iconOnly ? (
        iconNode
      ) : (
        <>
          {iconPosition === 'start' && iconNode}
          {children}
          {iconPosition === 'end' && iconNode}
        </>
      )}
    </button>
  );
});
