// @vitest-environment node
// Условие E07 (SPEC §3.5:183, дословно): «`url` не пуст и не начинается с
// `http://` / `https://`» → danger, блокирует загрузку. `isScreenUrl` — та же
// проверка «непусто и http(s)», но со знаком плюс (используется там, где
// нужно решить «есть ссылка / нет ссылки», а не собрать отчёт валидатора).
// Сам ТК 4 (SPEC §8:396: «http://… → W01; ftp://x и экран → E07; пустая
// ссылка → W02») проверяется в `validate` — это DN-06, tests/validate.test.ts;
// здесь проверяется только условие, а не отчёт с уровнями и текстами.
import { isScreenUrl } from '../src/model/url';

describe('isScreenUrl (SPEC §3.5:183, решение владельца DN-dkb)', () => {
  it.each(['https://x', 'http://x'])('%s → true (начинается с http:// или https://)', (url) => {
    expect(isScreenUrl(url)).toBe(true);
  });

  it.each([
    '',
    'javascript:alert(1)',
    'ftp://x',
    'экран',
    ' https://x',
    'HTTPS://x',
    // Граничные случаи: похожи на префикс, но не содержат '//' целиком —
    // ловят мутацию isScreenUrl → url.startsWith('http').
    'http:x',
    'https:/x',
  ])('%s → false', (url) => {
    expect(isScreenUrl(url)).toBe(false);
  });
});
