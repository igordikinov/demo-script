// @vitest-environment node
// SPEC §3.3-§4.9: все строки интерфейса живут в src/i18n/ru.ts (CLAUDE.md).
// Коды §3.5 сверяются посимвольно с таблицей SPEC.md, а не переписываются
// сюда руками, — правка таблицы должна ронять этот тест (план DN-03).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ru } from '../src/i18n/ru';

const specPath = fileURLToPath(new URL('../SPEC.md', import.meta.url));
const specLines = readFileSync(specPath, 'utf8').split(/\r?\n/);
const CODE_ROW = /^\| ([EWI]0\d) \| (danger|warning|info) \| .+ \| «(.+)» \|$/;

type Code = 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06' | 'E07';
type CodeAll = Code | 'W01' | 'W02' | 'W03' | 'W04' | 'W05' | 'I01' | 'I02' | 'I03';

// Аргументы и подстановки для каждого кода — из плана DN-03, часть A3.
const CASES: Record<CodeAll, { args: readonly unknown[]; values: Record<string, string> }> = {
  E01: { args: [], values: {} },
  E02: { args: [], values: {} },
  E03: { args: [], values: {} },
  E04: { args: [], values: {} },
  E05: { args: [], values: {} },
  E06: { args: ['1.10', 'Блок 1', 7], values: { id: '1.10', sheet: 'Блок 1', row: '7' } },
  E07: { args: ['ftp://x'], values: { url: 'ftp://x' } },
  W01: { args: [], values: {} },
  W02: { args: [], values: {} },
  W03: { args: [], values: {} },
  W04: {
    args: ['urovni-sz', 'snp', '16.09.2026'],
    values: { node: 'urovni-sz', map: 'snp', date: '16.09.2026' },
  },
  W05: { args: [], values: {} },
  I01: { args: ['Лишняя'], values: { header: 'Лишняя' } },
  I02: { args: ['Комментарий'], values: { name: 'Комментарий' } },
  I03: { args: ['snp', '16.09.2026'], values: { map: 'snp', date: '16.09.2026' } },
};

function parseSpecCodes(): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of specLines) {
    const m = CODE_ROW.exec(line);
    if (m) map.set(m[1] as string, m[3] as string);
  }
  return map;
}

describe('ru.report.codes: все 15 кодов §3.5 дословно из SPEC.md', () => {
  const specCodes = parseSpecCodes();

  it('в таблице SPEC.md ровно 15 строк кодов', () => {
    expect(specCodes.size).toBe(15);
  });

  it('ru.report.codes содержит те же 15 ключей', () => {
    expect(Object.keys(ru.report.codes).sort()).toEqual([...specCodes.keys()].sort());
  });

  it.each([...specCodes.entries()])('%s совпадает с SPEC после подстановки', (code, template) => {
    const { args, values } = CASES[code as CodeAll];
    const expected = template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
    const fn = ru.report.codes[code as keyof typeof ru.report.codes] as (...a: unknown[]) => string;
    expect(fn(...args)).toBe(expected);
  });

  it('report.noRow — длинное тире (SPEC:193)', () => {
    expect(ru.report.noRow).toBe('—');
  });
});

describe('ru: формулы с числами', () => {
  it('summary.text (SPEC §3.3:143)', () => {
    expect(ru.summary.text({ sheets: 3, blocks: 3, steps: 29, withLink: 24 })).toBe(
      '3 листа → 3 блока · 29 шагов · 24 со ссылкой',
    );
  });

  it('importModal.added (SPEC:346)', () => {
    expect(ru.importModal.added(29)).toBe('Сценарий добавлен в „Мои“: 29 шагов');
  });

  it('importModal.updated (SPEC:346, троеточие — {steps} {шагов} как у added)', () => {
    expect(ru.importModal.updated(29)).toBe('Сценарий обновлён: 29 шагов');
  });

  it('scheme.summary (SPEC:261)', () => {
    expect(ru.scheme.summary(29, 24)).toBe('29 шагов · 24 со ссылкой');
  });

  it('scheme.blockSteps (SPEC:263)', () => {
    expect(ru.scheme.blockSteps(11)).toBe('11 шагов');
  });

  it('card.position (SPEC:273)', () => {
    expect(ru.card.position(1, 10, 11)).toBe('Блок 1 · шаг 10 из 11');
  });
});

describe('ru: выборочно по разделам, дословно из SPEC', () => {
  it('deleteDialog.body (SPEC:253)', () => {
    expect(ru.deleteDialog.body('X')).toBe(
      '„X“ будет удалён из этого браузера. Файл Excel на компьютере останется.',
    );
  });

  it('deepLink.notFoundLocal (SPEC:317, для my-…)', () => {
    expect(ru.deepLink.notFoundLocal('my-x')).toBe(
      'Сценарий „my-x“ не найден. „Мои“ сценарии есть только в том браузере, где их загрузили',
    );
  });

  it('deepLink.notFoundShared (SPEC:317, для общих)', () => {
    expect(ru.deepLink.notFoundShared('x')).toBe('Сценарий „x“ не найден');
  });

  it('importModal.duplicate (SPEC:337)', () => {
    expect(ru.importModal.duplicate('X', '16.09.2026')).toBe(
      'В „Моих“ уже есть сценарий „X“, загружен 16.09.2026.',
    );
  });

  it('importModal.addAsNewOption (SPEC:340)', () => {
    expect(ru.importModal.addAsNewOption('X (2)')).toBe('Добавить как новый — „X (2)“');
  });

  it('importModal.numberedTitle (SPEC:340, суффиксы (2), (3)…)', () => {
    expect(ru.importModal.numberedTitle('X', 3)).toBe('X (3)');
  });

  it('processMap.stage (SPEC:304)', () => {
    expect(ru.processMap.stage(4, 'Обогащение прогноза заказами')).toBe(
      'Этап 4 · Обогащение прогноза заказами',
    );
  });

  it('library.quotaExceeded (SPEC:203)', () => {
    expect(ru.library.quotaExceeded).toBe(
      'Не хватает места в браузере — удалите ненужные сценарии',
    );
  });

  it('shared.loadFailed (SPEC:228)', () => {
    expect(ru.shared.loadFailed).toBe('Не удалось загрузить общие сценарии');
  });

  it('header.back (SPEC:239, текст без иконки-шеврона — план DN-03 п.0.3)', () => {
    expect(ru.header.back).toBe('Сценарии');
  });

  it('catalog.localEmpty (SPEC:255)', () => {
    expect(ru.catalog.localEmpty).toBe(
      'Загрузите сценарий из Excel — он появится здесь и сохранится в этом браузере. ' +
        'Чтобы сценарий видели все, положите файл в папку scenarios/ репозитория.',
    );
  });

  it('card.valueEmpty (SPEC:277)', () => {
    expect(ru.card.valueEmpty).toBe(
      'Поле не заполнено. Добавьте бизнес-ценность в колонке „Бизнес-ценность“ файла сценария.',
    );
  });

  it('importModal.templateRules[1] (SPEC:330)', () => {
    expect(ru.importModal.templateRules[1]).toBe(
      'строка 1 — название блока (необязательно), строка 2 — заголовки: № шага · Шаг · Действие · ' +
        'Экран · Ссылка · Бизнес-ценность · Ожидаемый результат · Комментарий · Узел карты;',
    );
  });

  it('openScreen.popupBlocked (SPEC:350)', () => {
    expect(ru.openScreen.popupBlocked).toBe(
      'Браузер не дал открыть вкладку. Проверьте настройки встраивания',
    );
  });
});
