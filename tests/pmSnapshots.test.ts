// @vitest-environment node
// src/pm/snapshots.ts — ленивый загрузчик PmSnapshots из src/data/pm/*.json —
// третий аргумент readWorkbook внутри окна загрузки (readImportFile). Имя
// отличается от src/pm/snapshot.ts одной буквой — файл теста тоже назван
// отдельно от tests/snapshot.test.ts, который проверяет сам src/pm/snapshot.ts
// и формат файлов снимков. Здесь — только контракт загрузчика: он читает те же
// файлы, что и tests/pmData.test.ts, и мемоизирует результат.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pmSnapshots } from '../src/pm/snapshots';
import { PmSnapshotSchema } from '../src/pm/snapshot';

function loadJson(map: 'snp' | 'mrp'): unknown {
  const path = fileURLToPath(new URL(`../src/data/pm/${map}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('pmSnapshots', () => {
  it('snp.map === "snp", mrp.map === "mrp"', () => {
    const snapshots = pmSnapshots();
    expect(snapshots.snp.map).toBe('snp');
    expect(snapshots.mrp.map).toBe('mrp');
  });

  it('содержимое равно PmSnapshotSchema.parse(JSON из src/data/pm/<map>.json)', () => {
    const snapshots = pmSnapshots();
    expect(snapshots.snp).toEqual(PmSnapshotSchema.parse(loadJson('snp')));
    expect(snapshots.mrp).toEqual(PmSnapshotSchema.parse(loadJson('mrp')));
  });

  it('второй вызов возвращает тот же объект — результат запоминается', () => {
    expect(pmSnapshots()).toBe(pmSnapshots());
  });
});
