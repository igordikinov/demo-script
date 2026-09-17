// Подпись секции: 12/16, 600, верхний регистр, letter-spacing .04em (SPEC §5:360).
// Макет — design/Демо-навигатор v2.dc.html:48 «Схема сценария», :102 «Экран»,
// :147 «Действие», :158 «Ожидаемый результат», :164 «Комментарий»;
// tone="brand" — «Бизнес ценность» (v2:153, SPEC §4.4:277).
// Тег задаёт потребитель: заголовки секций карточки и схемы — h2.
import type { ReactNode } from 'react';
import styles from './SectionCaption.module.css';

export type SectionCaptionTag = 'h2' | 'h3' | 'div' | 'span';
export type SectionCaptionTone = 'default' | 'brand';

export interface SectionCaptionProps {
  as?: SectionCaptionTag;
  tone?: SectionCaptionTone;
  id?: string;
  className?: string;
  children: ReactNode;
}

export function SectionCaption({
  as: Tag = 'div',
  tone = 'default',
  id,
  className,
  children,
}: SectionCaptionProps) {
  return (
    <Tag id={id} className={[styles.caption, className].filter(Boolean).join(' ')} data-tone={tone}>
      {children}
    </Tag>
  );
}
