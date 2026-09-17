// Карточка шага A3 (SPEC §4.4:269–281) и открытие экрана (§4.9:350).
// Разметка — design/Демо-навигатор v2.dc.html:84–165. Кнопки ‹ › в шапке —
// DN-13 (§4.5), секция «Карта процесса» и встроенная карта — DN-15 (§4.6).
import { useAppStore } from '../../state/context.ts';
import { activeStep, stepPosition } from '../../state/reducer.ts';
import { ru } from '../../i18n/ru.ts';
import { isScreenUrl } from '../../model/url.ts';
import { Button } from '../ui/Button.tsx';
import styles from './StepCard.module.css';

export function StepCard() {
  const { state, dispatch } = useAppStore();
  const step = activeStep(state);
  if (step === null || state.scenario === null) {
    return null;
  }
  const position = stepPosition(state.scenario, step.id);
  if (position === null) {
    return null;
  }

  // Ссылка не http(s) (E07, §3.5:183) считается отсутствующей: «Экран не указан»,
  // без кнопки и серого URL. Решение владельца DN-dkb; схема §3.1 не меняется.
  const hasUrl = isScreenUrl(step.url);

  // §4.9:350 и ТК 16 дословно: null в ответ — тост. Вызов и проверка в одном
  // месте: с 'noopener' браузер возвращает null и при открытой вкладке (план DN-12, В0).
  // Повторная проверка адреса — страховка: обработчик вешается только при hasUrl,
  // поэтому из DOM эта ветка недостижима и тестами не ловится (план DN-dkb, D2).
  const handleOpen = () => {
    if (!isScreenUrl(step.url)) {
      return;
    }
    if (window.open(step.url, '_blank', 'noopener') === null) {
      dispatch({ type: 'showToast', message: ru.openScreen.popupBlocked });
    }
  };

  const valueEmpty = step.value === '';
  const resultEmpty = step.result === '';

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.meta}>
            {ru.card.position(position.blockN, position.k, position.m)}
          </div>
          <h1 className={styles.title}>{step.title}</h1>
        </div>
        {/* ‹ › — DN-13 */}
      </header>

      <section className={styles.section}>
        <h2 className={styles.caption}>{ru.card.screen}</h2>
        <div className={styles.screenRow} data-has-url={String(hasUrl)}>
          {step.screen !== '' && <span>{step.screen}</span>}
          {hasUrl ? (
            <Button icon={<ExternalLinkIcon />} iconPosition="end" onClick={handleOpen}>
              {ru.card.openScreen}
            </Button>
          ) : (
            <span className={styles.muted}>{ru.card.screenMissing}</span>
          )}
        </div>
        {hasUrl && <div className={styles.url}>{step.url}</div>}
      </section>

      {/* Карта процесса — DN-15 */}

      {step.action !== '' && (
        <section className={styles.section}>
          <h2 className={styles.caption}>{ru.card.action}</h2>
          <p className={styles.text}>{step.action}</p>
        </section>
      )}

      <section className={styles.value} data-empty={String(valueEmpty)}>
        <h2 className={styles.caption} data-tone="brand">
          {ru.card.value}
        </h2>
        <p className={styles.valueText}>{valueEmpty ? ru.card.valueEmpty : step.value}</p>
      </section>

      <section className={styles.result}>
        <h2 className={styles.caption}>{ru.card.result}</h2>
        <p className={resultEmpty ? `${styles.text} ${styles.muted}` : styles.text}>
          {resultEmpty ? ru.card.resultEmpty : step.result}
        </p>
      </section>

      {step.comment !== '' && (
        <section className={styles.comment}>
          <h2 className={styles.caption}>{ru.card.comment}</h2>
          <p className={styles.commentText}>{step.comment}</p>
        </section>
      )}
    </article>
  );
}

/** Внешняя ссылка (v2:109); размер задаёт .icon в Button.module.css. */
function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
    </svg>
  );
}
