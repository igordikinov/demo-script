// «Общие» сценарии — SPEC §3.7 (:209–230), часть «В приложении» (:230). Чистые функции
// без React: fetch передаётся параметром (FetchFn), кэш сценариев — тоже; провайдер
// (store.tsx) держит один кэш до перезагрузки.
//
// - Индекс — `fetch('./scenarios/index.json')` при старте; путь относительный, потому
//   что `base: './'` (§3.7:230, §1:11). Ответ проверяется ScenarioIndexSchema — той же
//   схемой, которой его пишет `npm run scenarios` (src/model/scenarioIndex.ts).
// - Полный сценарий — `fetch('./scenarios/<id>.json')` при открытии; удачный результат
//   держится в памяти до перезагрузки, неудача не кэшируется — повтор идёт в сеть.
// - Ошибка — отклонённый fetch, статус не 2xx, тело не JSON (dev-сервер Vite на
//   отсутствующий файл отдаёт index.html со статусом 200) или ответ не по схеме.
// - id сценария проверяется по SHARED_ID_RE до запроса: он приходит и из адреса
//   (`?scenario=`, §4.7:320) и не должен превращаться в произвольный путь. id в ответе
//   должен совпадать с запрошенным — иначе файл не тот (SPEC этот случай не называет).
import { z } from 'zod';
import { ScenarioSchema, type Scenario } from '../model/schema.ts';
import { SHARED_ID_RE, ScenarioIndexSchema, type ScenarioIndex } from '../model/scenarioIndex.ts';

/** Индекс общих сценариев (§3.7:230). */
export const SHARED_INDEX_URL = './scenarios/index.json';

/** Сигнатура запроса; по умолчанию провайдер передаёт глобальный fetch. */
export type FetchFn = (url: string) => Promise<Response>;

/** Загруженные и загружаемые сценарии по id — до перезагрузки (§3.7:230). */
export type SharedCache = Map<string, Promise<Scenario>>;

/** Файл общего сценария: id без `my-` (§3.7:211), source 'repo' (§3.1:100). */
export const SharedScenarioSchema = ScenarioSchema.extend({
  id: z.string().regex(SHARED_ID_RE),
  source: z.literal('repo'),
});

/** Адрес файла общего сценария (§3.7:230). */
export function sharedScenarioUrl(id: string): string {
  return `./scenarios/${id}.json`;
}

/** Тело ответа как JSON; не 2xx или не JSON — отклонение. */
async function fetchJson(fetchFn: FetchFn, url: string): Promise<unknown> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return (await response.json()) as unknown;
}

/** Индекс общих (§3.7:219–230). Сеть, статус или схема — отклонение. */
export async function loadSharedIndex(fetchFn: FetchFn): Promise<ScenarioIndex> {
  return ScenarioIndexSchema.parse(await fetchJson(fetchFn, SHARED_INDEX_URL));
}

/**
 * Полный общий сценарий (§3.7:230) через кэш: повторный вызов с тем же id не идёт в
 * сеть. Неудачная загрузка из кэша удаляется. Недопустимый id — отклонение без запроса.
 */
export function loadSharedScenario(
  fetchFn: FetchFn,
  id: string,
  cache: SharedCache,
): Promise<Scenario> {
  if (!SHARED_ID_RE.test(id)) {
    return Promise.reject(new Error(`Invalid shared scenario id: ${id}`));
  }
  const cached = cache.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const promise = fetchJson(fetchFn, sharedScenarioUrl(id)).then((body) => {
    const scenario = SharedScenarioSchema.parse(body);
    if (scenario.id !== id) {
      throw new Error(`Shared scenario id mismatch: requested ${id}, got ${scenario.id}`);
    }
    return scenario;
  });
  cache.set(id, promise);
  // Обработчик вешается раньше, чем у вызывающего: к повтору запись уже удалена.
  promise.catch(() => {
    if (cache.get(id) === promise) {
      cache.delete(id);
    }
  });
  return promise;
}
