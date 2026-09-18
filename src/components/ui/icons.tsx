// Общие иконки приложения. Пути — дословно из макетов:
// design/Демо-навигатор v2.dc.html:37 (upload у «Загрузить из Excel»),
// :56 (стрелка между блоками схемы), :72 и :109 (внешняя ссылка у шага схемы
// и на кнопке «Открыть экран»); design/catalog-mockup.html:187 (шеврон у
// «‹ Сценарии»), :102 (поиск), :118 (шеврон › строки каталога), :143
// (корзина у «моих»). Цвет — `currentColor`, размер — из CSS потребителя или
// `.icon svg` в Button.module.css: литералы цвета и размера в JSX запрещены
// (SPEC §5:358).

interface IconProps {
  className?: string;
}

/** Загрузка (v2:37, CAT:92). */
export function UploadIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon="upload"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

/** Шеврон ‹ у ссылки «Сценарии» (CAT:187). */
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon="chevron-left"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** Стрелка → между блоками схемы (v2:56). */
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

/** Внешняя ссылка: у шага схемы с `url` (v2:72) и на кнопке «Открыть экран» (v2:109). */
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

/**
 * Поиск в `SearchField` каталога (CAT:102). У макета нет `stroke-linejoin`; у
 * окружности и одного отрезка стыков нет, поэтому общий набор атрибутов вид не меняет.
 */
export function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon="search"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/** Шеврон › у строки каталога при hover и фокусе (CAT:118, SPEC §4.2:254). */
export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon="chevron-right"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Корзина «Удалить из браузера» у «моих» (CAT:143, SPEC §4.2:255). */
export function TrashIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon="trash"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}
