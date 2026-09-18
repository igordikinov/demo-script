// `Tag` — примитив каталога ui (SPEC §2:55) и Tag источника «общий»/«мой» в
// шапке открытого сценария (SPEC §4.1:241). Стиль — design/catalog-mockup.html:26
// (.tag) с переменными :9 (--line) и :12 (--info-bg/--info-fg); значения в
// tokens.css: --scp-color-neutral-50 (#f5f6f8), -700 (#5a5a5c), -100 (#eaeaea).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { ru } from '../src/i18n/ru';
import { Tag } from '../src/components/ui/Tag';

// Приём с переменной — как у importMetaUrl в tests/VisuallyHidden.test.tsx:12:
// Vite в jsdom переписывает литерал `new URL('./x', import.meta.url)`.
const importMetaUrl = import.meta.url;

describe('Tag: разметка (SPEC §2:55)', () => {
  it('рендерится как span, не интерактивен', () => {
    render(<Tag>{ru.header.tagLocal}</Tag>);
    const node = screen.getByText(ru.header.tagLocal);
    expect(node.tagName).toBe('SPAN');
    expect(node.closest('button, a')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Tag.module.css — только токены (SPEC §4.1:241, catalog-mockup.html:26)', () => {
  it('.tag использует info-цвета, рамку, радиус, шрифт, высоту пилюли и свой отступ, без переносов', () => {
    const cssPath = fileURLToPath(new URL('../src/components/ui/Tag.module.css', importMetaUrl));
    const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.tag\s*\{([^}]*)\}/.exec(css);
    if (rule === null) {
      throw new Error('в Tag.module.css не найден блок .tag { … }');
    }
    const body = rule[1] as string;
    expect(body).toContain('var(--scp-color-neutral-50)');
    expect(body).toContain('var(--scp-color-neutral-700)');
    expect(body).toContain('1px solid var(--scp-color-neutral-100)');
    expect(body).toContain('var(--scp-border-radius-sm)');
    expect(body).toContain('var(--scp-xs-semibold)');
    expect(body).toContain('var(--dn-pill-height)');
    expect(body).toContain('var(--dn-tag-padding)');
    expect(body).toContain('white-space: nowrap');
  });
});

describe('tokens.css — --dn-tag-padding (SPEC §4.1:241, catalog-mockup.html:26 padding: 2px 8px)', () => {
  it('объявлен и равен 2px var(--scp-spacing-sm)', () => {
    const cssPath = fileURLToPath(new URL('../src/theme/tokens.css', importMetaUrl));
    const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const match = /--dn-tag-padding\s*:\s*([^;]+);/.exec(css);
    if (match === null) {
      throw new Error('в tokens.css не найден токен --dn-tag-padding');
    }
    const value = match[1] as string;
    expect(value.replace(/\s+/g, '')).toBe('2pxvar(--scp-spacing-sm)');
  });
});
