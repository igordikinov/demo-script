// @vitest-environment node
// Формат даты каталога (SPEC §4.2:253: «сегодня, ЧЧ:ММ», иначе ДД.ММ.ГГГГ) —
// тот же помощник переиспользует A4′ (§4.8:341, DN-25). now передаётся
// параметром, а ISO-строки собираются через new Date(local…).toISOString(),
// чтобы прогон не зависел от часового пояса машины (кроме последнего блока,
// который как раз проверяет локальное время явно).
import { formatScenarioDate } from '../src/i18n/date';
import { ru } from '../src/i18n/ru';

/** ISO конкретного локального момента — без ручного вычисления смещения. */
function localIso(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

const now = new Date(2026, 8, 18, 12, 0);

describe('formatScenarioDate: «сегодня, ЧЧ:ММ» (SPEC §4.2:253)', () => {
  it('18.09 10:42 при now 18.09 12:00 → «сегодня, 10:42»', () => {
    expect(formatScenarioDate(localIso(2026, 9, 18, 10, 42), now)).toBe(ru.catalog.today('10:42'));
  });

  it('18.09 09:05 при now 18.09 12:00 → «сегодня, 09:05» (ведущий ноль часа)', () => {
    expect(formatScenarioDate(localIso(2026, 9, 18, 9, 5), now)).toBe(ru.catalog.today('09:05'));
  });

  it('18.09 00:00 при now 18.09 23:59 → «сегодня, 00:00» (тот же день, разные концы суток)', () => {
    const lateNow = new Date(2026, 8, 18, 23, 59);
    expect(formatScenarioDate(localIso(2026, 9, 18, 0, 0), lateNow)).toBe(
      ru.catalog.today('00:00'),
    );
  });

  it('17.09 23:59 при now 18.09 00:05 → «17.09.2026» (соседние сутки, разница 6 минут)', () => {
    const earlyNow = new Date(2026, 8, 18, 0, 5);
    expect(formatScenarioDate(localIso(2026, 9, 17, 23, 59), earlyNow)).toBe('17.09.2026');
  });
});

describe('formatScenarioDate: ДД.ММ.ГГГГ — не сегодня (SPEC §4.2:253)', () => {
  it('05.01.2026 → «05.01.2026»', () => {
    expect(formatScenarioDate(localIso(2026, 1, 5, 12, 0), now)).toBe('05.01.2026');
  });

  it('18.09.2025 (тот же день и месяц, другой год) → «18.09.2025»', () => {
    expect(formatScenarioDate(localIso(2025, 9, 18, 12, 0), now)).toBe('18.09.2025');
  });

  it('18.08.2026 (тот же день и год, другой месяц) → «18.08.2026»', () => {
    expect(formatScenarioDate(localIso(2026, 8, 18, 12, 0), now)).toBe('18.08.2026');
  });

  it('19.09.2026 (следующий день) → «19.09.2026»', () => {
    expect(formatScenarioDate(localIso(2026, 9, 19, 12, 0), now)).toBe('19.09.2026');
  });
});

describe('formatScenarioDate: нечитаемая дата', () => {
  it("'oops' → ''", () => {
    expect(formatScenarioDate('oops', now)).toBe('');
  });
});

// TZ-кейсы — намеренно последними в файле: на Windows delete process.env.TZ не
// сбрасывает закешированный часовой пояс (проверено через node -e), поэтому
// секцию, которая его выставляет, восстанавливать не пытаемся.
describe('formatScenarioDate: местное время, а не UTC (SPEC §4.2:253, §4.8:341)', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Tokyo';
  });

  it('UTC-полночь по местному — уже следующий день; getUTC* дал бы «17.09.2026»', () => {
    const utcNow = new Date('2026-09-18T03:00:00Z');
    expect(formatScenarioDate('2026-09-17T16:30:00Z', utcNow)).toBe(ru.catalog.today('01:30'));
  });

  it('дата со смещением +03:00 переводится в местное время', () => {
    const utcNow = new Date('2026-09-18T12:00:00Z');
    expect(formatScenarioDate('2026-09-18T11:50:50+03:00', utcNow)).toBe(ru.catalog.today('17:50'));
  });
});
