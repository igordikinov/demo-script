// Иконки шапки — пути из design/Демо-навигатор v2.dc.html:37 (upload у кнопки
// «Загрузить из Excel») и design/catalog-mockup.html:187 (шеврон у «‹ Сценарии»).
// Цвет — `currentColor`, размер — из CSS: литералы цвета и размера в JSX
// запрещены (SPEC §5).

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
