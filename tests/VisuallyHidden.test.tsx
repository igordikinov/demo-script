// SPEC §4.3:267, §11:623 (DN-lur): у шага со ссылкой иконка декоративная
// (aria-hidden), а для скринридера — visually-hidden текст «есть ссылка на
// экран». Компонент и CSS-контракт — план DN-36l, раздел 2.2/3.2/3.3.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { VisuallyHidden } from '../src/components/ui/VisuallyHidden';
import styles from '../src/components/ui/VisuallyHidden.module.css';

// Приём с переменной — как у fixturePath в tests/StepCard.test.tsx:36:
// Vite в jsdom переписывает литерал `new URL('./x', import.meta.url)`.
const importMetaUrl = import.meta.url;

describe('VisuallyHidden: разметка (SPEC §4.3:267)', () => {
  it('рендерит span с классом styles.visuallyHidden, без aria-hidden', () => {
    render(<VisuallyHidden>есть ссылка на экран</VisuallyHidden>);
    const node = screen.getByText('есть ссылка на экран');
    expect(node.tagName).toBe('SPAN');
    // noUncheckedIndexedAccess типизирует индексный доступ как string | undefined;
    // явная проверка вместо `!` сужает тип и ловит опечатку в имени класса.
    const { visuallyHidden } = styles;
    if (visuallyHidden === undefined) {
      throw new Error('в VisuallyHidden.module.css нет класса .visuallyHidden');
    }
    expect(node).toHaveClass(visuallyHidden);
    expect(node).not.toHaveAttribute('aria-hidden');
  });

  it('текст остаётся в доступном имени кнопки, в которую вложен', () => {
    render(
      <button type="button">
        Шаг
        <VisuallyHidden>есть ссылка на экран</VisuallyHidden>
      </button>,
    );
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('есть ссылка на экран');
    // Доступное имя кнопки строится из текстового содержимого — проверяем
    // явно, чтобы поймать мутацию, которая прячет span из потока имени.
    expect(screen.getByRole('button', { name: /есть ссылка на экран/ })).toBe(button);
  });
});

describe('VisuallyHidden.module.css — визуально скрыт, но доступен скринридеру', () => {
  it('содержит .visuallyHidden с обрезкой в 1×1 пиксель и без display/visibility none', () => {
    const cssPath = fileURLToPath(
      new URL('../src/components/ui/VisuallyHidden.module.css', importMetaUrl),
    );
    const css = readFileSync(cssPath, 'utf8');
    const rule = /\.visuallyHidden\s*\{([^}]*)\}/.exec(css);
    if (rule === null) {
      throw new Error('в VisuallyHidden.module.css не найден блок .visuallyHidden { … }');
    }
    const body = rule[1] as string;
    expect(body).toContain('position: absolute');
    expect(body).toContain('width: 1px');
    expect(body).toContain('height: 1px');
    expect(body).toContain('margin: -1px');
    expect(body).toContain('padding: 0');
    expect(body).toContain('overflow: hidden');
    expect(body).toContain('clip: rect(0 0 0 0)');
    expect(body).toContain('white-space: nowrap');
    expect(body).toContain('border: 0');
    // display:none/visibility:hidden убрали бы текст и из дерева доступности.
    expect(css).not.toContain('display: none');
    expect(css).not.toContain('visibility: hidden');
  });
});
