// Встроенная карта процесса — SPEC §4.6:311–315: секция под карточкой шага
// (§4.4:285), разметка design/Демо-навигатор v2.dc.html:171–181. Кнопка
// «Показать на карте» / «Скрыть карту» — в секции карточки (StepCard), здесь
// только сама карта.
// - Признак «карта раскрыта» — state.mapOpen, один на приложение (§4.6:313):
//   при смене шага карта остаётся раскрытой и показывает узел нового шага.
//   Между перезагрузками не сохраняется (§4.6:315) — стор его не пишет.
// - У шага без узла (пусто или W04) секции нет, даже при mapOpen (§4.6:314).
// - Карта сценария — поле map (§3.1): адрес строит pmLink (§4.6:304).
// - После «Показать на карте» страница прокручивается к заголовку карты, если
//   он вне видимой области; при смене шага — нет (§4.6:311, DN-us0).
import { useEffect, useId, useRef } from 'react';
import { ru } from '../../i18n/ru.ts';
import { pmLink } from '../../pm/pmLink.ts';
import { useAppStore } from '../../state/context.ts';
import { activeStep } from '../../state/reducer.ts';
import { SectionCaption } from '../ui/SectionCaption.tsx';
import styles from './ProcessMapSection.module.css';

/** id секции — на него ссылается aria-controls кнопки «Показать на карте» в StepCard. */
export const PROCESS_MAP_EMBED_ID = 'process-map-embed';

/**
 * Включено ли в системе «уменьшение движения» (§4.6:311, DN-us0). В jsdom
 * matchMedia нет — тогда считается, что не включено.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function ProcessMapSection() {
  const { state } = useAppStore();
  // Хуки — до ранних return (rules-of-hooks).
  const captionId = useId();
  const headerRef = useRef<HTMLDivElement>(null);
  // Прошлое значение признака: первый рендер уже «видел» текущее.
  const wasOpen = useRef(state.mapOpen);

  // §4.6:311 (DN-us0): после «Показать на карте» страница прокручивается к
  // заголовку карты, только если он вне видимой области.
  // - Прокрутка — только на переходе mapOpen false → true. Смена шага и
  //   сценария признак не меняет, эффект не запускается: там работает правило
  //   карточки §4.5:291. Это и шаг без узла → шаг с узлом при раскрытой карте:
  //   секция монтирует разметку, но компонент живёт, и wasOpen уже true.
  // - Монтирование с уже раскрытой картой (открытие из каталога) — не переход:
  //   ref берёт начальное значение из состояния. В StrictMode эффект при
  //   монтировании запускается дважды и оба раза видит true → true; с флагом
  //   «пропустить первый запуск» второй запуск прокрутил бы страницу.
  // - При prefers-reduced-motion: reduce — 'auto', то есть сразу, пока в CSS
  //   нет scroll-behavior: smooth; иначе плавно.
  useEffect(() => {
    const previous = wasOpen.current;
    wasOpen.current = state.mapOpen;
    if (previous || !state.mapOpen) {
      return;
    }
    const header = headerRef.current;
    if (header === null) {
      return;
    }
    const { top, bottom } = header.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      header.scrollIntoView({
        block: 'start',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
  }, [state.mapOpen]);

  if (!state.mapOpen || state.scenario === null) {
    return null;
  }
  const step = activeStep(state);
  if (step === null) {
    return null;
  }
  const link = pmLink(state.scenario.map, step.node);
  if (link === null) {
    return null;
  }

  // Название этапа — та же строка «Этап N · …», что в карточке: в макете это
  // одна переменная pmStageTitle (v2:128, :175).
  const stageLabel = ru.processMap.stage(link.stage, link.stageTitle);

  return (
    <section id={PROCESS_MAP_EMBED_ID} aria-labelledby={captionId} className={styles.section}>
      <div ref={headerRef} className={styles.header}>
        <SectionCaption as="h2" id={captionId}>
          {ru.processMap.embedTitle}
        </SectionCaption>
        <span className={styles.stage}>{stageLabel}</span>
      </div>
      <div className={styles.frame}>
        {/* key={link.url}: на новый шаг — новый iframe, а не смена src у старого.
            Смена src — навигация во фрейме: она пишет запись в сессионную
            историю, общую с вики, где живёт приложение, а §4.7:324 и ТК 14
            (§8:410) требуют, чтобы history.length не рос. Новый iframe грузит
            адрес вместо исходного about:blank, без новой записи. */}
        <iframe
          key={link.url}
          className={styles.iframe}
          src={link.url}
          title={ru.processMap.iframeTitle}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </section>
  );
}
