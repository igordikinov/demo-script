// «Мои» сценарии — SPEC §3.6 (:199–207): библиотека в localStorage. Чистые функции без
// React: хранилище передаётся параметром (LibraryStorage), поэтому тесты подменяют его
// объектом в памяти, а провайдер (store.tsx) — берёт window.localStorage через
// getBrowserStorage(). Операции add/replace/remove ничего не пишут: считают новый
// список, запись — writeLibrary, решение «применять ли» — у провайдера (§3.6:205).
//
// - Ключ и формат — §3.6:201: `{ schema: 1, items: Scenario[] }`, у всех source 'local'.
// - Чтение при старте — §3.6:202: элемент не по схеме выбрасывается, ключ
//   перезаписывается очищенным; нечитаемый JSON — ключ удаляется. Верхний уровень,
//   который читается, но не `{ schema: 1, items: [] }`, считается нечитаемым: SPEC этот
//   случай не называет, «Мои» пусты, как при битом JSON.
// - Элемент с source 'repo' или id без `my-` в хранилище не по схеме (§3.6:201, :203) —
//   выбрасывается так же, как битый.
// - id нового — §3.6:203: `my-` + слаг названия (лимит 48 — у слага, без префикса и
//   суффикса), пустой слаг — `scenario`, как у временного id разбора (§3.1:100).
// - Порядок — §3.6:204: по loadedAt, новые сверху; сортировка стабильная, при равном
//   loadedAt только что сохранённый — выше.
// - Все обращения к хранилищу — в try/catch (§3.6:206): iframe с sandbox без
//   allow-same-origin бросает уже на доступе к window.localStorage.
// - Квота — §3.6:205: QuotaExceededError, Firefox NS_ERROR_DOM_QUOTA_REACHED и старый
//   code 22 дают 'quota'; любое другое исключение — 'unavailable'.
// Активный сценарий и шаг здесь не пишутся — они живут в адресе (§3.6:207).
import { z } from 'zod';
import { ScenarioSchema, type Scenario } from '../model/schema.ts';
import { slugify } from '../model/slug.ts';

/** Ключ localStorage (§3.6:201). */
export const LIBRARY_KEY = 'demo-navigator:library:v1';

/** Префикс id «моего» сценария (§3.1:89, §3.6:203). */
const LOCAL_ID_PREFIX = 'my-';

/** Слаг из одних знаков — как у временного id разбора (§3.1:100). */
const LOCAL_ID_FALLBACK = 'scenario';

/** Часть Storage, которой пользуется библиотека. */
export type LibraryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Итог записи: `quota` — места нет (§3.6:205), `unavailable` — хранилище недоступно (§3.6:206). */
export type WriteResult = 'ok' | 'quota' | 'unavailable';

/** Итог чтения при старте. `available: false` — хранилище недоступно (§3.6:206). */
export interface LibraryRead {
  items: Scenario[];
  available: boolean;
}

/** Новый список после добавления или замены и сохранённый сценарий. */
export interface LibraryChange {
  items: Scenario[];
  saved: Scenario;
}

/** Сценарий из библиотеки: id `my-…`, source 'local' (§3.6:201, :203). */
export const LocalScenarioSchema = ScenarioSchema.extend({
  id: z.string().regex(/^my-[a-z0-9-]+$/),
  source: z.literal('local'),
});

/** Верхний уровень значения ключа; элементы проверяются по одному (§3.6:202). */
const LibraryEnvelopeSchema = z.object({
  schema: z.literal(1),
  items: z.array(z.unknown()),
});

/** window.localStorage или `null`, если доступ бросает (iframe с sandbox, §3.6:206) или DOM нет. */
export function getBrowserStorage(): LibraryStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Элементы из сырого значения ключа; `null` — JSON нечитаем или верхний уровень не тот. */
function parseItems(raw: string): unknown[] | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const envelope = LibraryEnvelopeSchema.safeParse(value);
  return envelope.success ? envelope.data.items : null;
}

/**
 * Чтение при старте (§3.6:202). Идемпотентно: на уже очищенных данных не пишет —
 * StrictMode вызывает инициализатор useReducer дважды. Не бросает.
 */
export function readLibrary(storage: LibraryStorage | null): LibraryRead {
  if (storage === null) {
    return { items: [], available: false };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(LIBRARY_KEY);
  } catch {
    return { items: [], available: false };
  }
  if (raw === null) {
    return { items: [], available: true };
  }
  const rawItems = parseItems(raw);
  if (rawItems === null) {
    try {
      storage.removeItem(LIBRARY_KEY);
    } catch {
      return { items: [], available: false };
    }
    return { items: [], available: true };
  }
  const kept: Scenario[] = [];
  for (const item of rawItems) {
    const parsed = LocalScenarioSchema.safeParse(item);
    if (parsed.success) {
      kept.push(parsed.data);
    }
  }
  // Перезапись очищенным — в порядке хранилища; сортировка — только в ответе.
  const available =
    kept.length === rawItems.length || writeLibrary(storage, kept) !== 'unavailable';
  return { items: sortLibrary(kept), available };
}

/** Признак нехватки места (§3.6:205) в разных браузерах. */
export function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = 'name' in error ? error.name : undefined;
  const code = 'code' in error ? error.code : undefined;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22;
}

/** Запись целиком (§3.6:205). Не бросает. */
export function writeLibrary(
  storage: LibraryStorage | null,
  items: readonly Scenario[],
): WriteResult {
  if (storage === null) {
    return 'unavailable';
  }
  try {
    storage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items }));
    return 'ok';
  } catch (error) {
    return isQuotaError(error) ? 'quota' : 'unavailable';
  }
}

/** id нового «моего» (§3.6:203): `my-` + слаг названия; занят — `-2`, `-3`… */
export function newLocalId(title: string, takenIds: Iterable<string>): string {
  const taken = new Set(takenIds);
  const base = `${LOCAL_ID_PREFIX}${slugify(title, LOCAL_ID_FALLBACK)}`;
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** Момент loadedAt для сортировки; нечитаемая дата — NaN, уходит в конец. */
function compareNewestFirst(a: number, b: number): number {
  const aBad = Number.isNaN(a);
  const bBad = Number.isNaN(b);
  if (aBad || bBad) {
    return aBad === bBad ? 0 : aBad ? 1 : -1;
  }
  return b - a;
}

/** Порядок каталога (§3.6:204): по loadedAt, новые сверху. Стабильно, вход не меняется. */
export function sortLibrary(items: readonly Scenario[]): Scenario[] {
  return items
    .map((item) => ({ item, time: Date.parse(item.loadedAt) }))
    .sort((a, b) => compareNewestFirst(a.time, b.time))
    .map(({ item }) => item);
}

/**
 * Добавление (§3.6:203, §3.1:100): новый id `my-…`, source 'local', `loadedAt` —
 * переданный момент. Сохранённый ставится первым до сортировки — при равном loadedAt
 * он выше. Вход не меняется.
 */
export function addToLibrary(
  items: readonly Scenario[],
  scenario: Scenario,
  loadedAt: string,
): LibraryChange {
  const id = newLocalId(
    scenario.title,
    items.map((item) => item.id),
  );
  const saved: Scenario = { ...scenario, id, source: 'local', loadedAt };
  return { items: sortLibrary([saved, ...items]), saved };
}

/**
 * Замена (§4.8:343): id прежний — ссылки `?scenario=my-…` продолжают работать
 * (§3.6:203), loadedAt новый, сценарий поднимается наверх. Неизвестный id — `null`.
 */
export function replaceInLibrary(
  items: readonly Scenario[],
  id: string,
  scenario: Scenario,
  loadedAt: string,
): LibraryChange | null {
  if (findInLibrary(items, id) === undefined) {
    return null;
  }
  const saved: Scenario = { ...scenario, id, source: 'local', loadedAt };
  const rest = items.filter((item) => item.id !== id);
  return { items: sortLibrary([saved, ...rest]), saved };
}

/** Список без сценария `id`. Вход не меняется. */
export function removeFromLibrary(items: readonly Scenario[], id: string): Scenario[] {
  return items.filter((item) => item.id !== id);
}

/** «Мой» сценарий по id — для ссылки `?scenario=my-…` (§4.7:320). */
export function findInLibrary(items: readonly Scenario[], id: string): Scenario | undefined {
  return items.find((item) => item.id === id);
}
