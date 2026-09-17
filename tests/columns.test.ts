// @vitest-environment node
// SPEC §3.2 (:104-130): контракт колонок шаблона. Таблица §3.2:118-128
// сверяется посимвольно с SPEC.md (как ru.test.ts сверяет §3.5) — правка
// таблицы должна ронять этот тест, а не переписываться сюда руками (план
// DN-05, раздел 3.A).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COLUMNS, normalizeHeader, matchHeader, type ColumnSpec } from '../src/excel/columns';
import type { Step } from '../src/model/schema';

const specPath = fileURLToPath(new URL('../SPEC.md', import.meta.url));
const specLines = readFileSync(specPath, 'utf8').split(/\r?\n/);
const ROW = /^\| `(\w+)` \| `([^`]+)` \| (.+) \| (да|нет) \|$/;

function parseAliases(cell: string): string[] {
  if (cell.trim() === '—') return [];
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
}

function parseColumnsFromSpec(): ColumnSpec[] {
  const rows: ColumnSpec[] = [];
  for (const line of specLines) {
    const m = ROW.exec(line);
    if (!m) continue;
    rows.push({
      field: m[1] as keyof Step,
      header: m[2] as string,
      aliases: parseAliases(m[3] as string),
      required: m[4] === 'да',
    });
  }
  return rows;
}

describe('COLUMNS: ровно таблица §3.2:118-128 из SPEC.md, порядок важен', () => {
  const fromSpec = parseColumnsFromSpec();

  it('в SPEC.md ровно 9 строк колонок', () => {
    expect(fromSpec.length).toBe(9);
  });

  it('COLUMNS совпадает построчно с таблицей SPEC.md', () => {
    expect(COLUMNS).toEqual(fromSpec);
  });
});

describe('matchHeader: распознаёт заголовок и все алиасы (SPEC §3.2:118-128)', () => {
  const fromSpec = parseColumnsFromSpec();
  const cases = fromSpec.flatMap((col) =>
    [col.header, ...col.aliases].map((name) => ({ name, field: col.field })),
  );

  it.each(cases.map(({ name, field }) => [name, field] as const))('%s → %s', (name, field) => {
    expect(matchHeader(name)).toBe(field);
    expect(matchHeader(name.toUpperCase())).toBe(field);
  });
});

describe('normalizeHeader (SPEC §3.2:116): нижний регистр, ё→е, пробелы схлопнуты, обрезаны .:* по краям', () => {
  it.each([
    [' №  ШАГА* ', '№ шага'],
    ['Ожидаемый\nрезультат:', 'ожидаемый результат'],
    ['. Шаг :*', 'шаг'],
    ['Ёж ё', 'еж е'],
    ['Узел карты', 'узел карты'],
    ['Бизнес-ценность', 'бизнес-ценность'],
  ])('normalizeHeader(%j) === %j', (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });
});

describe('matchHeader: точечные случаи', () => {
  it.each([
    ['URL', 'url'],
    ['*№*', 'id'],
    // Мутация «без ё→е» ловится этим кейсом (план, раздел A).
    ['Узёл', 'node'],
    ['Лишняя', undefined],
    ['', undefined],
  ])('matchHeader(%j) === %j', (input, expected) => {
    expect(matchHeader(input)).toBe(expected);
  });
});
