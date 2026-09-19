// @vitest-environment node
// ТК 11 (SPEC §8:407, дословно): «pmLink('snp', 'urovni-sz') →
// …/process-map/?stage=4&node=urovni-sz; пустой и неизвестный узел → null».
// Данные — настоящие снимки src/data/pm/{snp,mrp}.json (pmSnapshots()); узел
// «urovni-sz» — из шага 1.3 tests/fixtures/deployment-demo.json. Третий,
// необязательный параметр pmLink (подставленный снимок, DN-15) нужен для
// теста на encodeURIComponent: ни один реальный id узла не меняется
// encodeURIComponent, иначе мутацию было бы нечем поймать; сам ТК 11
// (двухаргументный вызов) проверяется отдельно.
import { pmLink } from '../src/pm/pmLink';
import { pmSnapshots } from '../src/pm/snapshots';
import { PmSnapshotSchema, type PmSnapshot, type PmSnapshots } from '../src/pm/snapshot';

/** Снимок snp подменяется тестовым; mrp остаётся настоящим (в этих тестах не используется). */
function withSnpSnapshot(
  nodes: Record<string, number>,
  stages: { number: number; title: string }[],
): PmSnapshots {
  const snp: PmSnapshot = PmSnapshotSchema.parse({
    map: 'snp',
    title: 'Тестовая карта',
    sourceUpdatedAt: '2026-01-01',
    snapshotAt: '2026-01-01',
    stages,
    nodes,
  });
  return { ...pmSnapshots(), snp };
}

describe("ТК 11 (SPEC §8:407): pmLink('snp', 'urovni-sz') → …/process-map/?stage=4&node=urovni-sz; пустой и неизвестный узел → null", () => {
  it("pmLink('snp', 'urovni-sz') — узел шага 1.3 фикстуры, этап 4 карты snp", () => {
    expect(pmLink('snp', 'urovni-sz')).toEqual({
      stage: 4,
      stageTitle: 'Расчёт плана пополнения (DRP/Deployment) + Транспортбилдер',
      // URL — литералом, не из src/config.ts: подмена pmBase не должна остаться незамеченной.
      url: 'https://igordikinov.github.io/process-map/?stage=4&node=urovni-sz',
    });
  });

  it('пустой узел → null', () => {
    expect(pmLink('snp', '')).toBeNull();
  });

  it('неизвестный узел → null', () => {
    expect(pmLink('snp', 'no-such-node')).toBeNull();
  });

  it.each(['constructor', '__proto__', 'toString'])(
    '%s не совпадает со свойством прототипа → null (Object.hasOwn, а не `in`, snapshot.ts:100)',
    (node) => {
      expect(pmLink('snp', node)).toBeNull();
    },
  );

  it("pmLink('mrp', 'analiz-preduprezhdeniy') — своя карта mrp, этап 2", () => {
    const link = pmLink('mrp', 'analiz-preduprezhdeniy');
    expect(link?.url).toBe(
      'https://igordikinov.github.io/process-map/mrp/?stage=2&node=analiz-preduprezhdeniy',
    );
    expect(link?.stageTitle).toBe('Обработка ошибок и предупреждений');
  });

  it("pmLink('snp', 'analiz-preduprezhdeniy') — тот же узел на карте snp даёт другой этап: одна карта не подменяет другую", () => {
    expect(pmLink('snp', 'analiz-preduprezhdeniy')?.stage).toBe(3);
  });

  it("pmLink('mrp', 'urovni-sz') — узла карты snp нет на карте mrp → null", () => {
    expect(pmLink('mrp', 'urovni-sz')).toBeNull();
  });

  it('encodeURIComponent узла в url: пробел, амперсанд, слэш, кириллица', () => {
    const snapshots = withSnpSnapshot({ 'a b&c/д': 1 }, [{ number: 1, title: 'Этап один' }]);
    const link = pmLink('snp', 'a b&c/д', snapshots);
    expect(link?.url.endsWith('?stage=1&node=a%20b%26c%2F%D0%B4')).toBe(true);
  });

  it('в url нет параметра version (SPEC §4.6:304 — версия карты по умолчанию)', () => {
    const link = pmLink('snp', 'urovni-sz');
    expect(link?.url.includes('version')).toBe(false);
  });

  it('узел ссылается на этап, которого нет в stages, → null', () => {
    const snapshots = withSnpSnapshot({ orphan: 9 }, [{ number: 1, title: 'Этап один' }]);
    expect(pmLink('snp', 'orphan', snapshots)).toBeNull();
  });
});
