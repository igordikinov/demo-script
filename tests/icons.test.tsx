// Общие иконки ui/icons.tsx — план DN-w5z, шаг 1 (тесты до реализации:
// src/components/ui/icons.tsx ещё нет, первый прогон обязан упасть на
// «Failed to resolve import»). Атрибуты и порядок <path> сверены дословно с
// прежними Header/icons.tsx и ScenarioScheme/icons.tsx — design/Демо-навигатор
// v2.dc.html:37 (upload), :56 (стрелка), :72 и :109 (внешняя ссылка),
// design/catalog-mockup.html:187 (шеврон ‹), :102 (поиск), :118 (шеврон › у
// строки каталога), :143 (корзина у «моих»). Перенос иконок в общий модуль не
// должен изменить вид, поэтому здесь проверяются все атрибуты SVG, а не
// только data-icon. width/height нарочно не заданы: размер — из CSS
// потребителя (SPEC §5:358 — хардкод в *.tsx запрещён).
//
// SearchIcon: querySelectorAll('path') ниже не видит <circle> макета
// (CAT:102 — cx=11 cy=11 r=7), поэтому в `paths` — только отрезок-ручка лупы;
// сама окружность здесь не проверяется (ограничение общего чек-листа этого
// файла, не самой иконки).
import type { ComponentType } from 'react';
import { render } from '@testing-library/react';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from '../src/components/ui/icons';

interface IconCase {
  name: string;
  Component: ComponentType<{ className?: string }>;
  icon: string;
  paths: string[];
}

const cases: IconCase[] = [
  {
    name: 'UploadIcon',
    Component: UploadIcon,
    icon: 'upload',
    paths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  },
  {
    name: 'ChevronLeftIcon',
    Component: ChevronLeftIcon,
    icon: 'chevron-left',
    paths: ['M15 18l-6-6 6-6'],
  },
  {
    name: 'ArrowRightIcon',
    Component: ArrowRightIcon,
    icon: 'arrow-right',
    paths: ['M5 12h14', 'M13 6l6 6-6 6'],
  },
  {
    name: 'ExternalLinkIcon',
    Component: ExternalLinkIcon,
    icon: 'external-link',
    paths: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
  },
  {
    name: 'SearchIcon',
    Component: SearchIcon,
    icon: 'search',
    paths: ['M20 20l-3.5-3.5'],
  },
  {
    name: 'ChevronRightIcon',
    Component: ChevronRightIcon,
    icon: 'chevron-right',
    paths: ['M9 6l6 6-6 6'],
  },
  {
    name: 'TrashIcon',
    Component: TrashIcon,
    icon: 'trash',
    paths: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  },
];

function renderIcon(Component: ComponentType<{ className?: string }>, className?: string) {
  const { container } = render(<Component className={className} />);
  const svg = container.querySelector('svg');
  if (svg === null) {
    throw new Error('svg не найден');
  }
  return svg;
}

describe('ui/icons: общие атрибуты SVG (SPEC §5:358 — цвет только currentColor, размер из CSS)', () => {
  it.each(cases)(
    '$name — data-icon, скрыта от AT, fill/stroke, viewBox, без width/height',
    ({ Component, icon }) => {
      const svg = renderIcon(Component);
      expect(svg).toHaveAttribute('data-icon', icon);
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('stroke-width', '2');
      expect(svg).toHaveAttribute('stroke-linecap', 'round');
      expect(svg).toHaveAttribute('stroke-linejoin', 'round');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).not.toHaveAttribute('width');
      expect(svg).not.toHaveAttribute('height');
    },
  );

  it.each(cases)('$name — пути <path> в порядке макета', ({ Component, paths }) => {
    const svg = renderIcon(Component);
    expect([...svg.querySelectorAll('path')].map((path) => path.getAttribute('d'))).toEqual(paths);
  });

  it.each(cases)('$name — className пробрасывается на svg', ({ Component }) => {
    const svg = renderIcon(Component, 'x');
    expect(svg).toHaveClass('x');
  });
});
