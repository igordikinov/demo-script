// Общая подпись секции ui/SectionCaption.tsx — план DN-w5z, шаг 1 (тесты до
// реализации: src/components/ui/SectionCaption.tsx ещё нет, первый прогон
// обязан упасть на «Failed to resolve import»). Стиль подписи один для всех
// мест (SPEC §5:360, макет v2:48,102,124,147,158,164) — сам текст и цвет
// живут в CSS-модуле и здесь не проверяются (CSS-модули в vitest — прокси,
// сканирование цветов уже есть в tests/tokens.test.ts и tests/cssColors.test.ts).
// Здесь проверяется контракт компонента: тег по умолчанию, проброс `as`,
// доступное имя заголовка, `data-tone` и проброс `id`/`className`.
import { render, screen } from '@testing-library/react';
import { SectionCaption } from '../src/components/ui/SectionCaption';

describe('SectionCaption: тег по умолчанию и проброс as', () => {
  it('без as рендерится div', () => {
    const { container } = render(<SectionCaption>Экран</SectionCaption>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it.each(['h2', 'h3', 'div', 'span'] as const)('as="%s" рендерит именно этот тег', (as) => {
    const { container } = render(<SectionCaption as={as}>Экран</SectionCaption>);
    expect(container.firstElementChild?.tagName).toBe(as.toUpperCase());
  });

  it('as="h2" — доступный заголовок уровня 2 с текстом children', () => {
    render(<SectionCaption as="h2">Схема сценария</SectionCaption>);
    expect(screen.getByRole('heading', { level: 2, name: 'Схема сценария' })).toBeInTheDocument();
  });
});

describe('SectionCaption: data-tone', () => {
  it('без tone — data-tone="default"', () => {
    const { container } = render(<SectionCaption>Экран</SectionCaption>);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'default');
  });

  it('tone="brand" — data-tone="brand" (SPEC §4.4:277 «Бизнес ценность»)', () => {
    const { container } = render(<SectionCaption tone="brand">Бизнес ценность</SectionCaption>);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'brand');
  });
});

describe('SectionCaption: проброс id и className', () => {
  it('id пробрасывается на корневой элемент', () => {
    render(<SectionCaption id="scheme-title">Схема сценария</SectionCaption>);
    expect(document.getElementById('scheme-title')).toHaveTextContent('Схема сценария');
  });

  it('className пробрасывается на корневой элемент', () => {
    const { container } = render(<SectionCaption className="x">Экран</SectionCaption>);
    expect(container.firstElementChild).toHaveClass('x');
  });
});
