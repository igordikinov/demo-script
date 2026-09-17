// @vitest-environment node
// SPEC §3.4 (:145-169): снимок карты процесса src/data/pm/<map>.json,
// собранный `npm run pm:snapshot` (план DN-07 шаг D5). Числа и сопоставления
// ниже верны для снимка от 2026-09-17 из process-map (updatedAt карт
// 2026-09-01, план DN-07 §1 «Комментарий в тесте»). Если снимок законно
// пересобран из новой версии process-map, числа/сопоставления обновляются
// отдельной задачей — тест не подгоняется молча.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PmSnapshotSchema, serializeSnapshot, type PmSnapshot } from '../src/pm/snapshot';

function loadSnapshot(map: 'snp' | 'mrp'): { parsed: PmSnapshot; text: string } {
  const path = fileURLToPath(new URL(`../src/data/pm/${map}.json`, import.meta.url));
  const text = readFileSync(path, 'utf8');
  const parsed = PmSnapshotSchema.parse(JSON.parse(text));
  return { parsed, text };
}

function describeSnapshotFile(map: 'snp' | 'mrp', stageCount: number, nodeCount: number): void {
  describe(`src/data/pm/${map}.json`, () => {
    it(`проходит PmSnapshotSchema.parse, map === '${map}'`, () => {
      const { parsed } = loadSnapshot(map);
      expect(parsed.map).toBe(map);
    });

    it(`этапов ${stageCount}, узлов ${nodeCount}`, () => {
      const { parsed } = loadSnapshot(map);
      expect(parsed.stages.length).toBe(stageCount);
      expect(Object.keys(parsed.nodes).length).toBe(nodeCount);
    });

    it('каждое значение nodes есть среди номеров этапов', () => {
      const { parsed } = loadSnapshot(map);
      const stageNumbers = new Set(parsed.stages.map((s) => s.number));
      for (const stage of Object.values(parsed.nodes)) {
        expect(stageNumbers.has(stage)).toBe(true);
      }
    });

    it('файл побайтово равен serializeSnapshot(parsed) — канонический формат, не правлен руками и не прогнан через prettier', () => {
      const { parsed, text } = loadSnapshot(map);
      expect(text).toBe(serializeSnapshot(parsed));
    });
  });
}

describeSnapshotFile('snp', 4, 103);
describeSnapshotFile('mrp', 4, 17);

describe('src/data/pm/snp.json: факты SPEC §11 вопрос 1 и §3.4:169', () => {
  it('urovni-sz -> этап 4 (ТК 11, §4.6)', () => {
    const { parsed } = loadSnapshot('snp');
    expect(parsed.nodes['urovni-sz']).toBe(4);
  });

  it('raschet-plana-popolneniya-raspredeleniya-deployment -> этап 4', () => {
    const { parsed } = loadSnapshot('snp');
    expect(parsed.nodes['raschet-plana-popolneniya-raspredeleniya-deployment']).toBe(4);
  });

  it('korrektirovka-plana-peremescheniy -> этап 3', () => {
    const { parsed } = loadSnapshot('snp');
    expect(parsed.nodes['korrektirovka-plana-peremescheniy']).toBe(3);
  });

  it('analiz-preduprezhdeniy -> этап 3', () => {
    const { parsed } = loadSnapshot('snp');
    expect(parsed.nodes['analiz-preduprezhdeniy']).toBe(3);
  });

  it.each([
    'raschet-plana-popolneniya-raspredeleniya',
    'vnesenie-ruchnyh-korrektirovok',
    'rabota-s-monitorom-preduprezhdeniy',
    'tlb',
  ])('узла %s на карте SNP нет (SPEC:169)', (nodeId) => {
    const { parsed } = loadSnapshot('snp');
    expect(parsed.nodes[nodeId]).toBeUndefined();
  });
});
