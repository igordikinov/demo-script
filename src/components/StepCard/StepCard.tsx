// Карточка шага A3 (SPEC §4.4:271–283) и открытие экрана (§4.9:354).
// Разметка — design/Демо-навигатор v2.dc.html:84–165. ‹ › и прокрутка к
// карточке — §4.5:289, :291; клавиши ← → — hooks/useArrowKeys.ts (§4.5:290).
// Секция «Карта процесса» (§4.4:277, §4.6:306–309, v2:123–142) — между
// «Экраном» и «Действием»; сама встроенная карта — ProcessMapSection под
// карточкой (§4.4:285), здесь только кнопка, которая её раскрывает.
import { useEffect, useRef } from 'react';
import { useAppStore } from '../../state/context.ts';
import { activeStep, stepPosition } from '../../state/reducer.ts';
import { ru } from '../../i18n/ru.ts';
import { isScreenUrl } from '../../model/url.ts';
import { pmLink } from '../../pm/pmLink.ts';
import { PROCESS_MAP_EMBED_ID } from '../ProcessMapSection/ProcessMapSection.tsx';
import { Button } from '../ui/Button.tsx';
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from '../ui/icons.tsx';
import { openInNewTab } from '../ui/openInNewTab.ts';
import { SectionCaption } from '../ui/SectionCaption.tsx';
import styles from './StepCard.module.css';

export function StepCard() {
  const { state, dispatch } = useAppStore();
  const { scenario, stepId } = state;
  const cardRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  // Последние показанные сценарий и шаг: первый рендер уже «показан».
  const shown = useRef({ scenario, stepId });

  // §4.5:291: при смене шага страница прокручивается к началу карточки, только
  // если шапка ушла из видимой области. Хуки — до ранних return (rules-of-hooks).
  // - Первый рендер пропускается: ref уже хранит текущие значения. Это и открытие
  //   из каталога (карточка монтируется заново), и двойной запуск в StrictMode.
  // - Смена сценария пропускается: сравнивается объект, а не id, так что и замена
  //   «моего» с тем же id. Прокрутку при смене сценария сбрасывает App (DN-26).
  // - Обычный, а не layout-эффект: шапка меряется после сброса окна в App
  //   (layout-эффект, DN-26) и после эффекта полосы схемы (§4.3:267). Полоса
  //   с DN-91e двигает только свой scrollLeft, окно по вертикали — это правило.
  useEffect(() => {
    const previous = shown.current;
    shown.current = { scenario, stepId };
    if (previous.scenario !== scenario || previous.stepId === stepId) {
      return;
    }
    const header = headerRef.current;
    if (header === null) {
      return;
    }
    const { top, bottom } = header.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      cardRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [scenario, stepId]);

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

  // «Открыть экран» (§4.9:354, ТК 16) и «Открыть в новой вкладке» (§4.6:316):
  // вкладку открывает ui/openInNewTab.ts (без 'noopener', opener = null, DN-cx3).
  // Браузер не дал открыть вкладку — тост §4.9:354; §4.6:316 ссылается на него же.
  const openTab = (url: string) => {
    if (!openInNewTab(url)) {
      dispatch({ type: 'showToast', message: ru.openScreen.popupBlocked });
    }
  };

  // Повторная проверка адреса — страховка: обработчик вешается только при hasUrl,
  // поэтому из DOM эта ветка недостижима и тестами не ловится (DN-dkb).
  const handleOpen = () => {
    if (!isScreenUrl(step.url)) {
      return;
    }
    openTab(step.url);
  };

  // null — узел пуст или его нет в снимке карты сценария (W04): «Узел процесса
  // не сопоставлен», кнопок нет, встроенной карты тоже (§4.6:309, :314).
  const link = pmLink(state.scenario.map, step.node);

  const valueEmpty = step.value === '';
  const resultEmpty = step.result === '';

  return (
    <article ref={cardRef} className={styles.card}>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.meta}>
            {ru.card.position(position.blockN, position.k, position.m)}
          </div>
          <h1 className={styles.title}>{step.title}</h1>
        </div>
        {/* ‹ › (v2:91–97): подписи §4.4:275 (решение DN-lur), края — §4.5:289. */}
        <div className={styles.nav}>
          <Button
            variant="neutral"
            iconOnly
            icon={<ChevronLeftIcon />}
            title={ru.card.prevStep}
            aria-label={ru.card.prevStep}
            disabled={position.index === 0}
            onClick={() => dispatch({ type: 'prevStep' })}
          />
          <Button
            variant="neutral"
            iconOnly
            icon={<ChevronRightIcon />}
            title={ru.card.nextStep}
            aria-label={ru.card.nextStep}
            disabled={position.index === position.total - 1}
            onClick={() => dispatch({ type: 'nextStep' })}
          />
        </div>
      </header>

      <section className={styles.section}>
        <SectionCaption as="h2">{ru.card.screen}</SectionCaption>
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

      {/* Карта процесса (§4.6:306–309, v2:123–142): подпись — в обоих состояниях. */}
      <section className={styles.section}>
        <SectionCaption as="h2">{ru.card.processMap}</SectionCaption>
        {link === null ? (
          <p className={`${styles.text} ${styles.muted}`}>{ru.processMap.notMapped}</p>
        ) : (
          <>
            <div className={styles.mapRow}>
              <span className={styles.mapStage}>
                {ru.processMap.stage(link.stage, link.stageTitle)}
              </span>
              {/* Признак «карта раскрыта» — один на приложение (§4.6:313).
                  aria-controls — только пока карта есть в DOM. */}
              <Button
                variant="stroked"
                aria-expanded={state.mapOpen}
                aria-controls={state.mapOpen ? PROCESS_MAP_EMBED_ID : undefined}
                onClick={() => dispatch({ type: 'toggleMap' })}
              >
                {state.mapOpen ? ru.processMap.hide : ru.processMap.show}
              </Button>
              <Button
                variant="neutral"
                icon={<ExternalLinkIcon />}
                iconPosition="end"
                onClick={() => openTab(link.url)}
              >
                {ru.processMap.openInNewTab}
              </Button>
            </div>
            <div className={styles.mapNode}>{ru.processMap.node(step.node)}</div>
          </>
        )}
      </section>

      {step.action !== '' && (
        <section className={styles.section}>
          <SectionCaption as="h2">{ru.card.action}</SectionCaption>
          <p className={styles.text}>{step.action}</p>
        </section>
      )}

      <section className={styles.value} data-empty={String(valueEmpty)}>
        <SectionCaption as="h2" tone="brand">
          {ru.card.value}
        </SectionCaption>
        <p className={styles.valueText}>{valueEmpty ? ru.card.valueEmpty : step.value}</p>
      </section>

      <section className={styles.result}>
        <SectionCaption as="h2">{ru.card.result}</SectionCaption>
        <p className={resultEmpty ? `${styles.text} ${styles.muted}` : styles.text}>
          {resultEmpty ? ru.card.resultEmpty : step.result}
        </p>
      </section>

      {step.comment !== '' && (
        <section className={styles.comment}>
          <SectionCaption as="h2">{ru.card.comment}</SectionCaption>
          <p className={styles.commentText}>{step.comment}</p>
        </section>
      )}
    </article>
  );
}
