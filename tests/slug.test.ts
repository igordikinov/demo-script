// @vitest-environment node
// SPEC §3.6:203 «слаг названия (транслитерация кириллицы как в process-map,
// [^a-z0-9]+ → -, не длиннее 48 символов)» — правило DN-05 переиспользует для
// id из имени файла (§3.1:100). Таблица переноса и значения сверены прогоном
// прототипа на process-map/src/data/bpmn/ids.ts (план DN-05, раздел 3.B).
import { slugify } from '../src/model/slug';
import { ScenarioSchema } from '../src/model/schema';

describe('slugify (SPEC §3.6:203)', () => {
  it.each([
    ['абвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'x', 'abvgdeezhziyklmnoprstufhcchshschyeyuya'],
    ['АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'x', 'abvgdeezhziyklmnoprstufhcchshschyeyuya'],
    ['Демо 1', 'scenario', 'demo-1'],
    ['Щука ёжик Юля ЦХ', 'scenario', 'schuka-ezhik-yulya-ch'],
    ['Deployment — демо-сценарий', 'scenario', 'deployment-demo-scenariy'],
    ['Ъь --- !!', 'scenario', 'scenario'],
  ])('slugify(%j, %j) === %j', (value, fallback, expected) => {
    expect(slugify(value, fallback)).toBe(expected);
  });

  it('обрезка по пробелу не длиннее 48: "a".repeat(30) + " " + "b".repeat(30) → "a".repeat(30)', () => {
    expect(slugify('a'.repeat(30) + ' ' + 'b'.repeat(30), 'x')).toBe('a'.repeat(30));
  });

  it('обрезка ровно по лимиту 48 без разделителя: "a".repeat(60) → "a".repeat(48)', () => {
    expect(slugify('a'.repeat(60), 'x')).toBe('a'.repeat(48));
  });

  it('обрезка по последнему дефису внутри лимита: "ab-" + "c".repeat(46) + "-d" → "ab"', () => {
    expect(slugify('ab-' + 'c'.repeat(46) + '-d', 'x')).toBe('ab');
  });

  it('пользовательский maxLength: slugify("abc-def", "x", 5) === "abc"', () => {
    expect(slugify('abc-def', 'x', 5)).toBe('abc');
  });

  it.each([
    ['абвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'x'],
    ['Демо 1', 'scenario'],
    ['Щука ёжик Юля ЦХ', 'scenario'],
    ['Deployment — демо-сценарий', 'scenario'],
    ['Ъь --- !!', 'scenario'],
  ])('результат slugify(%j) проходит ScenarioSchema.shape.id (SPEC §3.1:89)', (value, fallback) => {
    const result = slugify(value, fallback);
    expect(ScenarioSchema.shape.id.safeParse(result).success).toBe(true);
  });

  it.each([
    ['a'.repeat(30) + ' ' + 'b'.repeat(30), 'x'],
    ['a'.repeat(60), 'x'],
    ['ab-' + 'c'.repeat(46) + '-d', 'x'],
  ])('результат обрезки тоже проходит ScenarioSchema.shape.id', (value, fallback) => {
    const result = slugify(value, fallback);
    expect(ScenarioSchema.shape.id.safeParse(result).success).toBe(true);
  });

  it('результат slugify("abc-def", "x", 5) проходит ScenarioSchema.shape.id', () => {
    expect(ScenarioSchema.shape.id.safeParse(slugify('abc-def', 'x', 5)).success).toBe(true);
  });
});
