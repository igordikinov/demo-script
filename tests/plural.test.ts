// @vitest-environment node
// ТК 23 (SPEC §8:415) дословно + краевые случаи русской плюрализации.
// Формы существительных берутся из ru.nouns (SPEC §3.3:143), а не дублируются
// здесь строками, — иначе тест не поймает опечатку в формах ru.ts.
import { countRu, pluralRu } from '../src/i18n/plural';
import { ru } from '../src/i18n/ru';

const { step, sheet, block } = ru.nouns;

describe('plural: ТК 23', () => {
  it.each([
    [1, step, '1 шаг'],
    [2, step, '2 шага'],
    [5, step, '5 шагов'],
    [11, step, '11 шагов'],
    [21, step, '21 шаг'],
    [3, sheet, '3 листа'],
    [3, block, '3 блока'],
  ] as const)('countRu(%i, forms) → %s', (count, forms, expected) => {
    expect(countRu(count, forms)).toBe(expected);
  });
});

describe('plural: краевые случаи', () => {
  it.each([
    [0, step, '0 шагов'],
    [12, step, '12 шагов'],
    [13, step, '13 шагов'],
    [14, step, '14 шагов'],
    [22, step, '22 шага'],
    [101, step, '101 шаг'],
    [111, step, '111 шагов'],
  ] as const)('countRu(%i, forms) → %s', (count, forms, expected) => {
    expect(countRu(count, forms)).toBe(expected);
  });

  it('pluralRu возвращает только слово, без числа', () => {
    expect(pluralRu(5, step)).toBe('шагов');
  });
});
