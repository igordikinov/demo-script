// Снимок карты процесса — SPEC §3.4 (:145–169): src/data/pm/<map>.json.
// Навигатор не ходит в сеть за картой: узлы берутся из снимка, который
// собирает scripts/pm-snapshot.ts из process-map/src/data/<map>/process.json.
//
// Без React, DOM и Node: модуль импортируют и приложение (pmLink, §4.6), и
// Node-скрипты через --experimental-strip-types. Поэтому относительные импорты
// — с расширением .ts, импорт типов — только с `type`, без enum/namespace.
//
// Сообщения ошибок здесь — для автора, запускающего `npm run pm:snapshot` в
// консоли, а не строки интерфейса. Поэтому они не вынесены в src/i18n/ru.ts.
import { z } from 'zod';
import { ScenarioSchema } from '../model/schema.ts';

/** Карта процесса. Список карт один — из модели сценария (SPEC §3.1, поле `map`). */
export const PmMapSchema = ScenarioSchema.shape.map;
export type PmMap = z.infer<typeof PmMapSchema>;
/** Все карты, для которых собирается снимок: ['snp', 'mrp']. */
export const PM_MAPS = PmMapSchema.options;

// Дата без времени — тот же формат, что `updatedAt` в process-map/src/data/schema.ts.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DateSchema = z.string().regex(DATE_RE);

/** Файл снимка (SPEC §3.4:157–164). */
export const PmSnapshotSchema = z
  .object({
    map: PmMapSchema,
    title: z.string(),
    sourceUpdatedAt: DateSchema, // updatedAt карты
    snapshotAt: DateSchema, // локальная дата сборки снимка
    stages: z
      .array(z.object({ number: z.number().int().min(1), title: z.string() }).strict())
      .min(1),
    nodes: z.record(z.string().min(1), z.number().int().min(1)), // id узла → номер этапа
  })
  .strict();
export type PmSnapshot = z.infer<typeof PmSnapshotSchema>;
/** Снимки всех карт — третий параметр readWorkbook (проверки W04, I03, SPEC §3.5:187, :191). */
export type PmSnapshots = Readonly<Record<PmMap, PmSnapshot>>;

// Только нужные поля process.json из process-map. Без .strict(): остальные
// поля карты (позиции, связи, группы, …) снимку не нужны и отбрасываются.
const SourceSchema = z.object({
  title: z.string(),
  updatedAt: DateSchema,
  stages: z
    .array(
      z.object({
        number: z.number().int().min(1),
        title: z.string(),
        nodes: z.array(z.object({ id: z.string().min(1) })),
      }),
    )
    .min(1),
});

/** Локальная дата в формате ГГГГ-ММ-ДД. Не toISOString(): та даёт дату по UTC. */
export function formatLocalDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(корень)'}: ${issue.message}`,
    )
    .join('; ');
}

/**
 * Собирает снимок карты из разобранного process.json.
 * Бросает Error, если источник не подходит, `snapshotAt` не ГГГГ-ММ-ДД,
 * номер этапа повторяется или один id узла встречается дважды.
 */
export function buildSnapshot(processJson: unknown, map: PmMap, snapshotAt: string): PmSnapshot {
  const source = SourceSchema.safeParse(processJson);
  if (!source.success) {
    throw new Error(
      `карта ${map}: неверная структура process.json — ${formatIssues(source.error)}`,
    );
  }
  if (!DATE_RE.test(snapshotAt)) {
    throw new Error(`карта ${map}: дата снимка «${snapshotAt}» не в формате ГГГГ-ММ-ДД`);
  }

  const stageNumbers = new Set<number>();
  for (const stage of source.data.stages) {
    if (stageNumbers.has(stage.number)) {
      throw new Error(`карта ${map}: номер этапа ${stage.number} встречается дважды`);
    }
    stageNumbers.add(stage.number);
  }

  const nodes: Record<string, number> = {};
  for (const stage of source.data.stages) {
    for (const node of stage.nodes) {
      // Object.hasOwn, а не `in`: id вроде «constructor» не должен совпасть с прототипом.
      const existing = Object.hasOwn(nodes, node.id) ? nodes[node.id] : undefined;
      if (existing !== undefined) {
        throw new Error(
          `карта ${map}: узел «${node.id}» встречается дважды — в этапах ${existing} и ${stage.number}`,
        );
      }
      nodes[node.id] = stage.number;
    }
  }

  const stages = source.data.stages
    .map((stage) => ({ number: stage.number, title: stage.title }))
    .sort((a, b) => a.number - b.number);

  return PmSnapshotSchema.parse({
    map,
    title: source.data.title,
    sourceUpdatedAt: source.data.updatedAt,
    snapshotAt,
    stages,
    nodes,
  });
}

// Рекурсивная сортировка ключей объектов; порядок элементов массивов сохраняется.
// Сравнение по кодам UTF-16 (sort() без компаратора), а не localeCompare:
// тот зависит от ICU и локали, и вывод различался бы между машинами.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeys(src[key]);
    return out;
  }
  return value;
}

/** Текст файла снимка: ключи отсортированы, отступ 2, LF, перевод строки в конце (SPEC §3.4:167). */
export function serializeSnapshot(snapshot: PmSnapshot): string {
  return JSON.stringify(sortKeys(snapshot), null, 2) + '\n';
}
