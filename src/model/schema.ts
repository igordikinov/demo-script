// Модель сценария — SPEC §3.1 (:67–102), общий контракт (SPEC:438): правит один агент.
// Одна схема проверяет сценарий из Excel, из localStorage и из public/scenarios/ (SPEC §1:13).
// Без React и DOM: файл импортируют Node-скрипты через --experimental-strip-types.
import { z } from 'zod';

export const StepSchema = z.object({
  id: z.string().min(1), // «1.10» — всегда строка
  title: z.string().min(1),
  action: z.string(), // пустая строка = не заполнено
  screen: z.string(), // название экрана
  url: z.string(), // абсолютный http(s)-URL или ''
  value: z.string(), // бизнес-ценность, посыл клиенту
  result: z.string(),
  comment: z.string(),
  node: z.string(), // id узла карты процесса или ''
});
export const BlockSchema = z.object({
  n: z.number().int().positive(), // порядковый номер листа среди листов-блоков, с 1
  title: z.string().min(1),
  sheet: z.string(), // имя листа — для отчёта
  steps: z.array(StepSchema).min(1),
});
export const ScenarioSchema = z.object({
  schema: z.literal(1),
  id: z.string().regex(/^(my-)?[a-z0-9-]+$/), // общий: имя файла; мой: my-… (§3.6)
  source: z.enum(['repo', 'local']),
  title: z.string().min(1),
  module: z.string(), // «SNP», «MRP» или ''
  map: z.enum(['snp', 'mrp']), // какая карта процесса
  fileName: z.string(),
  loadedAt: z.string(), // ISO; общий — дата последнего коммита файла, мой — время загрузки
  blocks: z.array(BlockSchema).min(1),
});

/** Шаг сценария (SPEC §3.1). Поля, которых нет в файле, — пустые строки (SPEC:102). */
export type Step = z.infer<typeof StepSchema>;
/** Блок сценария — один лист-блок книги (SPEC §3.1, §3.2). */
export type Block = z.infer<typeof BlockSchema>;
/** Сценарий целиком (SPEC §3.1). */
export type Scenario = z.infer<typeof ScenarioSchema>;

/**
 * Сценарий из разбора книги — без `id`, `source` и `loadedAt` (SPEC §2:42, §3.1:100):
 * их проставляет тот, кто сохраняет, — библиотека (§3.6) или сборка общих (§3.7).
 */
export const RawScenarioSchema = ScenarioSchema.omit({ id: true, source: true, loadedAt: true });
/** Результат `readWorkbook` до сохранения (SPEC §2:42, §3.1:100). */
export type RawScenario = z.infer<typeof RawScenarioSchema>;
