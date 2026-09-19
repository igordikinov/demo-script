// Ссылка на узел карты процесса — SPEC §4.6:304. Узел берётся из снимка
// (§3.4:147): навигатор в сеть за картой не ходит. По ссылке строятся секция
// «Карта процесса» в карточке (§4.6:308–309) и встроенная карта (§4.6:311).
// null — «Узел процесса не сопоставлен»: узел пуст или его нет в снимке
// выбранной карты (то же условие, что W04, §3.5:187).
//
// Формат адреса — по process-map/SPEC.md §4.7: узел главнее этапа, stage — для
// читаемости ссылки. version не передаётся: нужна версия карты по умолчанию.
//
// Без React и DOM. Относительные импорты — с расширением .ts, как в src/pm/*.
import { pmBase } from '../config.ts';
import type { PmMap, PmSnapshots } from './snapshot.ts';
import { pmSnapshots } from './snapshots.ts';

/** Сопоставленный узел: этап карты и адрес узла (SPEC §4.6:304). */
export interface PmLink {
  readonly stage: number;
  readonly stageTitle: string;
  readonly url: string;
}

/**
 * Ссылка на узел `node` карты `map` или null, если узел не сопоставлен.
 * `snapshots` — для тестов: как третий аргумент readWorkbook и validate.
 */
export function pmLink(
  map: PmMap,
  node: string,
  snapshots: PmSnapshots = pmSnapshots(),
): PmLink | null {
  if (node === '') {
    return null;
  }
  const snapshot = snapshots[map];
  // Object.hasOwn, а не `in`: узел «constructor» не должен совпасть с прототипом.
  const stage = Object.hasOwn(snapshot.nodes, node) ? snapshot.nodes[node] : undefined;
  if (stage === undefined) {
    return null;
  }
  // Этапа нет в stages: без названия строку «Этап N · …» не собрать. Со снимками
  // из scripts/pm-snapshot.ts так не бывает — nodes собираются из stages.
  const stageEntry = snapshot.stages.find((candidate) => candidate.number === stage);
  if (stageEntry === undefined) {
    return null;
  }
  return {
    stage,
    stageTitle: stageEntry.title,
    url: pmBase[map] + '?stage=' + String(stage) + '&node=' + encodeURIComponent(node),
  };
}
