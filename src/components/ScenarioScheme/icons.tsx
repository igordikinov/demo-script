// Иконки схемы сценария — пути из design/Демо-навигатор v2.dc.html:56 (стрелка
// между блоками) и :72 (внешняя ссылка у шага). Цвет — `currentColor`, размер —
// из ScenarioScheme.module.css: литералы цвета и размера в JSX запрещены (SPEC §5).

interface IconProps {
  className?: string;
}

/** Стрелка → между блоками (v2:56). */
export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon="arrow-right"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/** Внешняя ссылка у шага с `url` (v2:72). */
export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon="external-link"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
    </svg>
  );
}
