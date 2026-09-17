// Полоса A2 «Схема сценария» (SPEC §4.3:259–267): блоки колонками в ряд со
// стрелками между ними, в колонке — шаги. Клик по шагу делает его активным,
// активный шаг прокручивается в видимую область полосы. Блоки не сворачиваются
// (§4.3:267, §11 вопрос 5). В каталоге (сценарий не открыт) ничего не рисует.
import { useEffect, useId, useRef } from 'react';
import { ru } from '../../i18n/ru.ts';
import { isScreenUrl } from '../../model/url.ts';
import { useAppStore } from '../../state/context.ts';
import { flatSteps } from '../../state/reducer.ts';
import { ArrowRightIcon, ExternalLinkIcon } from '../ui/icons.tsx';
import { SectionCaption } from '../ui/SectionCaption.tsx';
import styles from './ScenarioScheme.module.css';

export function ScenarioScheme() {
  const { state, dispatch } = useAppStore();
  const { scenario, stepId } = state;
  const titleId = useId();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Срабатывает и при открытии сценария: шаг из ссылки (§4.7) может лежать
  // в блоке за правым краем узкой полосы.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
      <div className={styles.row}>
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
                        {hasLink && <ExternalLinkIcon className={styles.linkIcon} />}
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
