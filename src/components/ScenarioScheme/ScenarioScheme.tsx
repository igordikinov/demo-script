// Полоса A2 «Схема сценария» (SPEC §4.3:259–267): блоки колонками в ряд со
// стрелками между ними, в колонке — шаги. Клик по шагу делает его активным,
// полоса прокручивает саму себя по горизонтали до активного шага и страницу по
// вертикали не двигает (DN-91e). Блоки не сворачиваются (§4.3:267, §11 вопрос 5).
// В каталоге (сценарий не открыт) ничего не рисует.
import { useEffect, useId, useRef } from 'react';
import { ru } from '../../i18n/ru.ts';
import { isScreenUrl } from '../../model/url.ts';
import { useAppStore } from '../../state/context.ts';
import { flatSteps } from '../../state/reducer.ts';
import { ArrowRightIcon, ExternalLinkIcon } from '../ui/icons.tsx';
import { SectionCaption } from '../ui/SectionCaption.tsx';
import { VisuallyHidden } from '../ui/VisuallyHidden.tsx';
import styles from './ScenarioScheme.module.css';

export function ScenarioScheme() {
  const { state, dispatch } = useAppStore();
  const { scenario, stepId } = state;
  const titleId = useId();
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  // §4.3:267 (DN-91e): полоса прокручивает только себя по горизонтали — двигает
  // свой scrollLeft на величину выступа активного шага за край. Страницу по
  // вертикали не двигает вовсе (никакого scrollIntoView): вертикальная прокрутка
  // при смене шага — только правило карточки §4.5:291, а сброс окна при смене
  // сценария — App (DN-26). Шаг виден целиком — scrollLeft не трогается.
  // Срабатывает и при открытии сценария: шаг из ссылки (§4.7) может лежать
  // в блоке за правым краем узкой полосы.
  useEffect(() => {
    const row = rowRef.current;
    const active = activeRef.current;
    if (row === null || active === null) {
      return;
    }
    const rowBox = row.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const left = activeBox.left - rowBox.left;
    const right = activeBox.right - rowBox.right;
    // Шаг шире видимой части полосы — приоритет левому краю, иначе дребезг.
    if (left < 0) {
      row.scrollLeft += left;
    } else if (right > 0) {
      row.scrollLeft += right;
    }
  }, [scenario, stepId]);

  if (scenario === null) {
    return null;
  }

  const steps = flatSteps(scenario);
  // «Со ссылкой» — только http(s), как в карточке (E07 §3.5:183, решение DN-dkb).
  const withLink = steps.filter((step) => isScreenUrl(step.url)).length;

  return (
    <section className={styles.strip} aria-labelledby={titleId}>
      <div className={styles.header}>
        <SectionCaption as="h2" id={titleId}>
          {ru.scheme.title}
        </SectionCaption>
        <span className={styles.summary}>{ru.scheme.summary(steps.length, withLink)}</span>
      </div>
      {/* data-scheme-row — хук для тестов прокрутки: класс CSS-модуля захэширован. */}
      <div ref={rowRef} className={styles.row} data-scheme-row="true">
        {scenario.blocks.map((block, index) => (
          <div key={block.n} className={styles.wrapper}>
            {index > 0 && (
              <span className={styles.connector} aria-hidden="true">
                <ArrowRightIcon />
              </span>
            )}
            <div className={styles.block}>
              <div className={styles.blockHeader}>
                <span className={styles.blockNumber}>{block.n}</span>
                <span className={styles.blockTitle}>{block.title}</span>
                <span className={styles.blockCount}>
                  {ru.scheme.blockSteps(block.steps.length)}
                </span>
              </div>
              <ol className={styles.steps}>
                {block.steps.map((step) => {
                  const active = step.id === stepId;
                  const hasLink = isScreenUrl(step.url);
                  return (
                    <li key={step.id}>
                      <button
                        ref={active ? activeRef : undefined}
                        type="button"
                        className={styles.step}
                        data-step-id={step.id}
                        data-link={hasLink ? 'true' : undefined}
                        aria-current={active ? 'step' : undefined}
                        title={step.title}
                        onClick={() => dispatch({ type: 'selectStep', stepId: step.id })}
                      >
                        <span className={styles.dot} aria-hidden="true" />
                        <span className={styles.number}>{step.id}</span>
                        <span className={styles.stepTitle}>{step.title}</span>
                        {hasLink && (
                          <>
                            <ExternalLinkIcon className={styles.linkIcon} />
                            <VisuallyHidden>{ru.scheme.linkHint}</VisuallyHidden>
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
